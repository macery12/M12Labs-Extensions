<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\valheim_world_manager\Http\Controllers\ValheimWorldManagerController;

/*
|--------------------------------------------------------------------------
| Valheim World Manager Extension Routes
|--------------------------------------------------------------------------
*/

Route::group([
    'prefix' => '/valheim_world_manager',
    'middleware' => ['extensions.access:valheim_world_manager'],
], function () {
    Route::get('/', [ValheimWorldManagerController::class, 'index']);
    Route::get('/worlds', [ValheimWorldManagerController::class, 'listWorlds']);
    Route::delete('/worlds/{world}', [ValheimWorldManagerController::class, 'deleteWorld']);
    Route::get('/config', [ValheimWorldManagerController::class, 'getConfig']);
    Route::post('/config', [ValheimWorldManagerController::class, 'saveConfig']);
    Route::get('/mods', [ValheimWorldManagerController::class, 'listMods']);
    Route::post('/mods/{mod}/toggle', [ValheimWorldManagerController::class, 'toggleMod']);
    Route::delete('/mods/{mod}', [ValheimWorldManagerController::class, 'deleteMod']);
});
