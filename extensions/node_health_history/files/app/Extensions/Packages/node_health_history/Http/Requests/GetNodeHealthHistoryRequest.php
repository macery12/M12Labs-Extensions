<?php

namespace Everest\Extensions\Packages\node_health_history\Http\Requests;

use Everest\Models\AdminRole;
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
        // Matches the admin page's gate (extensions.read) so an admin who can
        // see the page can also load its data.
        return AdminRole::EXTENSIONS_READ;
    }
}
