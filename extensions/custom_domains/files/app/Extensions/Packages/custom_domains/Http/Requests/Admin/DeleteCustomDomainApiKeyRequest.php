<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

/**
 * Removing a Cloudflare credential.
 */
class DeleteCustomDomainApiKeyRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return 'ext.custom_domains.admin.delete';
    }
}
