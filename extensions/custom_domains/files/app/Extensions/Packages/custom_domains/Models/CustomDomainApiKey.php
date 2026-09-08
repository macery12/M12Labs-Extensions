<?php

namespace Everest\Extensions\Packages\custom_domains\Models;

use Everest\Models\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A named Cloudflare credential. One domain may point at one key, so an operator
 * can serve domains from separate Cloudflare accounts.
 *
 * The token is encrypted at rest by the cast. It is never returned by the API —
 * the controllers expose only whether a key has one.
 */
class CustomDomainApiKey extends Model
{
    public const RESOURCE_NAME = 'custom_domain_api_key';

    protected $table = 'ext_custom_domains_api_keys';

    protected $guarded = ['id', self::CREATED_AT, self::UPDATED_AT];

    protected $casts = [
        'token' => 'encrypted',
        'enabled' => 'boolean',
    ];

    public static array $validationRules = [
        'name' => 'required|string|max:191',
        'token' => 'required|string|min:20|max:500',
        'enabled' => 'sometimes|boolean',
    ];

    public function customDomains(): HasMany
    {
        return $this->hasMany(CustomDomain::class, 'api_key_id');
    }
}
