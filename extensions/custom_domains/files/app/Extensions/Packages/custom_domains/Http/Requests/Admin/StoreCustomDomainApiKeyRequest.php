<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

use Everest\Http\Requests\Api\Application\ApplicationApiRequest;

/**
 * Adding a Cloudflare credential.
 *
 * Writing a credential is an update-level act rather than create-level: it is
 * the capability that decides whether the panel can talk to Cloudflare at all.
 */
class StoreCustomDomainApiKeyRequest extends ApplicationApiRequest
{
    public function permission(): string
    {
        return 'ext.custom_domains.admin.update';
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:191|unique:ext_custom_domains_api_keys,name',
            'token' => 'required|string|min:20|max:500',
            'enabled' => 'sometimes|boolean',
        ];
    }
}
