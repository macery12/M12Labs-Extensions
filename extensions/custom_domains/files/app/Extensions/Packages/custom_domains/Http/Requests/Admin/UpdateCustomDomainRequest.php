<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

/**
 * Editing a parent domain. Same rules as creating one, different capability.
 */
class UpdateCustomDomainRequest extends StoreCustomDomainRequest
{
    public function permission(): string
    {
        return 'ext.custom_domains.admin.update';
    }
}
