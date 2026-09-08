<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Client;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Releasing a mapping and withdrawing its DNS records.
 */
class DeleteServerCustomDomainRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_ALLOCATION_UPDATE;
    }
}
