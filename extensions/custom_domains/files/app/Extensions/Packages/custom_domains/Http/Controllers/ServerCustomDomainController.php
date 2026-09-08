<?php

namespace Everest\Extensions\Packages\custom_domains\Http\Controllers;

use Everest\Models\Server;
use Illuminate\Http\JsonResponse;
use Everest\Http\Controllers\Api\Client\ClientApiController;
use Everest\Traits\Controllers\RespondsWithExtensionEnvelope;
use Everest\Extensions\Packages\custom_domains\Models\ServerCustomDomain;
use Everest\Extensions\Packages\custom_domains\Jobs\ProvisionCustomDomainRecordJob;
use Everest\Extensions\Packages\custom_domains\Jobs\ProvisionServerCustomDomainsJob;
use Everest\Extensions\Packages\custom_domains\Services\CustomDomainProvisioningService;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Client\SyncCustomDomainsRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Client\GetServerCustomDomainsRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Client\StoreServerCustomDomainRequest;
use Everest\Extensions\Packages\custom_domains\Http\Requests\Client\DeleteServerCustomDomainRequest;

/**
 * A server owner's own domain mappings.
 *
 * Mounted by the loader under
 * /api/client/servers/{server}/extensions/ext/custom_domains, with the server
 * binding, client auth and the extensions.access gate applied there. The
 * package's route file declares no prefix and no middleware of its own.
 *
 * Rows are read by server_id rather than through a relation on the core Server
 * model — a package cannot add one, which is the coupling this extraction
 * removes.
 */
class ServerCustomDomainController extends ClientApiController
{
    use RespondsWithExtensionEnvelope;

    public function __construct(private CustomDomainProvisioningService $service)
    {
        parent::__construct();
    }

    public function index(GetServerCustomDomainsRequest $request, Server $server): JsonResponse
    {
        $records = $this->mappingsFor($server)
            ->with('customDomain')
            ->orderByDesc('id')
            ->get()
            ->map(function (ServerCustomDomain $row) {
                $dnsRecords = (array) ($row->dns_records ?? []);
                $hasSrv = collect($dnsRecords)->contains(fn ($record) => ($record['kind'] ?? null) === 'srv');
                $hostType = collect($dnsRecords)->firstWhere('kind', 'host')['type'] ?? null;

                return [
                    'id' => $row->id,
                    'domain_id' => $row->custom_domain_id,
                    'domain' => $row->customDomain?->domain,
                    'subdomain' => $row->subdomain,
                    'full_domain' => $row->full_domain,
                    'port' => $row->port,
                    'protocol' => $row->protocol,
                    'service_tag' => $row->service_tag,
                    'record_type' => $hasSrv ? 'srv' : 'cname',
                    'host_record_type' => $hostType,
                    'status' => $row->status,
                    'last_error' => $row->last_error,
                    'last_synced_at' => $row->last_synced_at,
                ];
            })
            ->values()
            ->all();

        return $this->extensionListResponse($records);
    }

    public function store(StoreServerCustomDomainRequest $request, Server $server): JsonResponse
    {
        $domainId = (int) $request->input('domain_id');
        $subdomain = strtolower((string) $request->input('subdomain'));
        $port = (int) $request->input('port');
        $protocol = (string) $request->input('protocol', 'both');
        $recordType = $request->filled('record_type') ? strtolower((string) $request->input('record_type')) : null;
        $serviceTag = $request->filled('service_tag') ? strtolower((string) $request->input('service_tag')) : null;

        $this->service->createFromPayload($server, [[
            'domain_id' => $domainId,
            'subdomain' => $subdomain,
            'port' => $port,
            'protocol' => $protocol,
            'record_type' => $recordType,
            'service_tag' => $serviceTag,
        ]]);

        $mapping = $this->mappingsFor($server)
            ->where('custom_domain_id', $domainId)
            ->where('subdomain', $subdomain)
            ->where('port', $port)
            ->where('protocol', $protocol)
            ->latest()
            ->first();

        // Provision just the new mapping when it can be identified; fall back to
        // the whole server only if it cannot, rather than always paying N
        // Cloudflare round trips for one added subdomain.
        if ($mapping) {
            ProvisionCustomDomainRecordJob::dispatch($mapping->id);
        } else {
            ProvisionServerCustomDomainsJob::dispatch($server->id);
        }

        return $this->extensionItemResponse('server_custom_domain', [], JsonResponse::HTTP_CREATED);
    }

    public function options(GetServerCustomDomainsRequest $request, Server $server): JsonResponse
    {
        $recommendation = $this->service->getDnsRecommendationForServer($server);

        $domains = collect($this->service->getAvailableDomains($server))
            ->map(fn ($domain) => [
                'id' => $domain->id,
                'domain' => $domain->domain,
                'wildcard_enabled' => $domain->wildcard_enabled,
                'default_service_tag' => $this->service->resolveSuggestedServiceTag($server, $domain),
                'recommended_record_type' => $recommendation['recommended_record_type'],
                'srv_supported' => $recommendation['srv_supported'],
                'allow_record_type_selection' => $recommendation['allow_record_type_selection'],
                'forced_record_type' => $recommendation['forced_record_type'],
                'dns_mode' => $recommendation['mode'],
                'recommendation_notice' => $recommendation['notice'],
                'connection_hint' => $recommendation['connection_hint'],
            ])
            ->values()
            ->all();

        return $this->extensionListResponse($domains);
    }

    public function destroy(DeleteServerCustomDomainRequest $request, Server $server, ServerCustomDomain $customDomain): JsonResponse
    {
        // The loader does apply ResourceBelongsToServer, which scopes a package
        // model by its server_id, so this is a second check rather than the only
        // one. It stays: the guard a package's own IDOR protection depends on
        // should not be one it cannot see, and the cost is an integer compare.
        if ($customDomain->server_id !== $server->id) {
            abort(404);
        }

        $this->service->cleanup($customDomain);
        $customDomain->delete();

        return new JsonResponse(null, JsonResponse::HTTP_NO_CONTENT);
    }

    public function sync(SyncCustomDomainsRequest $request, Server $server): JsonResponse
    {
        ProvisionServerCustomDomainsJob::dispatch($server->id);

        return $this->extensionItemResponse('sync_request', ['queued' => true]);
    }

    private function mappingsFor(Server $server)
    {
        return ServerCustomDomain::query()->where('server_id', $server->id);
    }
}
