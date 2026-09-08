<?php

namespace Everest\Extensions\Packages\custom_domains\Models;

use Everest\Models\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A parent domain an operator has curated. Server owners build subdomains on it.
 *
 * @property CustomDomainApiKey|null $apiKey
 */
class CustomDomain extends Model
{
    public const RESOURCE_NAME = 'custom_domain';

    // Package tables carry the ext_<id>_ prefix the manifest declares. That
    // prefix is what keeps two packages, and a package and core, from claiming
    // the same storage — the installer refuses a migration that creates a table
    // outside it.
    protected $table = 'ext_custom_domains_domains';

    protected $guarded = ['id', self::CREATED_AT, self::UPDATED_AT];

    protected $casts = [
        'wildcard_enabled' => 'boolean',
        'enabled' => 'boolean',
        'allowed_nest_ids' => 'array',
        'allowed_egg_ids' => 'array',
        'egg_service_tags' => 'array',
    ];

    public static array $validationRules = [
        'domain' => ['required', 'string', 'max:191', 'regex:/^(?!-)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/'],
        'cloudflare_zone_id' => 'nullable|string|max:191',
        'api_key_id' => 'nullable|integer|exists:ext_custom_domains_api_keys,id',
        'allowed_nest_ids' => 'nullable|array',
        'allowed_nest_ids.*' => 'integer|exists:nests,id',
        'allowed_egg_ids' => 'nullable|array',
        'allowed_egg_ids.*' => 'integer|exists:eggs,id',
        'service_tag' => ['nullable', 'string', 'max:100', 'regex:/^(_?[a-z0-9][a-z0-9-]*|_[a-z0-9][a-z0-9-]*\._(?:tcp|udp)?|_[a-z0-9][a-z0-9-]*\._)$/i'],
        'egg_service_tags' => 'nullable|array',
        'egg_service_tags.*' => ['nullable', 'string', 'max:100', 'regex:/^(_?[a-z0-9][a-z0-9-]*|_[a-z0-9][a-z0-9-]*\._(?:tcp|udp)?|_[a-z0-9][a-z0-9-]*\._)$/i'],
        'wildcard_enabled' => 'boolean',
        'enabled' => 'boolean',
    ];

    public function apiKey(): BelongsTo
    {
        return $this->belongsTo(CustomDomainApiKey::class, 'api_key_id');
    }

    public function serverDomains(): HasMany
    {
        return $this->hasMany(ServerCustomDomain::class, 'custom_domain_id');
    }
}
