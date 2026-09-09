<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_log_uploader\Http\Controllers\LogUploaderController;

// Mounted by the panel under
// /api/client/servers/{server}/extensions/ext/minecraft_log_uploader, with the
// server binding, client auth, the extensions.access gate and the per-extension
// client throttle applied by the loader. No prefix and no middleware here: a
// package declaring its own gate is a package that can weaken it.
Route::get('/logs', [LogUploaderController::class, 'listLogs']);
Route::get('/logs/content', [LogUploaderController::class, 'getLog']);
Route::post('/logs/upload', [LogUploaderController::class, 'upload']);
