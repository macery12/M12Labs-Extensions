<?php

namespace Everest\Extensions\Packages\custom_domains\Jobs;

use Everest\Extensions\Jobs\ExtensionJob;
use Everest\Extensions\Packages\custom_domains\Models\ServerCustomDomain;
use Everest\Extensions\Packages\custom_domains\Services\CustomDomainProvisioningService;

/**
 * Provisions one mapping's DNS records.
 *
 * Everything that used to be declared with #[Timeout], #[Tries], #[Backoff] and
 * a RateLimited middleware is now read from the verified manifest's `dns` queue
 * group by ExtensionJob. A package deciding its own retry and timeout budget is
 * a package that can pin a worker and retry a failing external call forever.
 *
 * Retrying is safe: the provisioning service creates-or-updates each record
 * rather than blindly creating, so two runs converge on the same result.
 */
class ProvisionCustomDomainRecordJob extends ExtensionJob
{
    public function __construct(private int $mappingId)
    {
        parent::__construct();
    }

    public function queueGroup(): string
    {
        return 'dns';
    }

    /**
     * Serialize per mapping rather than per class, so two servers provision
     * concurrently while one mapping never does.
     */
    public function overlapKey(): string
    {
        return static::class . ':' . $this->mappingId;
    }

    public function handle(CustomDomainProvisioningService $service): void
    {
        $mapping = ServerCustomDomain::query()
            ->with(['customDomain.apiKey', 'server.node', 'allocation'])
            ->find($this->mappingId);

        if (!$mapping) {
            return;
        }

        $service->provision($mapping);
    }
}
