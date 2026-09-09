<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\discordsrv_helper\Http\Controllers\DiscordSrvHelperController;

/*
|--------------------------------------------------------------------------
| DiscordSRV Helper Extension Routes
|--------------------------------------------------------------------------
|
| Mounted by the panel under
| /api/client/servers/{server}/extensions/ext/discordsrv_helper, with the server
| binding, client auth, the extensions.access gate and the per-extension client
| throttle applied by the loader. No prefix and no middleware here: a package
| declaring its own gate is a package that can weaken it.
|
| Each endpoint's FormRequest carries its own authorization. The extension gate
| establishes eligibility; it does not stand in for the file permissions these
| actions need, nor for the owner-only checks on the safety controls below.
*/

Route::get('/status', [DiscordSrvHelperController::class, 'status']);
Route::post('/install', [DiscordSrvHelperController::class, 'install']);
Route::post('/token', [DiscordSrvHelperController::class, 'setToken']);
Route::post('/channel', [DiscordSrvHelperController::class, 'setGlobalChannel']);

// Owner-only safety controls
Route::get('/history', [DiscordSrvHelperController::class, 'history']);
Route::post('/history/{snapshotId}/revert', [DiscordSrvHelperController::class, 'revert']);
Route::get('/subusers', [DiscordSrvHelperController::class, 'subusers']);
Route::post('/subusers/{subuserUuid}', [DiscordSrvHelperController::class, 'setSubuserAccess']);
