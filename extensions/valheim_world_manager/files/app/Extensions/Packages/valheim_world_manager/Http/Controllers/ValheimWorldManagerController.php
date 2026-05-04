<?php

namespace Everest\Extensions\Packages\valheim_world_manager\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Arr;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Services\Extensions\ExtensionFileSnapshotService;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerStatusRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerListWorldsRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerDeleteWorldRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerGetConfigRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerSaveConfigRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerListModsRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerToggleModRequest;
use Everest\Extensions\Packages\valheim_world_manager\Http\Requests\ValheimWorldManagerDeleteModRequest;

class ValheimWorldManagerController extends ClientApiController
{
    private const EXTENSION_ID = 'valheim_world_manager';
    private const WORLDS_DIR = '/home/container/.config/unity3d/IronGate/Valheim/worlds_local';
    private const CONFIG_FILE = '/home/container/valheim_manager_config.json';
    private const PLUGINS_DIR = '/home/container/BepInEx/plugins';

    private const CONFIG_DEFAULTS = [
        'server_name' => 'My Valheim Server',
        'world_name' => 'MyWorld',
        'password' => '',
        'public' => true,
        'crossplay' => false,
        'modifier_combat' => 'standard',
        'modifier_deathpenalty' => 'casual',
        'modifier_resources' => 'standard',
        'modifier_raids' => 'standard',
        'modifier_portals' => 'standard',
    ];

    public function __construct(
        private DaemonFileRepository $fileRepository,
        private ExtensionFileSnapshotService $snapshotService,
    ) {
        parent::__construct();
    }

    public function index(ValheimWorldManagerStatusRequest $request, Server $server): JsonResponse
    {
        $worldsDirExists = false;
        $worldCount = 0;
        $bepinexInstalled = false;
        $modCount = 0;
        $activeWorld = null;

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory(self::WORLDS_DIR);
            $worldsDirExists = true;

            foreach ($items as $item) {
                $name = (string) Arr::get($item, 'name', '');
                $isFile = (bool) Arr::get($item, 'file', true);

                if ($isFile && str_ends_with($name, '.fwl') && !str_ends_with($name, '.fwl.old')) {
                    $worldCount++;
                }
            }
        } catch (\Throwable) {
            // Worlds directory does not exist yet.
        }

        try {
            $plugins = $this->fileRepository->setServer($server)->getDirectory(self::PLUGINS_DIR);
            $bepinexInstalled = true;

            foreach ($plugins as $item) {
                $name = (string) Arr::get($item, 'name', '');
                $isFile = (bool) Arr::get($item, 'file', true);

                if ($isFile) {
                    $lower = strtolower($name);
                    if (str_ends_with($lower, '.dll') || str_ends_with($lower, '.dll.disabled')) {
                        $modCount++;
                    }
                } else {
                    $modCount++;
                }
            }
        } catch (\Throwable) {
            // BepInEx not installed.
        }

        $configContent = $this->safeGetContent($server, self::CONFIG_FILE);
        if ($configContent !== null) {
            $config = json_decode($configContent, true);
            if (is_array($config)) {
                $activeWorld = isset($config['world_name']) ? (string) $config['world_name'] : null;
            }
        }

        return new JsonResponse(['data' => [
            'worlds_dir_exists' => $worldsDirExists,
            'bepinex_installed' => $bepinexInstalled,
            'world_count' => $worldCount,
            'mod_count' => $modCount,
            'active_world' => $activeWorld,
        ]]);
    }

    public function listWorlds(ValheimWorldManagerListWorldsRequest $request, Server $server): JsonResponse
    {
        $dirExists = false;
        $worlds = [];

        $activeWorld = null;
        $configContent = $this->safeGetContent($server, self::CONFIG_FILE);
        if ($configContent !== null) {
            $config = json_decode($configContent, true);
            if (is_array($config)) {
                $activeWorld = isset($config['world_name']) ? (string) $config['world_name'] : null;
            }
        }

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory(self::WORLDS_DIR);
            $dirExists = true;

            $fileMap = [];
            foreach ($items as $item) {
                $name = (string) Arr::get($item, 'name', '');
                $isFile = (bool) Arr::get($item, 'file', true);
                $size = (int) Arr::get($item, 'size', 0);

                if ($isFile) {
                    $fileMap[$name] = $size;
                }
            }

            $worldNames = [];
            foreach (array_keys($fileMap) as $filename) {
                if (str_ends_with($filename, '.fwl') && !str_ends_with($filename, '.fwl.old')) {
                    $worldNames[] = substr($filename, 0, -4);
                }
            }

            foreach ($worldNames as $worldName) {
                $worlds[] = [
                    'name' => $worldName,
                    'has_db' => isset($fileMap[$worldName . '.db']),
                    'has_fwl' => true,
                    'has_db_backup' => isset($fileMap[$worldName . '.db.old']),
                    'has_fwl_backup' => isset($fileMap[$worldName . '.fwl.old']),
                    'db_size' => $fileMap[$worldName . '.db'] ?? 0,
                    'fwl_size' => $fileMap[$worldName . '.fwl'] ?? 0,
                    'is_active' => $activeWorld !== null && $activeWorld === $worldName,
                ];
            }
        } catch (\Throwable) {
            // Worlds directory does not exist yet.
        }

        return new JsonResponse(['data' => [
            'worlds' => $worlds,
            'dir_exists' => $dirExists,
        ]]);
    }

    public function deleteWorld(ValheimWorldManagerDeleteWorldRequest $request, Server $server, string $world): JsonResponse
    {
        if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $world)) {
            return new JsonResponse(['error' => 'Invalid world name.'], 422);
        }

        $configContent = $this->safeGetContent($server, self::CONFIG_FILE);
        if ($configContent !== null) {
            $config = json_decode($configContent, true);
            if (is_array($config)) {
                $activeWorld = isset($config['world_name']) ? (string) $config['world_name'] : null;
                if ($activeWorld === $world) {
                    return new JsonResponse([
                        'error' => 'Cannot delete the active world. Change the active world in Server Config first.',
                    ], 409);
                }
            }
        }

        $filesToDelete = [
            self::WORLDS_DIR . '/' . $world . '.db',
            self::WORLDS_DIR . '/' . $world . '.fwl',
            self::WORLDS_DIR . '/' . $world . '.db.old',
            self::WORLDS_DIR . '/' . $world . '.fwl.old',
        ];

        foreach ($filesToDelete as $file) {
            try {
                $this->fileRepository->setServer($server)->deleteFiles([$file]);
            } catch (\Throwable) {
                // File may not exist; continue.
            }
        }

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
    }

    public function getConfig(ValheimWorldManagerGetConfigRequest $request, Server $server): JsonResponse
    {
        $config = self::CONFIG_DEFAULTS;
        $fileExists = false;

        $content = $this->safeGetContent($server, self::CONFIG_FILE);
        if ($content !== null) {
            $fileExists = true;
            $parsed = json_decode($content, true);
            if (is_array($parsed)) {
                foreach (array_keys(self::CONFIG_DEFAULTS) as $key) {
                    if (array_key_exists($key, $parsed)) {
                        $config[$key] = $parsed[$key];
                    }
                }
            }
        }

        return new JsonResponse(['data' => [
            'config' => $config,
            'file_exists' => $fileExists,
        ]]);
    }

    public function saveConfig(ValheimWorldManagerSaveConfigRequest $request, Server $server): JsonResponse
    {
        $config = [
            'server_name' => (string) $request->input('server_name'),
            'world_name' => (string) $request->input('world_name'),
            'password' => (string) $request->input('password', ''),
            'public' => (bool) $request->input('public', true),
            'crossplay' => (bool) $request->input('crossplay', false),
            'modifier_combat' => (string) $request->input('modifier_combat', 'standard'),
            'modifier_deathpenalty' => (string) $request->input('modifier_deathpenalty', 'casual'),
            'modifier_resources' => (string) $request->input('modifier_resources', 'standard'),
            'modifier_raids' => (string) $request->input('modifier_raids', 'standard'),
            'modifier_portals' => (string) $request->input('modifier_portals', 'standard'),
        ];

        $before = $this->safeGetContent($server, self::CONFIG_FILE);
        $this->snapshotService->create($server, self::EXTENSION_ID, $request->user(), 'save-config', [
            self::CONFIG_FILE => $before ?? '',
        ]);

        $this->fileRepository->setServer($server)->putContent(
            self::CONFIG_FILE,
            json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n"
        );

        return new JsonResponse(['data' => [
            'success' => true,
            'config' => $config,
        ]]);
    }

    public function listMods(ValheimWorldManagerListModsRequest $request, Server $server): JsonResponse
    {
        $bepinexInstalled = false;
        $mods = [];

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory(self::PLUGINS_DIR);
            $bepinexInstalled = true;

            foreach ($items as $item) {
                $name = (string) Arr::get($item, 'name', '');
                $isFile = (bool) Arr::get($item, 'file', true);
                $size = (int) Arr::get($item, 'size', 0);

                if ($isFile) {
                    $lower = strtolower($name);
                    if (!str_ends_with($lower, '.dll') && !str_ends_with($lower, '.dll.disabled')) {
                        continue;
                    }

                    $enabled = !str_ends_with($name, '.disabled');
                    $displayName = $enabled ? $name : substr($name, 0, -strlen('.disabled'));

                    $mods[] = [
                        'name' => $name,
                        'display_name' => $displayName,
                        'enabled' => $enabled,
                        'is_directory' => false,
                        'size' => $size,
                    ];
                } else {
                    $enabled = true;
                    try {
                        $dirItems = $this->fileRepository->setServer($server)->getDirectory(
                            self::PLUGINS_DIR . '/' . $name
                        );
                        foreach ($dirItems as $dirItem) {
                            if ((string) Arr::get($dirItem, 'name', '') === '.m12_disabled') {
                                $enabled = false;
                                break;
                            }
                        }
                    } catch (\Throwable) {
                        // Cannot read directory; assume enabled.
                    }

                    $mods[] = [
                        'name' => $name,
                        'display_name' => $name,
                        'enabled' => $enabled,
                        'is_directory' => true,
                        'size' => $size,
                    ];
                }
            }
        } catch (\Throwable) {
            // BepInEx not installed.
        }

        return new JsonResponse(['data' => [
            'mods' => $mods,
            'bepinex_installed' => $bepinexInstalled,
        ]]);
    }

    public function toggleMod(ValheimWorldManagerToggleModRequest $request, Server $server, string $mod): JsonResponse
    {
        if (str_contains($mod, '/') || str_contains($mod, '\\') || str_contains($mod, "\0")) {
            return new JsonResponse(['error' => 'Invalid mod name.'], 422);
        }

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory(self::PLUGINS_DIR);
        } catch (\Throwable) {
            return new JsonResponse(['error' => 'BepInEx plugins directory not found.'], 404);
        }

        $found = null;
        foreach ($items as $item) {
            $name = (string) Arr::get($item, 'name', '');
            $isFile = (bool) Arr::get($item, 'file', true);

            if ($name === $mod) {
                $found = ['name' => $name, 'is_file' => $isFile];
                break;
            }
        }

        if ($found === null) {
            return new JsonResponse(['error' => 'Mod not found.'], 404);
        }

        if ($found['is_file']) {
            $currentName = $found['name'];
            $enabled = !str_ends_with($currentName, '.disabled');

            $newName = $enabled
                ? $currentName . '.disabled'
                : substr($currentName, 0, -strlen('.disabled'));

            $content = $this->fileRepository->setServer($server)->getContent(
                self::PLUGINS_DIR . '/' . $currentName
            );
            $this->fileRepository->setServer($server)->putContent(
                self::PLUGINS_DIR . '/' . $newName,
                $content
            );
            $this->fileRepository->setServer($server)->deleteFiles([
                self::PLUGINS_DIR . '/' . $currentName,
            ]);

            return new JsonResponse(['data' => [
                'name' => $newName,
                'enabled' => !$enabled,
            ]]);
        }

        $dirName = $found['name'];
        $markerPath = self::PLUGINS_DIR . '/' . $dirName . '/.m12_disabled';

        $markerExists = false;
        try {
            $dirItems = $this->fileRepository->setServer($server)->getDirectory(
                self::PLUGINS_DIR . '/' . $dirName
            );
            foreach ($dirItems as $dirItem) {
                if ((string) Arr::get($dirItem, 'name', '') === '.m12_disabled') {
                    $markerExists = true;
                    break;
                }
            }
        } catch (\Throwable) {
            // Cannot read directory; assume no marker.
        }

        if ($markerExists) {
            $this->fileRepository->setServer($server)->deleteFiles([$markerPath]);
        } else {
            $this->fileRepository->setServer($server)->putContent($markerPath, '');
        }

        return new JsonResponse(['data' => [
            'name' => $dirName,
            'enabled' => $markerExists,
        ]]);
    }

    public function deleteMod(ValheimWorldManagerDeleteModRequest $request, Server $server, string $mod): JsonResponse
    {
        if (str_contains($mod, '/') || str_contains($mod, '\\') || str_contains($mod, "\0")) {
            return new JsonResponse(['error' => 'Invalid mod name.'], 422);
        }

        try {
            $items = $this->fileRepository->setServer($server)->getDirectory(self::PLUGINS_DIR);
        } catch (\Throwable) {
            return new JsonResponse(['error' => 'BepInEx plugins directory not found.'], 404);
        }

        $found = null;
        foreach ($items as $item) {
            $name = (string) Arr::get($item, 'name', '');
            $isFile = (bool) Arr::get($item, 'file', true);

            $displayName = ($isFile && str_ends_with($name, '.disabled'))
                ? substr($name, 0, -strlen('.disabled'))
                : $name;

            if ($name === $mod || $displayName === $mod) {
                $found = ['name' => $name];
                break;
            }
        }

        if ($found === null) {
            return new JsonResponse(['error' => 'Mod not found.'], 404);
        }

        $this->fileRepository->setServer($server)->deleteFiles([
            self::PLUGINS_DIR . '/' . $found['name'],
        ]);

        return new JsonResponse([], JsonResponse::HTTP_NO_CONTENT);
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
