<?php

namespace Everest\Extensions\Packages\ai\Http\Requests\Client;

/** Opening a turn: the question, and optionally what the console currently shows. */
class StartAgentTurnRequest extends ServerAgentRequest
{
    public function rules(): array
    {
        return [
            'query' => 'required|string|min:1|max:8000',
            'conversation_id' => 'nullable|integer',
            'console' => 'nullable|string|max:20000',
            'ticket' => 'nullable|string|max:64',
        ];
    }
}
