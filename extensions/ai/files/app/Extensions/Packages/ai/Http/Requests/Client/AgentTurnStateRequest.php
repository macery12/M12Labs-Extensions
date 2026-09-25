<?php

namespace Everest\Extensions\Packages\ai\Http\Requests\Client;

/**
 * Reading or stopping a turn already in flight.
 *
 * No rules: the turn id and the queue ticket are route parameters, and the
 * stream's resume cursor is a query string the controller bounds itself.
 */
class AgentTurnStateRequest extends ServerAgentRequest
{
    public function rules(): array
    {
        return [];
    }
}
