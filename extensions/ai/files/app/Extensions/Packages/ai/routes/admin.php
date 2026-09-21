<?php

use Everest\Extensions\Packages\ai\Http\Controllers\AiAgentController;
use Everest\Extensions\Packages\ai\Http\Controllers\IntelligenceController;

/*
|--------------------------------------------------------------------------
| Settings, diagnostics and the admin assistant
|--------------------------------------------------------------------------
|
| Mounted by the loader at
|   /api/application/extensions/ext/ai
|
| Authorization is each action's FormRequest, which returns
| ext.ai.admin.read or ext.ai.admin.update -- the two permissions the manifest
| declares. Nothing here is gated by a route middleware the file could remove.
*/

Route::get('/settings', [IntelligenceController::class, 'index']);
Route::put('/settings', [IntelligenceController::class, 'update']);
Route::get('/test', [IntelligenceController::class, 'testConnection']);
Route::post('/test-tools', [IntelligenceController::class, 'probeToolCalling']);
Route::get('/models', [IntelligenceController::class, 'models']);
Route::get('/stats', [IntelligenceController::class, 'stats']);
Route::get('/logs', [IntelligenceController::class, 'recentLogs']);

// The agent's tool policy and the live state of the inference backend.
Route::get('/tools', [AiAgentController::class, 'tools']);
Route::put('/tools', [AiAgentController::class, 'updateTools']);
Route::get('/inference', [AiAgentController::class, 'inference']);

// The admin assistant. `decide` resolves an approval or a question the turn
// suspended on -- both arrive on a fresh request, because the stream that
// asked closes when the turn suspends.
Route::post('/agent', [AiAgentController::class, 'start']);
Route::post('/agent/decide', [AiAgentController::class, 'decide']);
Route::get('/agent/turns/{turnId}', [AiAgentController::class, 'turnStatus']);
Route::post('/agent/turns/{turnId}/cancel', [AiAgentController::class, 'cancelTurn']);
Route::delete('/agent/queue/{ticket}', [AiAgentController::class, 'releaseQueue']);

Route::prefix('/agent/conversations')->group(function () {
    Route::get('/', [AiAgentController::class, 'conversations']);
    Route::get('/{conversationId}', [AiAgentController::class, 'conversation']);
    Route::delete('/{conversationId}/assist', [AiAgentController::class, 'endAssist']);
    Route::delete('/{conversationId}', [AiAgentController::class, 'deleteConversation']);
});
