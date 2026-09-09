<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_icon_builder\Http\Controllers\MinecraftIconBuilderController;

// Mounted by the panel under
// /api/client/servers/{server}/extensions/ext/minecraft_icon_builder, with the
// server binding, client auth, the extensions.access gate and the per-extension
// client throttle applied by the loader. No prefix and no middleware here: a
// package declaring its own gate is a package that can weaken it.
Route::get('/', [MinecraftIconBuilderController::class, 'index']);
Route::post('/icon', [MinecraftIconBuilderController::class, 'saveIcon']);
