<?php

namespace Everest\Extensions\Packages\minecraft_log_uploader\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Support\Str;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Everest\Exceptions\DisplayException;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Traits\Controllers\RespondsWithExtensionEnvelope;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests\GetLogRequest;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests\ListLogsRequest;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests\UploadLogRequest;

/**
 * Reads server logs and, on request, publishes one to mclo.gs.
 *
 * Mounted by the loader under
 * /api/client/servers/{server}/extensions/ext/minecraft_log_uploader, with the
 * server binding, client auth and the extensions.access gate applied there. The
 * package's route file declares no prefix and no middleware of its own.
 *
 * Two properties shape this controller. A log file is server-controlled input,
 * so every read is bounded and every decompression is bounded twice — once on
 * the bytes fed in and once on the bytes produced. And upload sends the log to
 * a third party, so the content is scanned for obvious credentials first and
 * the caller is told plainly, in the UI, where the data is going.
 */
class LogUploaderController extends ClientApiController
{
    use RespondsWithExtensionEnvelope;

    /** Maximum bytes to read when previewing a log file (512 KiB). */
    private const PREVIEW_LIMIT_BYTES = 524_288;

    /** Maximum bytes to upload to mclo.gs (10 MiB). */
    private const UPLOAD_LIMIT_BYTES = 10_485_760;

    /**
     * Ceiling on the compressed bytes fetched for a .log.gz.
     *
     * Read separately from the expansion ceiling: a small archive can expand to
     * an arbitrary size, so bounding only the download bounds nothing.
     */
    private const MAX_COMPRESSED_BYTES = 8_388_608;

    /**
     * Ceiling on total bytes inflated from one archive.
     *
     * Distinct from the caller's output limit. The reader keeps only the last
     * N bytes it has seen, so memory is bounded by that limit regardless — this
     * bounds the CPU a single request may spend decompressing, which is what a
     * zip bomb actually costs.
     */
    private const MAX_INFLATED_BYTES = 67_108_864;

    /**
     * Bytes of compressed input fed to inflate_add() per call.
     *
     * Deliberately small. inflate_add() emits everything one chunk expands to
     * before returning, so this — not the ceiling above — is what bounds a
     * single allocation.
     */
    private const INFLATE_CHUNK_BYTES = 4_096;

    /** mclo.gs upload endpoint. */
    private const MCLO_GS_URL = 'https://api.mclo.gs/1/log';

    /** Bound on the response body accepted from mclo.gs. */
    private const MAX_RESPONSE_BYTES = 65_536;

    /** Allowed log file extensions. */
    private const ALLOWED_EXTENSIONS = ['log', 'gz'];

    /**
     * Best-effort credential redaction applied before anything leaves the
     * panel.
     *
     * This is a safety net, not a guarantee: a log can carry a secret in a
     * shape no pattern anticipates, which is why the UI states plainly that
     * upload publishes the file. Each pattern keeps the key name so the log
     * stays readable, and replaces only the value.
     */
    private const REDACTION_PATTERNS = [
        // key: value / key=value for the usual credential key names.
        '/\b(password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bot[_-]?token|rcon\.password)\b(\s*[:=]\s*)(\S+)/i' => '$1$2[REDACTED]',
        // Discord bot tokens.
        '/\b[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,38}\b/' => '[REDACTED]',
        // Bearer credentials in captured HTTP traffic.
        '/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i' => 'Bearer [REDACTED]',
    ];

    public function __construct(
        private DaemonFileRepository $fileRepository,
    ) {
        parent::__construct();
    }

    /**
     * Validate that a filename is safe to use (no path traversal, only log files).
     *
     * @throws DisplayException
     */
    private function validateLogFilename(string $name): string
    {
        // Reject any path separators or null bytes.
        if (str_contains($name, '/') || str_contains($name, '\\') || str_contains($name, "\0")) {
            throw new DisplayException('Invalid log filename.');
        }

        // Only alphanumeric characters, dots, hyphens, and underscores are allowed.
        if (!preg_match('/^[\w.\-]+$/', $name)) {
            throw new DisplayException('Invalid log filename.');
        }

        // Must end with an allowed extension.
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
            throw new DisplayException('Only .log and .log.gz files are allowed.');
        }

        return $name;
    }

    /**
     * List available log files in the server's /logs directory.
     */
    public function listLogs(ListLogsRequest $request, Server $server): JsonResponse
    {
        try {
            $files = $this->fileRepository->setServer($server)->getDirectory('/logs');
        } catch (\Throwable) {
            // A server with no /logs directory yet is the common case, not an
            // error worth surfacing.
            return $this->extensionItemResponse('minecraft_log_uploader_logs', ['logs' => []]);
        }

        $logs = [];
        foreach ($files as $file) {
            $name = $file['name'] ?? '';
            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

            if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
                continue;
            }

            $logs[] = [
                'name' => $name,
                'size' => $file['size'] ?? 0,
                'modified_at' => $file['modified_at'] ?? null,
            ];
        }

        // Sort newest first using the modified timestamp, falling back to name.
        usort($logs, static function (array $a, array $b): int {
            $ta = $a['modified_at'] ?? '';
            $tb = $b['modified_at'] ?? '';
            if ($ta !== $tb) {
                return strcmp($tb, $ta);
            }
            // "latest.log" should always be first.
            if ($a['name'] === 'latest.log') {
                return -1;
            }
            if ($b['name'] === 'latest.log') {
                return 1;
            }

            return strcmp($b['name'], $a['name']);
        });

        return $this->extensionItemResponse('minecraft_log_uploader_logs', ['logs' => $logs]);
    }

    /**
     * Return the (truncated) contents of a log file for preview.
     */
    public function getLog(GetLogRequest $request, Server $server): JsonResponse
    {
        $filename = $this->validateLogFilename((string) $request->input('file', ''));

        [$text, $truncated] = $this->readLogText($server, $filename, self::PREVIEW_LIMIT_BYTES);

        return $this->extensionItemResponse('minecraft_log_uploader_log', [
            'file' => $filename,
            'content' => $text,
            'truncated' => $truncated,
        ]);
    }

    /**
     * Read the specified log file and upload it to mclo.gs.
     */
    public function upload(UploadLogRequest $request, Server $server): JsonResponse
    {
        $filename = $this->validateLogFilename((string) $request->input('file', ''));

        [$text, $truncated] = $this->readLogText($server, $filename, self::UPLOAD_LIMIT_BYTES);

        // Redaction happens on the exact bytes that are about to leave, after
        // truncation, so nothing is scanned that is not sent and nothing is
        // sent that was not scanned.
        $text = $this->redact($text);

        try {
            $response = Http::asForm()
                ->timeout(15)
                ->connectTimeout(5)
                ->withOptions(['allow_redirects' => false])
                ->post(self::MCLO_GS_URL, ['content' => $text]);
        } catch (\Throwable $exception) {
            $this->logFailure('mclo.gs request failed', $server, $exception);

            throw new DisplayException('Failed to reach mclo.gs. Please try again.');
        }

        if (!$response->successful()) {
            throw new DisplayException('mclo.gs returned an error. Please try again.');
        }

        // The upstream body is untrusted input like any other remote response.
        if (strlen($response->body()) > self::MAX_RESPONSE_BYTES) {
            throw new DisplayException('mclo.gs returned an unexpected response. Please try again.');
        }

        $body = $response->json();
        if (!is_array($body) || !($body['success'] ?? false)) {
            // The upstream error string is not echoed back: it is attacker- and
            // third-party-controlled text rendered in the panel's UI.
            throw new DisplayException('mclo.gs could not accept this log. Please try again.');
        }

        $url = (string) ($body['url'] ?? '');
        $id = (string) ($body['id'] ?? '');

        // Validate the shape before handing the caller a link to follow. An
        // upstream that returned a javascript: or attacker-controlled host
        // would otherwise be rendered as a link the user is invited to click.
        if (!preg_match('#^https://(?:api\.)?mclo\.gs/\S*$#', $url) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            throw new DisplayException('mclo.gs returned an unexpected response. Please try again.');
        }

        return $this->extensionItemResponse('minecraft_log_uploader_upload', [
            'url' => $url,
            'id' => $id,
            'truncated' => $truncated,
        ]);
    }

    /**
     * Fetch a log and return it as text, bounded on every axis.
     *
     * @return array{0: string, 1: bool} the text, and whether it was truncated
     *
     * @throws DisplayException
     */
    private function readLogText(Server $server, string $filename, int $limit): array
    {
        $isCompressed = strtolower(pathinfo($filename, PATHINFO_EXTENSION)) === 'gz';

        // A .gz is bounded on its compressed size; a plain log is bounded on
        // the limit itself plus a margin, so truncation can still be detected.
        $fetchLimit = $isCompressed ? self::MAX_COMPRESSED_BYTES : $limit + 1;

        try {
            $raw = $this->fileRepository->setServer($server)->getContent("/logs/{$filename}", $fetchLimit);
        } catch (\Throwable $exception) {
            $this->logFailure('log read failed', $server, $exception);

            throw new DisplayException('Could not read that log file.');
        }

        if ($isCompressed) {
            // Expansion is capped at the caller's limit plus one byte, so an
            // archive that would expand further is stopped mid-stream rather
            // than after it has already been materialised.
            [$text, $truncated] = $this->inflateBounded($raw, $limit);

            return [$text, $truncated];
        }

        if (strlen($raw) > $limit) {
            // The tail is what matters in a log: the most recent lines.
            return [substr($raw, -$limit), true];
        }

        return [$raw, false];
    }

    /**
     * Gzip-inflate, keeping only the tail, with hard ceilings on both the bytes
     * held and the bytes produced.
     *
     * Streaming rather than gzdecode() for two reasons. A zip bomb costs at
     * most MAX_INFLATED_BYTES (plus one chunk's expansion) of CPU and never
     * more than $limit of memory, because the window below is trimmed after
     * every chunk. And the result is the END of the log — the part that
     * matters — which taking the first $limit bytes of a partial inflate would
     * not give.
     *
     * The input chunk size is what makes the ceiling meaningful: inflate_add()
     * has no output bound, so it returns however much one chunk expands to
     * before the loop can check anything. At 4 KiB in, deflate's 1032:1
     * maximum caps a single call at roughly 4 MiB — measured, not assumed.
     * Feeding 64 KiB chunks instead let a 100 MiB bomb land in one call.
     *
     * @return array{0: string, 1: bool} the text, and whether it was truncated
     *
     * @throws DisplayException
     */
    private function inflateBounded(string $compressed, int $limit): array
    {
        $context = @inflate_init(ZLIB_ENCODING_GZIP);
        if ($context === false) {
            throw new DisplayException('Could not read that log file.');
        }

        $window = '';
        $produced = 0;
        $truncated = false;

        foreach (str_split($compressed, self::INFLATE_CHUNK_BYTES) as $chunk) {
            $piece = @inflate_add($context, $chunk, ZLIB_NO_FLUSH);

            if ($piece === false) {
                throw new DisplayException('That log file is not a readable gzip archive.');
            }

            $produced += strlen($piece);
            $window .= $piece;

            // Trim after every chunk so the window never exceeds the limit,
            // whatever the archive expands to.
            if (strlen($window) > $limit) {
                $window = substr($window, -$limit);
                $truncated = true;
            }

            if ($produced > self::MAX_INFLATED_BYTES) {
                $truncated = true;
                break;
            }
        }

        if (!$truncated) {
            $final = @inflate_add($context, '', ZLIB_FINISH);

            if ($final === false) {
                throw new DisplayException('That log file is not a readable gzip archive.');
            }

            $window .= $final;

            if (strlen($window) > $limit) {
                $window = substr($window, -$limit);
                $truncated = true;
            }
        }

        return [$window, $truncated];
    }

    /** Apply the best-effort credential patterns. */
    private function redact(string $text): string
    {
        foreach (self::REDACTION_PATTERNS as $pattern => $replacement) {
            $result = preg_replace($pattern, $replacement, $text);

            // A backtrack limit on a pathological line must not silently drop
            // the whole log; keep the last good text and move on.
            if ($result !== null) {
                $text = $result;
            }
        }

        return $text;
    }

    /**
     * Record a failure server-side without returning its detail.
     *
     * Daemon and HTTP exceptions carry paths, hostnames and upstream bodies,
     * none of which belong in a client response.
     */
    private function logFailure(string $message, Server $server, \Throwable $exception): void
    {
        Log::warning("minecraft_log_uploader: {$message}", [
            'correlation_id' => (string) Str::uuid(),
            'server_id' => $server->id,
            'exception' => $exception::class,
            'message' => $exception->getMessage(),
        ]);
    }
}
