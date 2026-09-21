<?php

use Everest\Extensions\Packages\ai\Http\Controllers\AgentController;
use Everest\Extensions\Packages\ai\Http\Controllers\AIConversationController;

/*
|--------------------------------------------------------------------------
| Server assistant
|--------------------------------------------------------------------------
|
| Mounted by the loader at
|   /api/client/servers/{server}/extensions/ext/ai
|
| No prefix, middleware or group here: the loader owns all three, and the
| server is already bound by the time this file is required.
|
| Every path below changed with the move. The panel's old /ai/* client routes
| are gone and no redirect replaces them -- a request that no longer matches
| gets the panel's ordinary missing-route behaviour.
*/

// A turn. `decide` resolves an action the turn suspended on; approvals arrive
// on a fresh request because the stream that asked for one closes when the
// turn suspends.
Route::post('/agent', [AgentController::class, 'start']);
Route::post('/agent/decide', [AgentController::class, 'decide']);
Route::get('/agent/turns/{turnId}', [AgentController::class, 'turnStatus']);

// Rejoining a durable turn. `active` is what a freshly loaded page asks to
// discover there is one at all; `stream` replays from the cursor the client
// presents and then follows the turn live.
Route::get('/agent/active', [AgentController::class, 'activeTurn']);
Route::get('/agent/turns/{turnId}/stream', [AgentController::class, 'stream']);

// Stopping a turn and giving up a queue place are separate, because the two
// states are: a queued turn has a ticket and no turn id, and nothing of it has
// run.
Route::post('/agent/turns/{turnId}/cancel', [AgentController::class, 'cancelTurn']);
Route::delete('/agent/queue/{ticket}', [AgentController::class, 'releaseQueue']);

Route::prefix('/conversations')->group(function () {
    Route::get('/', [AIConversationController::class, 'index']);
    Route::get('/{conversationId}', [AIConversationController::class, 'show']);
    Route::delete('/{conversationId}', [AIConversationController::class, 'destroy']);
    Route::patch('/{conversationId}/save', [AIConversationController::class, 'toggleSave']);
});
