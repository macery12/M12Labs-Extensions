<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

/**
 * The Cloudflare credential list. Tokens are never returned.
 */
class GetCustomDomainApiKeysRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return 'ext.custom_domains.admin.read';
    }
}
