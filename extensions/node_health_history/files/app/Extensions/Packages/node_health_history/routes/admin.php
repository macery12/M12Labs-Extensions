<?php

use Everest\Extensions\Packages\node_health_history\Http\Controllers\NodeHealthHistoryController;
use Illuminate\Support\Facades\Route;

// Mounted by the panel under /api/application/extensions/ext/node_health_history
// with admin auth + the extensions.admin gate applied by the loader. This file
// must not set its own prefix or middleware, and must never call
// withoutMiddleware().
Route::get('/', [NodeHealthHistoryController::class, 'index']);
