<?php

namespace Everest\Extensions\Packages\ai\Http\Requests;

use Everest\Models\AdminRole;
use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

class GetIntelligenceRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return AdminRole::AI_READ;
    }
}
