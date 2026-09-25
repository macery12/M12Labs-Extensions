<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

use Everest\Extensions\Sdk\Http\ApplicationApiRequest;

/**
 * The domain catalogue.
 */
class GetCustomDomainsRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return 'ext.custom_domains.admin.read';
    }
}
