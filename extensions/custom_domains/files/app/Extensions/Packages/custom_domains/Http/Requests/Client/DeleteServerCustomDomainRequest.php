<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Client;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

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
