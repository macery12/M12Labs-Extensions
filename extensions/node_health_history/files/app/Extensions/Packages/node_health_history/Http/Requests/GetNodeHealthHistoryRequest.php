<?php

namespace Everest\Extensions\Packages\node_health_history\Http\Requests;

use Everest\Http\Requests\Api\Application\ApplicationApiRequest;

class GetNodeHealthHistoryRequest extends ApplicationApiRequest
{
    public function rules(): array
    {
        return [
            'hours' => 'sometimes|integer|min:1|max:168',
        ];
    }

    public function permission(): string
    {
        // This extension's own permission, declared under
        // capabilities.permissions.admin and namespaced by the panel. It gates
        // the admin page as well, so an admin who can open the page can load
        // its data — and an admin granted nothing else on this panel can be
        // given node health without also being given extension management.
        return 'ext.node_health_history.admin.read';
    }
}
