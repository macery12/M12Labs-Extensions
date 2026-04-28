<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Controllers\LogUploaderController;

Route::group(['prefix' => '/minecraft_log_uploader', 'middleware' => ['extensions.access:minecraft_log_uploader']], function () {
    Route::get('/logs', [LogUploaderController::class, 'listLogs']);
    Route::get('/logs/content', [LogUploaderController::class, 'getLog']);
    Route::post('/logs/upload', [LogUploaderController::class, 'upload']);
});
