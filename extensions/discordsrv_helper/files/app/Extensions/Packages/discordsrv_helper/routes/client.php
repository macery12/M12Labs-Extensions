<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\discordsrv_helper\Http\Controllers\DiscordSrvHelperController;

/*
|--------------------------------------------------------------------------
| DiscordSRV Helper Extension Routes
|--------------------------------------------------------------------------
*/

Route::group([
    'prefix' => '/discordsrv_helper',
    'middleware' => ['extensions.access:discordsrv_helper'],
], function () {
    Route::get('/status', [DiscordSrvHelperController::class, 'status']);
    Route::post('/install', [DiscordSrvHelperController::class, 'install']);
    Route::post('/token', [DiscordSrvHelperController::class, 'setToken']);
    Route::post('/channel', [DiscordSrvHelperController::class, 'setGlobalChannel']);

    // Owner-only safety controls
    Route::get('/history', [DiscordSrvHelperController::class, 'history']);
    Route::post('/history/{snapshotId}/revert', [DiscordSrvHelperController::class, 'revert']);
    Route::get('/subusers', [DiscordSrvHelperController::class, 'subusers']);
    Route::post('/subusers/{subuserUuid}', [DiscordSrvHelperController::class, 'setSubuserAccess']);
});
