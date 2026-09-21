<?php

namespace Everest\Extensions\Packages\ai\Http\Requests;

use Everest\Models\AdminRole;
use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

/**
 * Approving, rejecting or answering a suspended admin agent turn.
 *
 * The tool the approval releases re-checks its own capability when it runs, so
 * `ai.read` here does not let an administrator approve something they could not
 * have done by hand.
 */
class AgentDecisionRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return AdminRole::AI_READ;
    }

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
