<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Client;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Listing a server's mappings, and the domains available to it.
 */
class GetServerCustomDomainsRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_ALLOCATION_READ;
    }
}
