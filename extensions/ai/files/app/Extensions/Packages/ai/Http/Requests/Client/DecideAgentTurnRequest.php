<?php

namespace Everest\Extensions\Packages\ai\Http\Requests\Client;

/**
 * Resolving something a turn suspended on -- an approval, a rejection, or an
 * answer to a question the agent asked.
 *
 * A fresh request rather than a message on the open stream, because the stream
 * that asked closes when the turn suspends.
 */
class DecideAgentTurnRequest extends ServerAgentRequest
{
    public function rules(): array
    {
        return [
            'turn_id' => 'required|uuid',
            'decision' => 'required|string|in:approve,reject,answer',
            'confirmation' => 'nullable|string|max:255',
            'answer' => 'nullable|string|max:500',
            'ticket' => 'nullable|string|max:64',
        ];
    }
}
