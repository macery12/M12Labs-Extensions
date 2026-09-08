<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Requests\Admin;

/**
 * Editing a Cloudflare credential. An omitted token leaves the stored one
 * alone, so the form never has to round-trip a secret to change a name.
 */
class UpdateCustomDomainApiKeyRequest extends StoreCustomDomainApiKeyRequest
{
    public function rules(): array
    {
        $apiKey = $this->route('apiKey');
        $id = $apiKey?->id ?? 'NULL';

        return [
            'name' => 'sometimes|required|string|max:191|unique:ext_custom_domains_api_keys,name,' . $id,
            'token' => 'nullable|string|min:20|max:500',
            'enabled' => 'sometimes|boolean',
        ];
    }
}
