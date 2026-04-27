<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_version_changer\Http\Controllers\VersionChangerController;

Route::group([
    'prefix' => '/minecraft_version_changer',
    'middleware' => ['extensions.access:minecraft_version_changer'],
], function () {
    Route::get('/', [VersionChangerController::class, 'status']);
    Route::get('/versions/{loader}', [VersionChangerController::class, 'versions']);
    Route::get('/builds/{loader}/{mcVersion}', [VersionChangerController::class, 'builds']);
    Route::post('/backup', [VersionChangerController::class, 'backup']);
    Route::post('/switch', [VersionChangerController::class, 'switch']);
});
