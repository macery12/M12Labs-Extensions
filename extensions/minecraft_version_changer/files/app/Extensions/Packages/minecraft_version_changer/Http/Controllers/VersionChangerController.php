<?php

namespace Everest\Extensions\Packages\minecraft_version_changer\Http\Controllers;

use Everest\Models\Server;
use Everest\Models\EggVariable;
use Everest\Models\ServerVariable;
use Everest\Facades\Activity;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\ResponseInterface;
use Everest\Services\Backups\InitiateBackupService;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\minecraft_version_changer\Http\Requests\GetStatusRequest;
use Everest\Extensions\Packages\minecraft_version_changer\Http\Requests\GetVersionsRequest;
use Everest\Extensions\Packages\minecraft_version_changer\Http\Requests\SwitchVersionRequest;
use Everest\Extensions\Packages\minecraft_version_changer\Http\Requests\CreateBackupRequest;

class VersionChangerController extends ClientApiController
{
    private const MOJANG_MANIFEST   = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json';
    private const PAPER_API         = 'https://api.papermc.io/v2/projects/paper';
    private const FABRIC_GAME_API   = 'https://meta.fabricmc.net/v2/versions/game';
    private const FABRIC_LOADER_API = 'https://meta.fabricmc.net/v2/versions/loader';
    private const FABRIC_INST_API   = 'https://meta.fabricmc.net/v2/versions/installer';
    private const FORGE_PROMOS      = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
    private const FORGE_MAVEN       = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
    private const FABRIC_META       = 'https://meta.fabricmc.net/v2/versions/loader';

    public function __construct(
        private DaemonFileRepository   $fileRepository,
        private InitiateBackupService  $backupService,
    ) {
        parent::__construct();
    }

    // ── GET / ─────────────────────────────────────────────────────────────────

    public function status(GetStatusRequest $request, Server $server): JsonResponse
    {
        $eggName   = $server->egg->name;
        $loader    = $this->detectLoader($eggName);
        $varName   = $this->extractJarVariableName($server->egg->startup);
        $currentJar = $this->getJarVariableValue($server, $varName);

        return new JsonResponse([
            'object'     => 'extension_minecraft_version_changer_status',
            'attributes' => [
                'egg_name'         => $eggName,
                'detected_loader'  => $loader,
                'jar_variable'     => $varName,
                'current_jar'      => $currentJar,
                'current_version'  => $currentJar ? $this->parseVersionFromJar($currentJar) : null,
            ],
        ]);
    }

    // ── GET /versions/{loader} ────────────────────────────────────────────────

    public function versions(GetVersionsRequest $request, Server $server, string $loader): JsonResponse
    {
        $showSnapshots = (bool) $request->boolean('snapshots', false);

        switch ($loader) {
            case 'vanilla':
                return $this->vanillaVersions($showSnapshots);

            case 'paper':
                return $this->paperVersions();

            case 'fabric':
                return $this->fabricVersions();

            case 'forge':
                return $this->forgeVersions();

            default:
                return new JsonResponse(['error' => 'Unknown loader.'], 422);
        }
    }

    // ── GET /builds/{loader}/{mcVersion} ──────────────────────────────────────

    public function builds(GetVersionsRequest $request, Server $server, string $loader, string $mcVersion): JsonResponse
    {
        if (!preg_match('/^[0-9]+\.[0-9]+(\.[0-9]+)?$/', $mcVersion)) {
            return new JsonResponse(['error' => 'Invalid version format.'], 422);
        }

        switch ($loader) {
            case 'vanilla':
                return $this->vanillaBuilds($mcVersion);

            case 'paper':
                return $this->paperBuilds($mcVersion);

            case 'fabric':
                return $this->fabricBuilds($mcVersion);

            case 'forge':
                return $this->forgeBuilds($mcVersion);

            default:
                return new JsonResponse(['error' => 'Unknown loader.'], 422);
        }
    }

    // ── POST /backup ──────────────────────────────────────────────────────────

    public function backup(CreateBackupRequest $request, Server $server): JsonResponse
    {
        $backup = $this->backupService->handle($server, 'Pre-version-switch backup');

        return new JsonResponse([
            'object'     => 'extension_minecraft_version_changer_backup',
            'attributes' => [
                'uuid' => $backup->uuid,
                'name' => $backup->name,
            ],
        ]);
    }

    // ── POST /switch ──────────────────────────────────────────────────────────

    public function switch(SwitchVersionRequest $request, Server $server): JsonResponse
    {
        $loader    = $request->input('loader');
        $mcVersion = $request->input('mc_version');

        [$downloadUrl, $filename] = $this->resolveJarUrl($loader, $mcVersion, $request);

        $response = $this->fileRepository->setServer($server)->pull($downloadUrl, '/', [
            'filename'   => $filename,
            'foreground' => true,
        ]);

        $this->ensureDaemonSuccess($response, 'Failed to download server jar from upstream.');

        if ($loader !== 'vanilla') {
            $this->updateJarVariable($server, $filename);
        }

        Activity::event('server:startup.edit')
            ->property([
                'extension' => 'minecraft_version_changer',
                'loader'    => $loader,
                'version'   => $mcVersion,
                'jar'       => $filename,
            ])
            ->log();

        return new JsonResponse([
            'object'     => 'extension_minecraft_version_changer_switch',
            'attributes' => [
                'jar'        => $filename,
                'loader'     => $loader,
                'mc_version' => $mcVersion,
            ],
        ]);
    }

    // ── Version list helpers ──────────────────────────────────────────────────

    private function vanillaVersions(bool $snapshots): JsonResponse
    {
        $data     = Http::timeout(15)->get(self::MOJANG_MANIFEST)->throw()->json();
        $versions = collect($data['versions'] ?? [])
            ->when(!$snapshots, fn ($c) => $c->where('type', 'release'))
            ->map(fn ($v) => [
                'id'           => $v['id'],
                'type'         => $v['type'],
                'release_time' => $v['releaseTime'] ?? null,
            ])
            ->values();

        return new JsonResponse(['loader' => 'vanilla', 'versions' => $versions]);
    }

    private function paperVersions(): JsonResponse
    {
        $data     = Http::timeout(15)->get(self::PAPER_API)->throw()->json();
        $versions = array_reverse($data['versions'] ?? []);
        $entries  = array_map(fn ($v) => ['id' => $v, 'type' => 'release'], $versions);

        return new JsonResponse(['loader' => 'paper', 'versions' => $entries]);
    }

    private function fabricVersions(): JsonResponse
    {
        $data     = Http::timeout(15)->get(self::FABRIC_GAME_API)->throw()->json();
        $versions = collect($data)
            ->where('stable', true)
            ->map(fn ($v) => ['id' => $v['version'], 'type' => 'release'])
            ->values();

        return new JsonResponse(['loader' => 'fabric', 'versions' => $versions]);
    }

    private function forgeVersions(): JsonResponse
    {
        $data   = Http::timeout(15)->get(self::FORGE_PROMOS)->throw()->json();
        $promos = $data['promos'] ?? [];
        $ids    = [];

        foreach (array_keys($promos) as $key) {
            if (preg_match('/^([0-9.]+)-(recommended|latest)$/', $key, $m)) {
                $ids[] = $m[1];
            }
        }

        $ids = array_unique($ids);
        usort($ids, fn ($a, $b) => version_compare($b, $a));
        $entries = array_map(fn ($v) => ['id' => $v, 'type' => 'release'], array_values($ids));

        return new JsonResponse(['loader' => 'forge', 'versions' => $entries]);
    }

    // ── Build list helpers ────────────────────────────────────────────────────

    private function vanillaBuilds(string $mcVersion): JsonResponse
    {
        $manifest     = Http::timeout(15)->get(self::MOJANG_MANIFEST)->throw()->json();
        $versionEntry = collect($manifest['versions'] ?? [])->firstWhere('id', $mcVersion);

        if (!$versionEntry) {
            return new JsonResponse(['error' => "Vanilla version {$mcVersion} not found."], 404);
        }

        return new JsonResponse([
            'loader'       => 'vanilla',
            'mc_version'   => $mcVersion,
            'type'         => $versionEntry['type'],
            'release_time' => $versionEntry['releaseTime'] ?? null,
            'builds'       => [[
                'id'           => $mcVersion,
                'label'        => $mcVersion,
                'type'         => $versionEntry['type'],
                'release_time' => $versionEntry['releaseTime'] ?? null,
                'changes'      => [],
            ]],
        ]);
    }

    private function paperBuilds(string $mcVersion): JsonResponse
    {
        $response = Http::timeout(15)->get(self::PAPER_API . "/versions/{$mcVersion}/builds");

        if (!$response->successful()) {
            return new JsonResponse(['error' => "No Paper builds found for {$mcVersion}."], 404);
        }

        $data   = $response->json();
        $builds = collect($data['builds'] ?? [])
            ->reverse()
            ->map(fn ($b) => [
                'id'       => $b['build'],
                'label'    => "Build #{$b['build']}" . ($b['promoted'] ? ' (Stable)' : ''),
                'time'     => $b['time'] ?? null,
                'promoted' => $b['promoted'] ?? false,
                'changes'  => collect($b['changes'] ?? [])->pluck('summary')->filter()->values()->toArray(),
            ])
            ->values();

        return new JsonResponse([
            'loader'     => 'paper',
            'mc_version' => $mcVersion,
            'builds'     => $builds,
        ]);
    }

    private function fabricBuilds(string $mcVersion): JsonResponse
    {
        $loaderResponse = Http::timeout(15)->get(self::FABRIC_META . "/{$mcVersion}");

        if (!$loaderResponse->successful()) {
            return new JsonResponse(['error' => "No Fabric builds found for Minecraft {$mcVersion}."], 404);
        }

        $loaderData      = $loaderResponse->json() ?? [];
        $installerData   = Http::timeout(15)->get(self::FABRIC_INST_API)->throw()->json() ?? [];

        $stableLoader    = collect($loaderData)->first(fn ($v) => ($v['loader']['stable'] ?? false) === true);
        $stableInstaller = collect($installerData)->first(fn ($v) => ($v['stable'] ?? false) === true);

        $loaderVersion    = $stableLoader    ? $stableLoader['loader']['version']    : null;
        $installerVersion = $stableInstaller ? $stableInstaller['version']           : null;

        $availableLoaders = collect($loaderData)
            ->take(10)
            ->map(fn ($v) => [
                'version' => $v['loader']['version'],
                'stable'  => $v['loader']['stable'] ?? false,
            ])
            ->values();

        return new JsonResponse([
            'loader'            => 'fabric',
            'mc_version'        => $mcVersion,
            'loader_version'    => $loaderVersion,
            'installer_version' => $installerVersion,
            'jar_filename'      => $loaderVersion && $installerVersion
                ? "fabric-server-mc.{$mcVersion}-loader.{$loaderVersion}-launcher.{$installerVersion}.jar"
                : null,
            'available_loaders' => $availableLoaders,
            'builds'            => $loaderVersion ? [[
                'id'      => $loaderVersion,
                'label'   => "Loader {$loaderVersion}" . ($stableLoader ? ' (Stable)' : ''),
                'stable'  => (bool) ($stableLoader['loader']['stable'] ?? false),
                'changes' => [],
            ]] : [],
        ]);
    }

    private function forgeBuilds(string $mcVersion): JsonResponse
    {
        $data        = Http::timeout(15)->get(self::FORGE_PROMOS)->throw()->json();
        $promos      = $data['promos'] ?? [];
        $recommended = $promos["{$mcVersion}-recommended"] ?? null;
        $latest      = $promos["{$mcVersion}-latest"]      ?? null;

        if (!$recommended && !$latest) {
            return new JsonResponse(['error' => "No Forge builds found for Minecraft {$mcVersion}."], 404);
        }

        $builds = [];
        if ($recommended) {
            $builds[] = [
                'id'      => $recommended,
                'label'   => "{$recommended} (Recommended)",
                'type'    => 'recommended',
                'changes' => [],
            ];
        }
        if ($latest && $latest !== $recommended) {
            $builds[] = [
                'id'      => $latest,
                'label'   => "{$latest} (Latest)",
                'type'    => 'latest',
                'changes' => [],
            ];
        }

        return new JsonResponse([
            'loader'       => 'forge',
            'mc_version'   => $mcVersion,
            'recommended'  => $recommended,
            'latest'       => $latest,
            'builds'       => $builds,
        ]);
    }

    // ── Switch helpers ────────────────────────────────────────────────────────

    /**
     * Resolve the download URL and target filename for a given loader/version.
     * All inputs have already been validated by SwitchVersionRequest.
     *
     * @return array{0: string, 1: string}  [downloadUrl, filename]
     */
    private function resolveJarUrl(string $loader, string $mcVersion, SwitchVersionRequest $request): array
    {
        switch ($loader) {
            case 'vanilla':
                return $this->resolveVanillaUrl($mcVersion);

            case 'paper':
                $build   = (int) $request->input('build');
                $jarName = "paper-{$mcVersion}-{$build}.jar";
                $url     = self::PAPER_API . "/versions/{$mcVersion}/builds/{$build}/downloads/{$jarName}";
                // Verify the build exists before we hand the URL to Wings
                $check = Http::timeout(15)->head($url);
                if (!$check->successful()) {
                    throw new \RuntimeException("Paper build {$build} for Minecraft {$mcVersion} was not found.");
                }
                return [$url, $jarName];

            case 'fabric':
                $loaderVersion    = $request->input('loader_version');
                $installerVersion = $request->input('installer_version');
                $url              = self::FABRIC_META . "/{$mcVersion}/{$loaderVersion}/{$installerVersion}/server/jar";
                $jarName          = "fabric-server-mc.{$mcVersion}-loader.{$loaderVersion}-launcher.{$installerVersion}.jar";
                return [$url, $jarName];

            case 'forge':
                $forgeVersion = $request->input('forge_version');
                $url          = self::FORGE_MAVEN . "/{$mcVersion}-{$forgeVersion}/forge-{$mcVersion}-{$forgeVersion}-installer.jar";
                $check        = Http::timeout(15)->head($url);
                if (!$check->successful()) {
                    throw new \RuntimeException("Forge {$forgeVersion} for Minecraft {$mcVersion} was not found on Maven.");
                }
                return [$url, "forge-{$mcVersion}-{$forgeVersion}-installer.jar"];

            default:
                throw new \InvalidArgumentException("Unknown loader: {$loader}");
        }
    }

    private function resolveVanillaUrl(string $mcVersion): array
    {
        $manifest     = Http::timeout(15)->get(self::MOJANG_MANIFEST)->throw()->json();
        $versionEntry = collect($manifest['versions'] ?? [])->firstWhere('id', $mcVersion);

        if (!$versionEntry) {
            throw new \RuntimeException("Vanilla version {$mcVersion} not found in Mojang manifest.");
        }

        $details = Http::timeout(15)->get($versionEntry['url'])->throw()->json();
        $url     = $details['downloads']['server']['url'] ?? null;

        if (!$url) {
            throw new \RuntimeException("No server download available for Vanilla {$mcVersion} (snapshot or client-only release).");
        }

        return [$url, 'server.jar'];
    }

    private function updateJarVariable(Server $server, string $filename): void
    {
        $varName    = $this->extractJarVariableName($server->egg->startup);
        $eggVariable = EggVariable::query()
            ->where('egg_id', $server->egg_id)
            ->where('env_variable', $varName)
            ->first();

        if ($eggVariable) {
            ServerVariable::query()->updateOrCreate(
                ['server_id' => $server->id, 'variable_id' => $eggVariable->id],
                ['variable_value' => $filename],
            );
        }
    }

    private function ensureDaemonSuccess(ResponseInterface $response, string $message): void
    {
        $status = $response->getStatusCode();
        if ($status >= 200 && $status < 300) {
            return;
        }
        $body = trim((string) $response->getBody());
        throw new \RuntimeException($message . ($body ? " Wings response: {$body}" : ''));
    }

    // ── Utility helpers ───────────────────────────────────────────────────────

    /**
     * Extract the jar variable placeholder name from an egg startup command.
     * e.g. "java -jar {{SERVER_JARFILE}}" → "SERVER_JARFILE"
     */
    private function extractJarVariableName(string $startup): string
    {
        if (preg_match('/-jar\s+\{\{([A-Z0-9_]+)\}\}/i', $startup, $matches)) {
            return $matches[1];
        }
        return 'SERVER_JARFILE';
    }

    /**
     * Get the current effective value of the jar startup variable.
     * Checks server override first, then egg default.
     */
    private function getJarVariableValue(Server $server, string $varName): ?string
    {
        $eggVariable = EggVariable::query()
            ->where('egg_id', $server->egg_id)
            ->where('env_variable', $varName)
            ->first();

        if (!$eggVariable) {
            return null;
        }

        $serverVariable = ServerVariable::query()
            ->where('server_id', $server->id)
            ->where('variable_id', $eggVariable->id)
            ->first();

        return $serverVariable?->variable_value ?? $eggVariable->default_value ?? null;
    }

    /**
     * Attempt to parse a Minecraft version from a jar filename.
     * Handles patterns from Vanilla, Paper, Fabric, and Forge.
     */
    private function parseVersionFromJar(string $jar): ?string
    {
        // paper-1.21.4-123.jar
        if (preg_match('/^paper-([0-9]+\.[0-9]+(?:\.[0-9]+)?)-[0-9]+\.jar$/', $jar, $m)) {
            return $m[1];
        }
        // fabric-server-mc.1.21.4-loader.0.16.10-launcher.1.0.1.jar
        if (preg_match('/^fabric-server-mc\.([0-9]+\.[0-9]+(?:\.[0-9]+)?)-/', $jar, $m)) {
            return $m[1];
        }
        // forge-1.21.4-49.0.14-installer.jar
        if (preg_match('/^forge-([0-9]+\.[0-9]+(?:\.[0-9]+)?)-/', $jar, $m)) {
            return $m[1];
        }
        // server.jar (Vanilla) — version unknown without additional info
        return null;
    }

    /**
     * Detect the loader slug from an egg name string.
     */
    private function detectLoader(string $eggName): ?string
    {
        $lower = strtolower($eggName);
        $map   = [
            'neoforge' => 'neoforge',
            'forge'    => 'forge',
            'fabric'   => 'fabric',
            'quilt'    => 'quilt',
            'purpur'   => 'purpur',
            'folia'    => 'folia',
            'paper'    => 'paper',
            'spigot'   => 'spigot',
            'bukkit'   => 'bukkit',
            'vanilla'  => 'vanilla',
        ];

        foreach ($map as $keyword => $slug) {
            if (str_contains($lower, $keyword)) {
                return $slug;
            }
        }
        return null;
    }
}
