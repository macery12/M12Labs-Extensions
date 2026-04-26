<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\minecraft_property_editor\Http\Controllers\PropertyEditorController;

Route::group([
    'prefix' => '/minecraft_property_editor',
    'middleware' => ['extensions.access:minecraft_property_editor'],
], function () {
    Route::get('/', [PropertyEditorController::class, 'index']);
    Route::post('/save', [PropertyEditorController::class, 'save']);
});
