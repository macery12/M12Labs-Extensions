<?php

namespace Everest\Extensions\Packages\minecraft_log_uploader\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests\ListLogsRequest;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests\GetLogRequest;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Requests\UploadLogRequest;

class LogUploaderController extends ClientApiController
{
    /** Maximum bytes to read when previewing a log file (512 KiB). */
    private const PREVIEW_LIMIT_BYTES = 524_288;

    /** Maximum bytes to upload to mclo.gs (10 MiB). */
    private const UPLOAD_LIMIT_BYTES = 10_485_760;

    /** mclo.gs upload endpoint. */
    private const MCLO_GS_URL = 'https://api.mclo.gs/1/log';

    /** Allowed log file extensions. */
    private const ALLOWED_EXTENSIONS = ['log', 'gz'];

    public function __construct(
        private DaemonFileRepository $fileRepository,
    ) {
        parent::__construct();
    }

    /**
     * Validate that a filename is safe to use (no path traversal, only log files).
     *
     * @throws \InvalidArgumentException
     */
    private function validateLogFilename(string $name): string
    {
        // Reject any path separators or null bytes.
        if (str_contains($name, '/') || str_contains($name, '\\') || str_contains($name, "\0")) {
            throw new \InvalidArgumentException('Invalid log filename.');
        }

        // Only alphanumeric characters, dots, hyphens, and underscores are allowed.
        if (!preg_match('/^[\w.\-]+$/', $name)) {
            throw new \InvalidArgumentException('Invalid log filename.');
        }

        // Must end with an allowed extension.
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
            throw new \InvalidArgumentException('Only .log and .log.gz files are allowed.');
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
        } catch (\Throwable $e) {
            return new JsonResponse([
                'object' => 'extension_minecraft_log_uploader_logs',
                'attributes' => ['logs' => []],
            ]);
        }

        $logs = [];
        foreach ($files as $file) {
            $name = $file['name'] ?? '';
            $ext  = strtolower(pathinfo($name, PATHINFO_EXTENSION));

            if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
                continue;
            }

            $logs[] = [
                'name'        => $name,
                'size'        => $file['size'] ?? 0,
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

        return new JsonResponse([
            'object'     => 'extension_minecraft_log_uploader_logs',
            'attributes' => ['logs' => $logs],
        ]);
    }

    /**
     * Return the (truncated) contents of a log file for preview.
     */
    public function getLog(GetLogRequest $request, Server $server): JsonResponse
    {
        try {
            $filename = $this->validateLogFilename($request->input('file', ''));
        } catch (\InvalidArgumentException $e) {
            return new JsonResponse(['error' => $e->getMessage()], 422);
        }

        try {
            $raw = $this->fileRepository->setServer($server)->getContent("/logs/{$filename}");
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Could not read log file.'], 404);
        }

        $truncated = false;
        if (strlen($raw) > self::PREVIEW_LIMIT_BYTES) {
            $raw       = substr($raw, -self::PREVIEW_LIMIT_BYTES);
            $truncated = true;
        }

        return new JsonResponse([
            'object'     => 'extension_minecraft_log_uploader_log',
            'attributes' => [
                'file'      => $filename,
                'content'   => $raw,
                'truncated' => $truncated,
            ],
        ]);
    }

    /**
     * Read the specified log file and upload it to mclo.gs.
     */
    public function upload(UploadLogRequest $request, Server $server): JsonResponse
    {
        try {
            $filename = $this->validateLogFilename($request->input('file', ''));
        } catch (\InvalidArgumentException $e) {
            return new JsonResponse(['error' => $e->getMessage()], 422);
        }

        try {
            $raw = $this->fileRepository->setServer($server)->getContent("/logs/{$filename}");
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Could not read log file.'], 404);
        }

        if (strlen($raw) > self::UPLOAD_LIMIT_BYTES) {
            $raw = substr($raw, -self::UPLOAD_LIMIT_BYTES);
        }

        try {
            $response = Http::asForm()
                ->timeout(15)
                ->post(self::MCLO_GS_URL, ['content' => $raw]);
        } catch (\Throwable $e) {
            return new JsonResponse(['error' => 'Failed to reach mclo.gs. Please try again.'], 502);
        }

        if (!$response->successful()) {
            return new JsonResponse(['error' => 'mclo.gs returned an error. Please try again.'], 502);
        }

        $body = $response->json();

        if (!($body['success'] ?? false)) {
            $detail = $body['error'] ?? 'Unknown error from mclo.gs.';
            return new JsonResponse(['error' => $detail], 502);
        }

        return new JsonResponse([
            'object'     => 'extension_minecraft_log_uploader_upload',
            'attributes' => [
                'url' => $body['url'] ?? null,
                'id'  => $body['id'] ?? null,
            ],
        ]);
    }
}
