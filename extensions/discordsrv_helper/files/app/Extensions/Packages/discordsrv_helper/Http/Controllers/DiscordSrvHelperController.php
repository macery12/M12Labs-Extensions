<?php

namespace Everest\Extensions\Packages\discordsrv_helper\Http\Controllers;

use Everest\Models\Server;
use Everest\Models\Subuser;
use Illuminate\Support\Str;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Everest\Exceptions\DisplayException;
use Psr\Http\Message\ResponseInterface;
use Symfony\Component\Yaml\Yaml;
use Everest\Models\ExtensionFileSnapshot;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Services\Extensions\ExtensionFileSnapshotService;
use Everest\Traits\Controllers\RespondsWithExtensionEnvelope;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\discordsrv_helper\Http\Requests\DiscordSrvHelperStatusRequest;
use Everest\Extensions\Packages\discordsrv_helper\Http\Requests\DiscordSrvHelperInstallRequest;
use Everest\Extensions\Packages\discordsrv_helper\Http\Requests\DiscordSrvHelperTokenRequest;
use Everest\Extensions\Packages\discordsrv_helper\Http\Requests\DiscordSrvHelperChannelRequest;
use Everest\Extensions\Packages\discordsrv_helper\Http\Requests\DiscordSrvHelperOwnerRequest;
use Everest\Extensions\Packages\discordsrv_helper\Http\Requests\DiscordSrvHelperSubuserAccessRequest;

/**
 * Installs and configures DiscordSRV for a single server.
 *
 * Mounted by the loader under
 * /api/client/servers/{server}/extensions/ext/discordsrv_helper, with the server
 * binding, client auth and the extensions.access gate applied there. The
 * package's route file declares no prefix and no middleware of its own.
 *
 * The install path is deliberately narrow. It used to accept a caller-supplied
 * jar_url, ask the panel to HEAD it, and then hand the resolved URL to Wings to
 * download — which made both the panel and the daemon fetch an arbitrary host
 * on request, with no validation at any redirect hop and a separate DNS
 * resolution on the Wings side that a rebinding attacker could point elsewhere.
 *
 * Now there is no caller-supplied URL at all. The panel resolves the latest
 * release from one pinned repository, checks every hop against a host
 * allowlist, downloads the asset itself under size and time limits, verifies it
 * really is a JAR, and streams those verified bytes to Wings. Wings never
 * receives a URL, so it never fetches anything.
 */
class DiscordSrvHelperController extends ClientApiController
{
    use RespondsWithExtensionEnvelope;

    private const EXTENSION_ID = 'discordsrv_helper';
    private const PLUGINS_DIR = '/plugins';
    private const DISCORDSRV_DIR = '/plugins/DiscordSRV';
    private const CONFIG_FILE = '/plugins/DiscordSRV/config.yml';
    private const TOKEN_FILE = '/plugins/DiscordSRV/.token';
    private const JAR_FILENAME = 'DiscordSRV.jar';

    /** The single upstream this package will install from. */
    private const RELEASE_API = 'https://api.github.com/repos/DiscordSRV/DiscordSRV/releases/latest';

    /**
     * Hosts the download may touch, checked at every redirect hop.
     *
     * GitHub serves release metadata from api.github.com and redirects asset
     * downloads to its object storage, so all three are required for a normal
     * install and nothing else is.
     */
    private const ALLOWED_HOSTS = [
        'api.github.com',
        'github.com',
        'objects.githubusercontent.com',
        'release-assets.githubusercontent.com',
    ];

    /** DiscordSRV releases are ~10-15 MB; this bounds a hostile response. */
    private const MAX_JAR_BYTES = 104_857_600;

    /** Smaller than this is not a plugin jar. */
    private const MIN_JAR_BYTES = 4_096;

    private const MAX_REDIRECTS = 5;

    /** Scratch directory for downloads, under the panel's own storage. */
    private const TEMP_DIR = 'app/discordsrv-helper';

    /** Bound on the release metadata document. */
    private const MAX_METADATA_BYTES = 1_048_576;

    public function __construct(
        private DaemonFileRepository $fileRepository,
        private ExtensionFileSnapshotService $snapshotService,
    ) {
        parent::__construct();
    }

    public function status(DiscordSrvHelperStatusRequest $request, Server $server): JsonResponse
    {
        $plugins = $this->fileRepository->setServer($server)->getDirectory(self::PLUGINS_DIR);

        $pluginJar = null;
        $hasDiscordSrvFolder = false;

        foreach ($plugins as $item) {
            $name = (string) Arr::get($item, 'name', '');
            $isFile = (bool) Arr::get($item, 'file', true);

            if (!$isFile && $name === 'DiscordSRV') {
                $hasDiscordSrvFolder = true;
            }

            if ($isFile && str_ends_with(strtolower($name), '.jar') && str_contains($name, 'DiscordSRV')) {
                $pluginJar = $name;
            }
        }

        $tokenPresent = false;
        $configPresent = false;

        if ($hasDiscordSrvFolder) {
            $discordSrvDir = $this->fileRepository->setServer($server)->getDirectory(self::DISCORDSRV_DIR);
            foreach ($discordSrvDir as $item) {
                $name = (string) Arr::get($item, 'name', '');
                $isFile = (bool) Arr::get($item, 'file', true);

                if ($isFile && $name === '.token') {
                    $tokenPresent = true;
                }
                if ($isFile && $name === 'config.yml') {
                    $configPresent = true;
                }
            }
        }

        return new JsonResponse([
            'installed' => !is_null($pluginJar),
            'plugin_jar' => $pluginJar,
            'plugin_folder_present' => $hasDiscordSrvFolder,
            'token_file_present' => $tokenPresent,
            'config_present' => $configPresent,
        ]);
    }

    public function install(DiscordSrvHelperInstallRequest $request, Server $server): JsonResponse
    {
        $asset = $this->resolveLatestAsset();
        $download = null;

        try {
            $download = $this->downloadVerifiedJar($asset['url']);
            $tempFile = $this->temporaryPath($download);

            // Wings is handed bytes the panel has already fetched and checked,
            // never a URL. That is what keeps the daemon out of the request:
            // it cannot resolve a host, follow a redirect, or be pointed at
            // anything by a caller.
            $response = $this->fileRepository
                ->setServer($server)
                ->putFile(self::PLUGINS_DIR . '/' . self::JAR_FILENAME, $tempFile);

            $this->ensureDaemonSuccess($response, $server, 'Failed to write the DiscordSRV jar.');

            return $this->extensionItemResponse('discordsrv_helper_install', [
                'installed' => true,
                'jar' => self::JAR_FILENAME,
                'release' => $asset['release'],
                'asset' => $asset['name'],
                // The digest of exactly what was written, so an operator can
                // check it against the upstream release.
                'sha256' => hash_file('sha256', $tempFile),
            ]);
        } finally {
            $this->discardTemporary($download);
        }
    }

    /**
     * Absolute path for one scratch filename.
     *
     * Every caller passes a bare filename this controller generated, so a path
     * can only ever be built inside TEMP_DIR — there is no argument that could
     * reach elsewhere.
     */
    private function temporaryPath(string $name): string
    {
        return storage_path(self::TEMP_DIR . '/' . basename($name));
    }

    /**
     * Remove one scratch file, addressed by name rather than by path.
     *
     * The target is rebuilt from storage_path() at the point of deletion and
     * the name is reduced to its basename, so this cannot reach outside the
     * package's own scratch directory whatever it is handed.
     */
    private function discardTemporary(?string $name): void
    {
        if ($name === null || !is_file($this->temporaryPath($name))) {
            return;
        }

        @unlink(storage_path(self::TEMP_DIR . '/' . basename($name)));
    }

    /**
     * Fail without echoing the daemon's own words.
     *
     * A Wings error body can carry filesystem paths, upstream response bodies
     * and connection detail. The caller gets a stable sentence and a
     * correlation id; the rest stays in the panel's log.
     */
    private function ensureDaemonSuccess(ResponseInterface $response, Server $server, string $message): void
    {
        $status = $response->getStatusCode();
        if ($status >= 200 && $status < 300) {
            return;
        }

        $correlationId = (string) Str::uuid();

        Log::error('discordsrv_helper: daemon rejected a file write', [
            'correlation_id' => $correlationId,
            'server_id' => $server->id,
            'status' => $status,
            'body' => Str::limit(trim((string) $response->getBody()), 2000),
        ]);

        throw new DisplayException(sprintf('%s Reference: %s', $message, $correlationId));
    }

    public function setToken(DiscordSrvHelperTokenRequest $request, Server $server): JsonResponse
    {
        $token = trim((string) $request->input('token'));

        $this->ensureDirectory($server, self::PLUGINS_DIR, 'DiscordSRV');

        $before = $this->safeGetContent($server, self::TOKEN_FILE);
        if (!is_null($before)) {
            $this->snapshotService->create($server, self::EXTENSION_ID, $request->user(), 'set-token', [
                self::TOKEN_FILE => $before,
            ]);
        }

        $this->fileRepository->setServer($server)->putContent(self::TOKEN_FILE, $token);

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    public function setGlobalChannel(DiscordSrvHelperChannelRequest $request, Server $server): JsonResponse
    {
        $channelId = (string) $request->input('channel_id');

        $before = $this->safeGetContent($server, self::CONFIG_FILE);
        if (is_null($before)) {
            return new JsonResponse([
                'error' => 'DiscordSRV config.yml was not found. Start the server once to let DiscordSRV generate its config, then try again.',
            ], 409);
        }

        $this->snapshotService->create($server, self::EXTENSION_ID, $request->user(), 'set-global-channel', [
            self::CONFIG_FILE => $before,
        ]);

        try {
            $config = Yaml::parse($before);
        } catch (\Throwable $exception) {
            return new JsonResponse([
                'error' => 'DiscordSRV config.yml could not be parsed as YAML. Use the revert feature or fix the file manually, then try again.',
            ], 422);
        }
        if (!is_array($config)) {
            $config = [];
        }

        $channels = Arr::get($config, 'Channels', []);
        if (!is_array($channels)) {
            $channels = [];
        }

        $channels['global'] = $channelId;
        $config['Channels'] = $channels;

        $yaml = Yaml::dump($config, 20, 2);
        if (!str_ends_with($yaml, "\n")) {
            $yaml .= "\n";
        }

        $this->fileRepository->setServer($server)->putContent(self::CONFIG_FILE, $yaml);

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    public function history(DiscordSrvHelperOwnerRequest $request, Server $server): JsonResponse
    {
        $snapshots = ExtensionFileSnapshot::query()
            ->where('server_id', $server->id)
            ->where('extension_id', self::EXTENSION_ID)
            ->with('actor')
            ->orderByDesc('id')
            ->limit(25)
            ->get();

        $data = $snapshots->map(fn (ExtensionFileSnapshot $s) => [
            'id' => $s->id,
            'action' => $s->action,
            'created_at' => $s->created_at,
            'actor' => $s->actor ? [
                'id' => $s->actor->id,
                'email' => $s->actor->email,
            ] : null,
        ])->values();

        return new JsonResponse([
            'object' => 'list',
            'data' => $data,
        ]);
    }

    public function revert(DiscordSrvHelperOwnerRequest $request, Server $server, int $snapshotId): JsonResponse
    {
        $snapshot = ExtensionFileSnapshot::query()
            ->where('server_id', $server->id)
            ->where('extension_id', self::EXTENSION_ID)
            ->where('id', $snapshotId)
            ->firstOrFail();

        $files = $this->snapshotService->decryptFiles($snapshot);
        foreach ($files as $path => $contents) {
            $this->fileRepository->setServer($server)->putContent($path, $contents);
        }

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    public function subusers(DiscordSrvHelperOwnerRequest $request, Server $server): JsonResponse
    {
        $subusers = Subuser::query()
            ->with('user')
            ->where('server_id', $server->id)
            ->get();

        $data = $subusers->map(fn (Subuser $s) => [
            'uuid' => $s->user->uuid,
            'email' => $s->user->email,
            'username' => $s->user->username,
            'disabled' => in_array(self::EXTENSION_ID, $s->disabled_extensions ?? [], true),
        ])->values();

        return new JsonResponse([
            'object' => 'list',
            'data' => $data,
        ]);
    }

    public function setSubuserAccess(DiscordSrvHelperSubuserAccessRequest $request, Server $server, string $subuserUuid): JsonResponse
    {
        $enabled = (bool) $request->input('enabled');

        $subuser = Subuser::query()
            ->where('server_id', $server->id)
            ->whereHas('user', fn ($q) => $q->where('uuid', $subuserUuid))
            ->firstOrFail();

        $disabled = $subuser->disabled_extensions ?? [];
        $disabled = array_values(array_unique(array_filter($disabled, 'is_string')));

        if ($enabled) {
            $disabled = array_values(array_filter($disabled, fn ($id) => $id !== self::EXTENSION_ID));
        } else {
            if (!in_array(self::EXTENSION_ID, $disabled, true)) {
                $disabled[] = self::EXTENSION_ID;
            }
        }

        $subuser->update(['disabled_extensions' => $disabled]);

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    private function ensureDirectory(Server $server, string $path, string $name): void
    {
        try {
            $this->fileRepository->setServer($server)->createDirectory($name, $path);
        } catch (\Throwable) {
            // Directory likely already exists; ignore.
        }
    }

    private function safeGetContent(Server $server, string $file): ?string
    {
        try {
            return $this->fileRepository->setServer($server)->getContent($file);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * The asset to install, from the one pinned upstream repository.
     *
     * @return array{name: string, url: string, release: string}
     *
     * @throws DisplayException
     */
    private function resolveLatestAsset(): array
    {
        try {
            $response = Http::timeout(15)
                ->connectTimeout(5)
                ->withHeaders(['Accept' => 'application/vnd.github+json'])
                ->withOptions($this->redirectPolicy())
                ->get(self::RELEASE_API);
        } catch (\Throwable $exception) {
            $this->logFailure('release lookup failed', $exception);

            throw new DisplayException('Could not reach the DiscordSRV release feed. Please try again.');
        }

        if (!$response->successful() || strlen($response->body()) > self::MAX_METADATA_BYTES) {
            throw new DisplayException('The DiscordSRV release feed returned an unexpected response.');
        }

        $json = $response->json();
        if (!is_array($json)) {
            throw new DisplayException('The DiscordSRV release feed returned an unexpected response.');
        }

        $release = (string) ($json['tag_name'] ?? 'latest');

        foreach ((array) ($json['assets'] ?? []) as $asset) {
            $name = (string) ($asset['name'] ?? '');
            $url = (string) ($asset['browser_download_url'] ?? '');

            // Named, not merely ".jar". Taking the first jar in the release
            // meant a sources or javadoc artifact — or anything an upstream
            // release later adds — would be installed as the plugin.
            if (!preg_match('/^DiscordSRV[A-Za-z0-9._-]*\.jar$/i', $name)) {
                continue;
            }

            if ($url === '' || !$this->isAllowedUrl($url)) {
                continue;
            }

            return ['name' => $name, 'url' => $url, 'release' => $release];
        }

        throw new DisplayException('The latest DiscordSRV release does not contain a recognisable plugin jar.');
    }

    /**
     * Download an asset to a scratch file, verifying it end to end.
     *
     * Returns a bare filename rather than a path: the caller resolves it
     * through temporaryPath()/discardTemporary(), so no path built from this
     * can point outside the package's own scratch directory.
     *
     * @return string the scratch filename
     *
     * @throws DisplayException
     */
    private function downloadVerifiedJar(string $url): string
    {
        $directory = storage_path(self::TEMP_DIR);

        if (!is_dir($directory) && !@mkdir($directory, 0o750, true) && !is_dir($directory)) {
            throw new DisplayException('Could not prepare a download directory.');
        }

        $name = 'dsrv-' . bin2hex(random_bytes(16)) . '.jar';
        $path = $this->temporaryPath($name);

        try {
            $response = Http::timeout(120)
                ->connectTimeout(10)
                ->withOptions($this->redirectPolicy() + [
                    'sink' => $path,
                    // Refuse on the headers, before a body is streamed to disk.
                    'on_headers' => function (ResponseInterface $response): void {
                        $length = (int) ($response->getHeaderLine('Content-Length') ?: 0);

                        if ($length > self::MAX_JAR_BYTES) {
                            throw new \RuntimeException('declared length exceeds the limit');
                        }
                    },
                ])
                ->get($url);
        } catch (\Throwable $exception) {
            $this->discardTemporary($name);
            $this->logFailure('jar download failed', $exception);

            throw new DisplayException('Could not download the DiscordSRV jar. Please try again.');
        }

        try {
            if (!$response->successful()) {
                throw new DisplayException('The DiscordSRV download returned an unexpected response.');
            }

            $size = (int) @filesize($path);

            // Checked again after the fact: a chunked response carries no
            // Content-Length for on_headers to judge.
            if ($size < self::MIN_JAR_BYTES || $size > self::MAX_JAR_BYTES) {
                throw new DisplayException('The downloaded DiscordSRV jar was not a plausible size.');
            }

            // A jar is a zip. This does not prove the file is DiscordSRV, but
            // it does prove the panel is not about to write an HTML error page,
            // a redirect stub or a text file into the plugins directory.
            $handle = fopen($path, 'rb');
            $magic = $handle === false ? '' : (string) fread($handle, 4);
            if ($handle !== false) {
                fclose($handle);
            }

            if ($magic !== "PK\x03\x04") {
                throw new DisplayException('The downloaded DiscordSRV file was not a jar archive.');
            }
        } catch (\Throwable $exception) {
            $this->discardTemporary($name);

            throw $exception;
        }

        return $name;
    }

    /**
     * Redirect handling that checks every hop.
     *
     * The previous release issued a HEAD to whatever it was given, took the
     * final URL from the redirect history and, on any failure, fell back to the
     * original — so an unvalidated host was reached either way. Here each hop
     * is checked as it happens and an unexpected host aborts the transfer.
     *
     * @return array<string, mixed>
     */
    private function redirectPolicy(): array
    {
        return [
            'allow_redirects' => [
                'max' => self::MAX_REDIRECTS,
                'strict' => true,
                'referer' => false,
                'protocols' => ['https'],
                'on_redirect' => function ($request, $response, $uri): void {
                    if (!$this->isAllowedUrl((string) $uri)) {
                        throw new \RuntimeException('redirect left the allowed hosts');
                    }
                },
            ],
        ];
    }

    /** HTTPS, and a host on the allowlist. */
    private function isAllowedUrl(string $url): bool
    {
        $parts = parse_url($url);

        if ($parts === false || ($parts['scheme'] ?? '') !== 'https') {
            return false;
        }

        $host = strtolower($parts['host'] ?? '');

        return in_array($host, self::ALLOWED_HOSTS, true);
    }

    /** Record why an upstream call failed without returning any of it. */
    private function logFailure(string $message, \Throwable $exception): void
    {
        Log::warning("discordsrv_helper: {$message}", [
            'correlation_id' => (string) Str::uuid(),
            'exception' => $exception::class,
            'message' => $exception->getMessage(),
        ]);
    }
}
