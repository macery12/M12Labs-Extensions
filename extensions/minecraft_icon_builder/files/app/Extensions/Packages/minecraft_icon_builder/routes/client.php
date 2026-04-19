<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_icon_builder\Http\Controllers\MinecraftIconBuilderController;

Route::group(['prefix' => '/minecraft_icon_builder', 'middleware' => ['extensions.access:minecraft_icon_builder']], function () {
    Route::get('/',      [MinecraftIconBuilderController::class, 'index']);
    Route::post('/icon', [MinecraftIconBuilderController::class, 'saveIcon']);
});
