<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_startup_editor\Http\Controllers\StartupEditorController;

// Mounted by the panel under
// /api/client/servers/{server}/extensions/ext/minecraft_startup_editor, with the
// server binding, client auth, the extensions.access gate and the per-extension
// client throttle applied by the loader. No prefix and no middleware here: a
// package declaring its own gate is a package that can weaken it.
Route::get('/', [StartupEditorController::class, 'index']);
Route::post('/save', [StartupEditorController::class, 'save']);
Route::post('/reset', [StartupEditorController::class, 'reset']);
