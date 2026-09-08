<?php

namespace Everest\Extensions\Packages\custom_domains\Models;

use Everest\Models\Model;
use Everest\Models\Server;
use Everest\Models\Allocation;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One subdomain mapped to one server allocation.
 *
 * server_id and allocation_id are foreign keys into core tables, which a package
 * is allowed to hold with documented deletion behaviour. Both cascade: the rows
 * disappear the instant the server row is deleted, which is exactly why the
 * package subscribes to server.pre_delete rather than a post-delete event — by
 * then there is nothing left to read. See Hooks/CleanupServerDomains.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $allocation_id
 * @property int $custom_domain_id
 * @property string|null $subdomain
 * @property string|null $full_domain
 * @property int|null $port
 * @property string|null $protocol
 * @property string|null $service_tag
 * @property string|null $status
 * @property string|null $last_error
 * @property array|null $dns_records
 * @property \Carbon\Carbon|null $last_synced_at
 * @property CustomDomain|null $customDomain
 * @property Server $server
 * @property Allocation|null $allocation
 */
class ServerCustomDomain extends Model
{
    public const RESOURCE_NAME = 'server_custom_domain';

    protected $table = 'ext_custom_domains_server_domains';

    protected $guarded = ['id', self::CREATED_AT, self::UPDATED_AT];

    protected $casts = [
        'server_id' => 'integer',
        'allocation_id' => 'integer',
        'custom_domain_id' => 'integer',
        'port' => 'integer',
        'dns_records' => 'array',
        'last_synced_at' => 'datetime',
    ];

    public static array $validationRules = [
        'server_id' => 'required|integer|exists:servers,id',
        'allocation_id' => 'nullable|integer|exists:allocations,id',
        'custom_domain_id' => 'required|integer|exists:ext_custom_domains_domains,id',
        'subdomain' => ['required', 'string', 'max:191', 'regex:/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i'],
        'full_domain' => ['required', 'string', 'max:191', 'regex:/^(?!-)[A-Za-z0-9.-]+$/'],
        'port' => 'required|integer|min:1|max:65535',
        'protocol' => 'required|in:tcp,udp,both',
        'record_type' => 'nullable|in:srv,cname',
        'service_tag' => ['nullable', 'string', 'max:100', 'regex:/^(_?[a-z0-9][a-z0-9-]*|_[a-z0-9][a-z0-9-]*\._(?:tcp|udp)?|_[a-z0-9][a-z0-9-]*\._)$/i'],
    ];

    public function getRouteKeyName(): string
    {
        return 'id';
    }

    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public function allocation(): BelongsTo
    {
        return $this->belongsTo(Allocation::class);
    }

    public function customDomain(): BelongsTo
    {
        return $this->belongsTo(CustomDomain::class, 'custom_domain_id');
    }
}
