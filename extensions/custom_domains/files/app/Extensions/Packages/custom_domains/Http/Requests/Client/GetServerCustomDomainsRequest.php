<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Client;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

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
