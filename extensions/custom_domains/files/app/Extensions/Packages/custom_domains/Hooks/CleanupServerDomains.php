<?php

namespace Everest\Extensions\Packages\custom_domains\Hooks;

use Illuminate\Support\Facades\Log;
use Everest\Extensions\Hooks\HookHandler;
use Everest\Extensions\Packages\custom_domains\Models\ServerCustomDomain;
use Everest\Extensions\Packages\custom_domains\Services\CustomDomainProvisioningService;

/**
 * Withdraws a server's DNS records before the server row is deleted.
 *
 * Declared `synchronous_best_effort`, and that is not a preference — it is the
 * only mode that can work here. ext_custom_domains_server_domains has a
 * cascadeOnDelete foreign key on servers.id, so the rows vanish the instant the
 * server row does. A queued handler runs after the cascade and would find
 * nothing to clean up; it would have to read the panel's tombstone instead. A
 * synchronous handler runs before the transaction, while the rows are still
 * there, which is what this needs.
 *
 * Best-effort is also the honest contract: this makes outbound Cloudflare calls,
 * and a server deletion must not hang on someone else's API. A failure here
 * leaves stale DNS records pointing at a server that no longer exists — bad, but
 * strictly better than a deletion that cannot complete. Nothing thrown from here
 * reaches the deletion: the dispatcher isolates each handler.
 */
class CleanupServerDomains implements HookHandler
{
    public function __construct(private CustomDomainProvisioningService $service)
    {
    }

    public function handle(array $envelope): void
    {
        $serverId = (int) ($envelope['payload']['serverId'] ?? 0);
        if ($serverId < 1) {
            return;
        }

        $mappings = ServerCustomDomain::query()
            ->with('customDomain.apiKey')
            ->where('server_id', $serverId)
            ->get();

        foreach ($mappings as $mapping) {
            try {
                $this->service->cleanup($mapping);
            } catch (\Throwable $exception) {
                // One unreachable zone must not strand the rest. The row is
                // left for the cascade either way; this is only about the
                // records that live at Cloudflare.
                Log::warning('Custom domain cleanup failed during server deletion', [
                    'extension' => 'custom_domains',
                    'server_id' => $serverId,
                    'mapping_id' => $mapping->id,
                    'full_domain' => $mapping->full_domain,
                    'error' => $exception->getMessage(),
                ]);
            }
        }
    }
}
