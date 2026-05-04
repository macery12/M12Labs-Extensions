<?php

namespace Everest\Extensions\Packages\palworld_server_manager\Http\Controllers;

use Throwable;
use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Everest\Repositories\Wings\DaemonFileRepository;
use Everest\Services\Extensions\ExtensionFileSnapshotService;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\palworld_server_manager\Services\PalworldSettingsParser;
use Everest\Extensions\Packages\palworld_server_manager\Http\Requests\PalworldServerManagerStatusRequest;
use Everest\Extensions\Packages\palworld_server_manager\Http\Requests\PalworldServerManagerSaveRequest;
use Everest\Extensions\Packages\palworld_server_manager\Http\Requests\PalworldServerManagerPresetRequest;
use Everest\Extensions\Packages\palworld_server_manager\Http\Requests\PalworldServerManagerApplyPresetRequest;

class PalworldServerManagerController extends ClientApiController
{
    private const EXTENSION_ID = 'palworld_server_manager';
    private const SETTINGS_FILE = 'Pal/Saved/Config/LinuxServer/PalWorldSettings.ini';

    public function __construct(
        private DaemonFileRepository $fileRepository,
        private ExtensionFileSnapshotService $snapshotService,
    ) {
        parent::__construct();
    }

    /**
     * Return the current PalWorldSettings.ini as a parsed settings array.
     */
    public function index(PalworldServerManagerStatusRequest $request, Server $server): JsonResponse
    {
        $parser = new PalworldSettingsParser();

        try {
            $content = $this->fileRepository->setServer($server)->getContent(self::SETTINGS_FILE);
        } catch (Throwable) {
            return new JsonResponse([
                'data' => [
                    'settings'    => PalworldSettingsParser::defaults(),
                    'file_exists' => false,
                ],
            ]);
        }

        if (preg_match('/OptionSettings=\(.+\)/s', $content) !== 1) {
            Log::warning('[palworld_server_manager] OptionSettings line not found in PalWorldSettings.ini.', [
                'server_id' => $server->id,
            ]);

            return new JsonResponse([
                'data' => [
                    'settings'    => PalworldSettingsParser::defaults(),
                    'file_exists' => true,
                    'parse_error' => true,
                ],
            ]);
        }

        $settings = $parser->parse($content);

        return new JsonResponse([
            'data' => [
                'settings'    => $settings,
                'file_exists' => true,
            ],
        ]);
    }

    /**
     * Save the supplied settings back to PalWorldSettings.ini, creating a
     * snapshot of the previous content first.
     */
    public function saveSettings(PalworldServerManagerSaveRequest $request, Server $server): JsonResponse
    {
        $parser  = new PalworldSettingsParser();
        $payload = $request->validated();

        // Read current content (may not exist yet)
        $beforeContent = '';
        try {
            $beforeContent = $this->fileRepository->setServer($server)->getContent(self::SETTINGS_FILE);
        } catch (Throwable) {
            // File does not exist yet – write from scratch.
        }

        // Snapshot before writing
        if ($beforeContent !== '') {
            $this->snapshotService->create(
                $server,
                self::EXTENSION_ID,
                $request->user(),
                'save-settings',
                [self::SETTINGS_FILE => $beforeContent],
            );
        }

        // Merge payload over defaults so all keys are present in the file
        $settings    = array_merge(PalworldSettingsParser::defaults(), $payload);
        $newContent  = $parser->serialize($settings, $beforeContent);

        try {
            $this->fileRepository->setServer($server)->putContent(self::SETTINGS_FILE, $newContent);
        } catch (Throwable $e) {
            Log::error('[palworld_server_manager] Failed to write PalWorldSettings.ini.', [
                'server_id' => $server->id,
                'error'     => $e->getMessage(),
            ]);

            return new JsonResponse([
                'error' => 'Failed to write settings file. Ensure the server agent is reachable.',
            ], JsonResponse::HTTP_INTERNAL_SERVER_ERROR);
        }

        return new JsonResponse([
            'data' => ['success' => true],
        ]);
    }

    /**
     * Return the available preset profiles.
     */
    public function getPresets(PalworldServerManagerPresetRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse([
            'data' => [
                'presets' => $this->presetList(),
            ],
        ]);
    }

    /**
     * Apply a named preset over the current settings and persist the result.
     */
    public function applyPreset(PalworldServerManagerApplyPresetRequest $request, Server $server): JsonResponse
    {
        $presetId = (string) $request->input('preset_id');
        $presets  = $this->presetList();

        $preset = collect($presets)->firstWhere('id', $presetId);
        if (!$preset) {
            return new JsonResponse(['error' => 'Unknown preset.'], JsonResponse::HTTP_UNPROCESSABLE_ENTITY);
        }

        $parser = new PalworldSettingsParser();

        // Load current settings
        $beforeContent = '';
        $current       = PalworldSettingsParser::defaults();
        try {
            $beforeContent = $this->fileRepository->setServer($server)->getContent(self::SETTINGS_FILE);
            $current       = $parser->parse($beforeContent);
        } catch (Throwable) {
            // File does not exist yet.
        }

        // Merge preset over current settings
        $merged = array_merge($current, $preset['settings']);

        // Snapshot before writing
        if ($beforeContent !== '') {
            $this->snapshotService->create(
                $server,
                self::EXTENSION_ID,
                $request->user(),
                'apply-preset',
                [self::SETTINGS_FILE => $beforeContent],
            );
        }

        $newContent = $parser->serialize($merged, $beforeContent);

        try {
            $this->fileRepository->setServer($server)->putContent(self::SETTINGS_FILE, $newContent);
        } catch (Throwable $e) {
            Log::error('[palworld_server_manager] Failed to write PalWorldSettings.ini during preset apply.', [
                'server_id' => $server->id,
                'error'     => $e->getMessage(),
            ]);

            return new JsonResponse([
                'error' => 'Failed to write settings file. Ensure the server agent is reachable.',
            ], JsonResponse::HTTP_INTERNAL_SERVER_ERROR);
        }

        return new JsonResponse([
            'data' => ['settings' => $merged],
        ]);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Return the hardcoded preset definitions.
     *
     * @return list<array<string, mixed>>
     */
    private function presetList(): array
    {
        return [
            [
                'id'          => 'casual',
                'name'        => 'Casual',
                'description' => 'Easier rates for a relaxed experience',
                'settings'    => [
                    'Difficulty'              => 'None',
                    'ExpRate'                 => 2.0,
                    'PalCaptureRate'          => 2.0,
                    'PalSpawnNumRate'         => 1.5,
                    'DeathPenalty'            => 'None',
                    'WorkSpeedRate'           => 2.0,
                    'PalEggDefaultHatchingTime' => 24.0,
                    'bEnableNonLoginPenalty'  => false,
                    'bEnableFastTravel'       => true,
                    'DropItemAliveMaxHours'   => 2.0,
                ],
            ],
            [
                'id'          => 'normal',
                'name'        => 'Normal',
                'description' => 'Vanilla default settings',
                'settings'    => [
                    'Difficulty'              => 'None',
                    'ExpRate'                 => 1.0,
                    'PalCaptureRate'          => 1.0,
                    'PalSpawnNumRate'         => 1.0,
                    'DeathPenalty'            => 'All',
                    'WorkSpeedRate'           => 1.0,
                    'PalEggDefaultHatchingTime' => 72.0,
                    'bEnableNonLoginPenalty'  => true,
                    'bEnableFastTravel'       => true,
                    'DropItemAliveMaxHours'   => 1.0,
                ],
            ],
            [
                'id'          => 'hardcore',
                'name'        => 'Hardcore',
                'description' => 'Challenging settings for experienced players',
                'settings'    => [
                    'Difficulty'              => 'Difficult',
                    'ExpRate'                 => 0.5,
                    'PalCaptureRate'          => 0.5,
                    'PalSpawnNumRate'         => 0.8,
                    'DeathPenalty'            => 'All',
                    'WorkSpeedRate'           => 0.8,
                    'PalEggDefaultHatchingTime' => 120.0,
                    'bEnableNonLoginPenalty'  => true,
                    'bEnableFastTravel'       => false,
                    'DropItemAliveMaxHours'   => 0.5,
                    'bEnableInvaderEnemy'     => true,
                ],
            ],
        ];
    }
}
