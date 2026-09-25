<?php

namespace Everest\Extensions\Packages\minecraft_startup_editor\Http\Controllers;

use Everest\Models\Server;
use Everest\Extensions\Sdk\Services\ServerStartup;
use Everest\Extensions\Sdk\Services\PanelActivity;
use Illuminate\Http\JsonResponse;
use Everest\Extensions\Sdk\Http\ClientApiController;
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

    public function __construct()
    {
        parent::__construct();
    }

    private function activity(): PanelActivity
    {
        return PanelActivity::for('minecraft_startup_editor');
    }

    public function index(GetStartupEditorRequest $request, Server $server): JsonResponse
    {
        $startup    = ServerStartup::for($server);
        $eggDefault = $server->egg->startup;

        return $this->extensionItemResponse('minecraft_startup_editor_state', [
            'raw_startup' => $startup->raw(),
            'egg_default' => $eggDefault,
            'rendered_command' => $startup->rendered(),
            'is_using_egg_default' => $startup->usesEggDefault(),
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

        // Through the SDK, not $server->save(): writing the column directly
        // leaves ServerUpdatedHook undispatched, so every extension subscribed
        // to server.updated silently misses a startup change. The command is
        // rendered above from the validated allowlist and never from request
        // input, which is what makes a client-permission write to this column
        // safe -- see ServerStartup::replace().
        $startupWriter = ServerStartup::for($server);
        $startupWriter->replace($startup);

        $this->activity()->record('startup.command', [
            'old' => $original,
            'new' => $startup,
        ]);

        return $this->extensionItemResponse('minecraft_startup_editor_save', [
            'rendered_command' => $startupWriter->rendered(),
            'raw_startup' => $startup,
            'is_using_egg_default' => false,
        ]);
    }

    public function reset(ResetStartupEditorRequest $request, Server $server): JsonResponse
    {
        $original = $server->startup;

        $startupWriter = ServerStartup::for($server);
        $startupWriter->replace(null);

        $this->activity()->record('startup.command', [
            'old' => $original,
            'new' => null,
        ]);

        return $this->extensionItemResponse('minecraft_startup_editor_save', [
            'rendered_command' => $startupWriter->rendered(),
            'raw_startup' => null,
            'is_using_egg_default' => true,
            'egg_default' => $server->egg->startup,
        ]);
    }
}
