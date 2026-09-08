<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Controllers;

use Everest\Models\Egg;
use Everest\Models\Nest;
use Illuminate\Http\Response;
use Illuminate\Http\JsonResponse;
use Everest\Extensions\Packages\custom_domains\Models\CustomDomain;
use Everest\Extensions\Packages\custom_domains\Models\CustomDomainApiKey;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\GetCustomDomainsRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\StoreCustomDomainRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\UpdateCustomDomainRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\DeleteCustomDomainRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\GetCustomDomainApiKeysRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\StoreCustomDomainApiKeyRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\UpdateCustomDomainApiKeyRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Admin\DeleteCustomDomainApiKeyRequest;
use Everest\Extensions\Packages\custom_domains\Services\CustomDomainProvisioningService;
use Everest\Http\Controllers\Api\Application\ApplicationApiController;
use Everest\Traits\Controllers\RespondsWithExtensionEnvelope;

/**
 * Admin surface for the domain catalogue and its Cloudflare credentials.
 *
 * Mounted by the loader under /api/application/extensions/ext/custom_domains
 * with admin auth and the extensions.admin gate already applied. Each action
 * declares exactly one FormRequest whose permission() names this package's own
 * ext.custom_domains.admin.* capability, which is what the panel's application
 * API authorizer gates on.
 */
class AdminCustomDomainController extends ApplicationApiController
{
    use RespondsWithExtensionEnvelope;

    public function index(GetCustomDomainsRequest $request): JsonResponse
    {
        $domains = CustomDomain::query()->with('apiKey')->orderBy('domain')->get();

        return $this->extensionListResponse($domains->map(function (CustomDomain $domain) {
                return [
                    'id' => $domain->id,
                    'domain' => $domain->domain,
                    'cloudflare_zone_id' => $domain->cloudflare_zone_id,
                    'api_key_id' => $domain->api_key_id,
                    'api_key_name' => $domain->apiKey?->name,
                    'allowed_nest_ids' => $domain->allowed_nest_ids ?? [],
                    'allowed_egg_ids' => $domain->allowed_egg_ids ?? [],
                    'service_tag' => $domain->service_tag,
                    'egg_service_tags' => $domain->egg_service_tags ?? (object) [],
                    'wildcard_enabled' => $domain->wildcard_enabled,
                    'enabled' => $domain->enabled,
                    'created_at' => $domain->created_at,
                    'updated_at' => $domain->updated_at,
                ];
        })->values()->all());
    }

    public function store(StoreCustomDomainRequest $request): JsonResponse
    {
        $domain = CustomDomain::query()->create([
            'domain' => strtolower($request->input('domain')),
            'cloudflare_zone_id' => $request->input('cloudflare_zone_id'),
            'api_key_id' => $request->integer('api_key_id') ?: null,
            'allowed_nest_ids' => array_values(array_unique(array_map('intval', (array) $request->input('allowed_nest_ids', [])))),
            'allowed_egg_ids' => array_values(array_unique(array_map('intval', (array) $request->input('allowed_egg_ids', [])))),
            'service_tag' => $request->filled('service_tag') ? strtolower((string) $request->input('service_tag')) : null,
            'egg_service_tags' => $this->sanitizeEggServiceTags((array) $request->input('egg_service_tags', [])),
            'wildcard_enabled' => $request->boolean('wildcard_enabled', false),
            'enabled' => $request->boolean('enabled', true),
        ]);

        return $this->extensionItemResponse('custom_domain', $domain->toArray(), Response::HTTP_CREATED);
    }

    public function update(UpdateCustomDomainRequest $request, CustomDomain $customDomain): JsonResponse
    {
        $customDomain->update([
            'domain' => strtolower($request->input('domain', $customDomain->domain)),
            'cloudflare_zone_id' => $request->input('cloudflare_zone_id', $customDomain->cloudflare_zone_id),
            'api_key_id' => $request->has('api_key_id') ? ($request->integer('api_key_id') ?: null) : $customDomain->api_key_id,
            'allowed_nest_ids' => $request->has('allowed_nest_ids')
                ? array_values(array_unique(array_map('intval', (array) $request->input('allowed_nest_ids', []))))
                : ($customDomain->allowed_nest_ids ?? []),
            'allowed_egg_ids' => $request->has('allowed_egg_ids')
                ? array_values(array_unique(array_map('intval', (array) $request->input('allowed_egg_ids', []))))
                : ($customDomain->allowed_egg_ids ?? []),
            'service_tag' => $request->has('service_tag')
                ? ($request->filled('service_tag') ? strtolower((string) $request->input('service_tag')) : null)
                : $customDomain->service_tag,
            'egg_service_tags' => $request->has('egg_service_tags')
                ? $this->sanitizeEggServiceTags((array) $request->input('egg_service_tags', []))
                : ($customDomain->egg_service_tags ?? (object) []),
            'wildcard_enabled' => $request->boolean('wildcard_enabled', $customDomain->wildcard_enabled),
            'enabled' => $request->boolean('enabled', $customDomain->enabled),
        ]);

        return $this->extensionItemResponse('custom_domain', $customDomain->fresh()->toArray());
    }

    public function destroy(DeleteCustomDomainRequest $request, CustomDomain $customDomain): Response
    {
        $customDomain->delete();

        return $this->returnNoContent();
    }

    public function apiKeys(GetCustomDomainApiKeysRequest $request): JsonResponse
    {
        $keys = CustomDomainApiKey::query()->orderBy('name')->get()->map(function (CustomDomainApiKey $key) {
            return [
                'id' => $key->id,
                'name' => $key->name,
                'enabled' => $key->enabled,
                'created_at' => $key->created_at,
                'updated_at' => $key->updated_at,
            ];
        })->values();

        return $this->extensionListResponse($keys->all());
    }

    public function storeApiKey(StoreCustomDomainApiKeyRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $key = CustomDomainApiKey::query()->create([
            'name' => trim((string) $validated['name']),
            'token' => trim((string) $validated['token']),
            'enabled' => (bool) ($validated['enabled'] ?? true),
        ]);

        return $this->extensionItemResponse('custom_domain_api_key', [
            'id' => $key->id,
            'name' => $key->name,
            'enabled' => $key->enabled,
            'created_at' => $key->created_at,
            'updated_at' => $key->updated_at,
        ], Response::HTTP_CREATED);
    }

    public function updateApiKey(UpdateCustomDomainApiKeyRequest $request, CustomDomainApiKey $apiKey): JsonResponse
    {
        $validated = $request->validated();

        $payload = [];
        if (array_key_exists('name', $validated)) {
            $payload['name'] = trim((string) $validated['name']);
        }
        if (!empty($validated['token'])) {
            $payload['token'] = trim((string) $validated['token']);
        }
        if (array_key_exists('enabled', $validated)) {
            $payload['enabled'] = (bool) $validated['enabled'];
        }

        if (!empty($payload)) {
            $apiKey->update($payload);
        }

        return $this->extensionItemResponse('custom_domain_api_key', [
            'id' => $apiKey->id,
            'name' => $apiKey->name,
            'enabled' => $apiKey->enabled,
            'created_at' => $apiKey->created_at,
            'updated_at' => $apiKey->updated_at,
        ]);
    }

    public function deleteApiKey(DeleteCustomDomainApiKeyRequest $request, CustomDomainApiKey $apiKey): Response
    {
        if (CustomDomain::query()->where('api_key_id', $apiKey->id)->exists()) {
            abort(422, 'This API key is assigned to one or more custom domains.');
        }

        $apiKey->delete();

        return $this->returnNoContent();
    }

    public function options(GetCustomDomainsRequest $request, CustomDomainProvisioningService $service): JsonResponse
    {
        $nests = Nest::query()->orderBy('name')->get(['id', 'uuid', 'name', 'description']);
        $eggs = Egg::query()->with('nest:id,name')->orderBy('name')->get(['id', 'uuid', 'nest_id', 'name', 'description']);

        return $this->extensionItemResponse('custom_domain_options', [
            'nests' => $nests->toArray(),
            'eggs' => $eggs->map(function (Egg $egg) use ($service) {
                    return [
                        'id' => $egg->id,
                        'uuid' => $egg->uuid,
                        'nest_id' => $egg->nest_id,
                        'nest_name' => $egg->nest?->name,
                        'name' => $egg->name,
                        'description' => $egg->description,
                        'default_service_tag' => $service->getDefaultServiceTagForEgg($egg->name, $egg->nest?->name),
                    ];
            })->values()->all(),
        ]);
    }

    private function sanitizeEggServiceTags(array $eggServiceTags): array
    {
        $result = [];
        foreach ($eggServiceTags as $eggId => $tag) {
            $id = (int) $eggId;
            if ($id < 1 || !is_string($tag)) {
                continue;
            }

            $normalized = strtolower(trim($tag));
            if ($normalized === '') {
                continue;
            }

            $result[(string) $id] = $normalized;
        }

        return $result;
    }
}
