<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Client;

use Everest\Extensions\Sdk\Permission;
use Everest\Extensions\Sdk\Http\ClientApiRequest;

/**
 * Re-pushing every mapping on the server to Cloudflare.
 */
class SyncCustomDomainsRequest extends ClientApiRequest
{
    public function permission(): string
    {
        return Permission::ACTION_ALLOCATION_UPDATE;
    }
}
