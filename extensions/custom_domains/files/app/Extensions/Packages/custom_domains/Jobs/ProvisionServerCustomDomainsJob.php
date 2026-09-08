<?php

namespace Everest\Extensions\Packages\custom_domains\Jobs;

use Everest\Extensions\Jobs\ExtensionJob;
use Everest\Extensions\Packages\custom_domains\Models\ServerCustomDomain;
use Everest\Extensions\Packages\custom_domains\Services\CustomDomainProvisioningService;

/**
 * Re-provisions every mapping on one server, which is N Cloudflare round trips.
 *
 * The rows are queried by server_id rather than through a relation on the core
 * Server model. A package cannot add a relation to a core model — that coupling
 * is exactly what the extraction removes — so the join lives here.
 */
class ProvisionServerCustomDomainsJob extends ExtensionJob
{
    public function __construct(private int $serverId)
    {
        parent::__construct();
    }

    public function queueGroup(): string
    {
        return 'dns';
    }

    /**
     * Per server: a bulk re-provision stacking on itself would double the API
     * spend for no benefit, since the later run only redoes the same upserts.
     */
    public function overlapKey(): string
    {
        return static::class . ':' . $this->serverId;
    }

    public function handle(CustomDomainProvisioningService $service): void
    {
        $mappings = ServerCustomDomain::query()
            ->with(['customDomain.apiKey', 'server.node', 'allocation'])
            ->where('server_id', $this->serverId)
            ->get();

        foreach ($mappings as $mapping) {
            $service->provision($mapping);
        }
    }
}
