<?php

namespace Everest\Extensions\Packages\minecraft_startup_editor\Http\Controllers;

use Everest\Models\Server;
use Everest\Facades\Activity;
use Illuminate\Http\JsonResponse;
use Everest\Services\Servers\StartupCommandService;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Traits\Controllers\RespondsWithExtensionEnvelope;
use Everest\Extensions\Packages\minecraft_startup_editor\Http\Requests\GetStartupEditorRequest;
use Everest\Extensions\Packages\minecraft_startup_editor\Http\Requests\ResetStartupEditorRequest;
use Everest\Extensions\Packages\minecraft_startup_editor\Http\Requests\SaveStartupEditorRequest;
use Everest\Extensions\Packages\minecraft_startup_editor\MinecraftStartupOptions;

/**
 * The curated startup editor for a single server.
 *
 * Mounted by the loader under
 * /api/client/servers/{server}/extensions/ext/minecraft_startup_editor, with the
 * server binding, client auth and the extensions.access gate applied there. The
 * package's route file declares no prefix and no middleware of its own.
 *
 * No endpoint accepts command text. A save names option IDs from the
 * server-side allowlist and the command is rendered here, so the worst a caller
 * can express is a different combination of reviewed flags.
 */
class StartupEditorController extends ClientApiController
{
    use RespondsWithExtensionEnvelope;

    public function __construct(
        private StartupCommandService $startupCommandService,
    ) {
        parent::__construct();
    }

    public function index(GetStartupEditorRequest $request, Server $server): JsonResponse
    {
        $rawStartup       = $server->startup;
        $eggDefault       = $server->egg->startup;
        $isUsingEggDefault = is_null($rawStartup) || $rawStartup === '';

        return $this->extensionItemResponse('minecraft_startup_editor_state', [
            'raw_startup' => $rawStartup,
            'egg_default' => $eggDefault,
            'rendered_command' => $this->startupCommandService->handle($server),
            'is_using_egg_default' => $isUsingEggDefault,
            'egg_name' => $server->egg->name,
            'detected_loader' => MinecraftStartupOptions::detectLoader($server->egg->name),
            // The heap the allocation supports, so the editor can bound its own
            // inputs to what SaveStartupEditorRequest will actually accept.
            'memory_mb' => (int) $server->memory,
        ]);
    }

    public function save(SaveStartupEditorRequest $request, Server $server): JsonResponse
    {
        $original        = $server->startup;
        $selectedOptions = $request->input('selected_options', []);
        $xmsMb           = (int) ($request->input('xms_mb') ?? 256);
        $xmxMb           = (int) ($request->input('xmx_mb') ?? 1024);
        $jarVar          = MinecraftStartupOptions::extractJarVariable($server->egg->startup);
        $startup         = MinecraftStartupOptions::buildStartupCommand($selectedOptions, $jarVar, $xmsMb, $xmxMb);

        $server->startup = $startup;
        $server->save();

        Activity::event('server:startup.command')
            ->property([
                'old' => $original,
                'new' => $startup,
            ])
            ->log();

        return $this->extensionItemResponse('minecraft_startup_editor_save', [
            'rendered_command' => $this->startupCommandService->handle($server),
            'raw_startup' => $startup,
            'is_using_egg_default' => false,
        ]);
    }

    public function reset(ResetStartupEditorRequest $request, Server $server): JsonResponse
    {
        $original = $server->startup;

        $server->startup = null;
        $server->save();

        Activity::event('server:startup.command')
            ->property([
                'old' => $original,
                'new' => null,
            ])
            ->log();

        return $this->extensionItemResponse('minecraft_startup_editor_save', [
            'rendered_command' => $this->startupCommandService->handle($server),
            'raw_startup' => null,
            'is_using_egg_default' => true,
            'egg_default' => $server->egg->startup,
        ]);
    }
}
