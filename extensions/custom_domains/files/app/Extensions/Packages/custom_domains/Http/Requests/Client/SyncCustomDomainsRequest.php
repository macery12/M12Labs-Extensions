<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Client;

use Everest\Models\Permission;
use Everest\Http\Requests\Api\Client\ClientApiRequest;

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
