<?php

use Everest\Extensions\Packages\minecraft_startup_editor\Http\Controllers\StartupEditorController;
use Illuminate\Support\Facades\Route;

Route::group(['prefix' => '/minecraft_startup_editor', 'middleware' => ['extensions.access:minecraft_startup_editor']], function () {
    Route::get('/', [StartupEditorController::class, 'index']);
    Route::post('/save', [StartupEditorController::class, 'save']);
    Route::post('/reset', [StartupEditorController::class, 'reset']);
});
