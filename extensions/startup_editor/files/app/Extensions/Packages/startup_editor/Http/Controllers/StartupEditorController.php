<?php

namespace Everest\Extensions\Packages\startup_editor\Http\Controllers;

use Everest\Models\Server;
use Everest\Facades\Activity;
use Illuminate\Http\JsonResponse;
use Everest\Services\Servers\StartupCommandService;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Extensions\Packages\startup_editor\Http\Requests\GetStartupEditorRequest;
use Everest\Extensions\Packages\startup_editor\Http\Requests\ResetStartupEditorRequest;
use Everest\Extensions\Packages\startup_editor\Http\Requests\SaveStartupEditorRequest;
use Everest\Extensions\Packages\startup_editor\MinecraftStartupOptions;

class StartupEditorController extends ClientApiController
{
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

        return new JsonResponse([
            'object' => 'extension_startup_editor',
            'attributes' => [
                'raw_startup'        => $rawStartup,
                'egg_default'        => $eggDefault,
                'rendered_command'   => $this->startupCommandService->handle($server),
                'is_using_egg_default' => $isUsingEggDefault,
                'egg_name'           => $server->egg->name,
                'detected_loader'    => MinecraftStartupOptions::detectLoader($server->egg->name),
            ],
        ]);
    }

    public function save(SaveStartupEditorRequest $request, Server $server): JsonResponse
    {
        $original        = $server->startup;
        $selectedOptions = $request->input('selected_options', []);
        $jarVar          = MinecraftStartupOptions::extractJarVariable($server->egg->startup);
        $startup         = MinecraftStartupOptions::buildStartupCommand($selectedOptions, $jarVar);

        $server->startup = $startup;
        $server->save();

        Activity::event('server:startup.command')
            ->property([
                'old' => $original,
                'new' => $startup,
            ])
            ->log();

        return new JsonResponse([
            'object' => 'extension_startup_editor_save',
            'attributes' => [
                'rendered_command'  => $this->startupCommandService->handle($server),
                'raw_startup'       => $startup,
                'is_using_egg_default' => false,
            ],
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

        return new JsonResponse([
            'object' => 'extension_startup_editor_save',
            'attributes' => [
                'rendered_command'    => $this->startupCommandService->handle($server),
                'raw_startup'         => null,
                'is_using_egg_default' => true,
                'egg_default'         => $server->egg->startup,
            ],
        ]);
    }
}
