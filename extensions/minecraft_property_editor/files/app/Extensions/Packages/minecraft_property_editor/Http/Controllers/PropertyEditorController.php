<?php

namespace Everest\Extensions\Packages\minecraft_property_editor\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\minecraft_property_editor\Http\Requests\GetPropertyEditorRequest;
use Everest\Extensions\Packages\minecraft_property_editor\Http\Requests\SavePropertyEditorRequest;

class PropertyEditorController extends ClientApiController
{
    private const PROPERTIES_FILE = '/server.properties';

    public function __construct(
        private DaemonFileRepository $fileRepository,
    ) {
        parent::__construct();
    }

    public function index(GetPropertyEditorRequest $request, Server $server): JsonResponse
    {
        $rawContent = $this->safeGetContent($server, self::PROPERTIES_FILE);
        $fileExists = $rawContent !== null;

        $properties = [];
        if ($fileExists && $rawContent !== '') {
            $properties = $this->parseProperties($rawContent);
        }

        $detectedVersion    = $this->detectVersion($properties);
        $eggName            = $server->egg->name ?? '';
        $detectedServerType = $this->detectServerType($eggName);

        return new JsonResponse([
            'raw_content'          => $rawContent ?? '',
            'properties'           => $properties,
            'detected_version'     => $detectedVersion,
            'detected_server_type' => $detectedServerType,
            'egg_name'             => $eggName,
            'file_exists'          => $fileExists,
        ]);
    }

    public function save(SavePropertyEditorRequest $request, Server $server): JsonResponse
    {
        /** @var array<string,string> $properties */
        $properties = $request->input('properties', []);

        $this->rotateBackups($server);

        $content = $this->serializeProperties($properties);
        $this->fileRepository->setServer($server)->putContent(self::PROPERTIES_FILE, $content);

        return new JsonResponse([
            'properties' => $properties,
        ]);
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /** @return array<string,string> */
    private function parseProperties(string $content): array
    {
        $result = [];
        foreach (explode("\n", $content) as $line) {
            $line = rtrim($line, "\r");
            if ($line === '' || str_starts_with(ltrim($line), '#')) {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key   = trim(substr($line, 0, $pos));
            $value = substr($line, $pos + 1);
            if ($key !== '') {
                $result[$key] = $value;
            }
        }
        return $result;
    }

    /** @param array<string,string> $properties */
    private function serializeProperties(array $properties): string
    {
        $lines = ["# Edited by MC Property Editor\n"];
        foreach ($properties as $key => $value) {
            $lines[] = "{$key}={$value}\n";
        }
        return implode('', $lines);
    }

    private function detectVersion(array $properties): ?string
    {
        foreach (['server-version', 'version'] as $key) {
            if (isset($properties[$key]) && $properties[$key] !== '') {
                if (preg_match('/(\d+\.\d+(?:\.\d+)?)/', trim($properties[$key]), $m)) {
                    return $m[1];
                }
            }
        }
        return null;
    }

    private function detectServerType(string $eggName): ?string
    {
        $lower = strtolower($eggName);
        foreach (['neoforge', 'forge', 'fabric', 'paper', 'spigot', 'bukkit', 'vanilla'] as $type) {
            if (str_contains($lower, $type)) {
                return $type;
            }
        }
        return null;
    }

    private function rotateBackups(Server $server): void
    {
        $this->safeRenameBackup($server, '/server.properties.bak2', '/server.properties.bak3');
        $this->safeRenameBackup($server, '/server.properties.bak1', '/server.properties.bak2');
        $current = $this->safeGetContent($server, self::PROPERTIES_FILE);
        if ($current !== null) {
            $this->fileRepository->setServer($server)->putContent('/server.properties.bak1', $current);
        }
    }

    private function safeRenameBackup(Server $server, string $src, string $dest): void
    {
        try {
            $content = $this->fileRepository->setServer($server)->getContent($src);
            $this->fileRepository->setServer($server)->putContent($dest, $content);
            $this->fileRepository->setServer($server)->deleteFiles([$src]);
        } catch (\Throwable) {
            // Source file does not exist or wings error — skip silently.
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
}
