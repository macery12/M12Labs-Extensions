<?php

use Illuminate\Support\Facades\Route;
use Everest\Extensions\Packages\custom_domains\Http\Controllers\AdminCustomDomainController;

// Mounted by the panel under /api/application/extensions/ext/custom_domains
// with admin auth, the extensions.admin gate and the per-extension throttle
// applied by the loader. This file must not set its own prefix or middleware,
// and must never call withoutMiddleware() — the route guard audits for exactly
// that and refuses to load a package that escapes its own namespace.
//
// There are no settings or credential routes here. Extension settings are
// stored and validated by the panel against the manifest's declared fields, and
// the account-wide Cloudflare token lives in the panel's encrypted secret
// store; both are edited from the extension's drawer rather than reimplemented
// by the package.
Route::get('/', [AdminCustomDomainController::class, 'index']);
Route::post('/', [AdminCustomDomainController::class, 'store']);
Route::get('/options', [AdminCustomDomainController::class, 'options']);

Route::get('/api-keys', [AdminCustomDomainController::class, 'apiKeys']);
Route::post('/api-keys', [AdminCustomDomainController::class, 'storeApiKey']);
Route::patch('/api-keys/{apiKey:id}', [AdminCustomDomainController::class, 'updateApiKey']);
Route::delete('/api-keys/{apiKey:id}', [AdminCustomDomainController::class, 'deleteApiKey']);

// Declared after /api-keys so the static segment ranks above this parameter.
Route::patch('/{customDomain:id}', [AdminCustomDomainController::class, 'update']);
Route::delete('/{customDomain:id}', [AdminCustomDomainController::class, 'destroy']);
