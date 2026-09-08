<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

use Everest\Http\Requests\Api\Application\ApplicationApiRequest;

/**
 * Removing a parent domain, which cascades to every mapping built on it.
 */
class DeleteCustomDomainRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return 'ext.custom_domains.admin.delete';
    }
}
