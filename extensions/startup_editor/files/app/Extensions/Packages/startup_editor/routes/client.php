<?php

use Everest\Extensions\Packages\startup_editor\Http\Controllers\StartupEditorController;
use Illuminate\Support\Facades\Route;

Route::group(['prefix' => '/startup_editor', 'middleware' => ['extensions.access:startup_editor']], function () {
    Route::get('/', [StartupEditorController::class, 'index']);
    Route::post('/save', [StartupEditorController::class, 'save']);
    Route::post('/reset', [StartupEditorController::class, 'reset']);
});
