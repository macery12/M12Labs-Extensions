<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\palworld_server_manager\Http\Controllers\PalworldServerManagerController;

/*
|--------------------------------------------------------------------------
| Palworld Server Manager Extension Routes
|--------------------------------------------------------------------------
*/

Route::group(['prefix' => '/palworld_server_manager', 'middleware' => ['extensions.access:palworld_server_manager']], function () {
    Route::get('/', [PalworldServerManagerController::class, 'index']);
    Route::post('/settings', [PalworldServerManagerController::class, 'saveSettings']);
    Route::get('/presets', [PalworldServerManagerController::class, 'getPresets']);
    Route::post('/apply-preset', [PalworldServerManagerController::class, 'applyPreset']);
});
