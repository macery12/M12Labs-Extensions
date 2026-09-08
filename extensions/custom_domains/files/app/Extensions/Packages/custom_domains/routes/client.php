<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\custom_domains\Http\Controllers\ServerCustomDomainController;

// Mounted by the panel under
// /api/client/servers/{server}/extensions/ext/custom_domains, with the server
// binding, client auth, the extensions.access gate and the per-extension client
// throttle applied by the loader. No prefix and no middleware here: a package
// declaring its own gate is a package that can weaken it.
Route::get('/', [ServerCustomDomainController::class, 'index']);
Route::get('/options', [ServerCustomDomainController::class, 'options']);
Route::post('/', [ServerCustomDomainController::class, 'store']);
Route::post('/sync', [ServerCustomDomainController::class, 'sync']);
Route::delete('/{customDomain:id}', [ServerCustomDomainController::class, 'destroy']);
