<?php

namespace Everest\Tests\Integration\Extensions\custom_domains;

use Everest\Models\ExtensionConfig;
use Illuminate\Support\Facades\Http;
use Everest\Tests\Integration\IntegrationTestCase;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Everest\Extensions\Packages\custom_domains\Models\CustomDomain;
use Everest\Extensions\Packages\custom_domains\Services\PackageSettings;
use Everest\Extensions\Packages\custom_domains\Models\CustomDomainApiKey;
use Everest\Extensions\Packages\custom_domains\Models\ServerCustomDomain;
use Everest\Tests\Extensions\custom_domains\MigratesCustomDomainsPackage;
use Everest\Extensions\Packages\custom_domains\Services\CloudflareDnsService;
use Everest\Extensions\Packages\custom_domains\Services\CustomDomainProvisioningService;

/**
 * Provisioning against a fake Cloudflare.
 *
 * The extension tool's `tests` command stages the package into the panel tree,
 * so these exercise the real classes rather than copies. Http::fake() stands
 * in for the API: every assertion here is about what the package does with
 * Cloudflare's answers — which records it creates, what it records on the
 * mapping, what it withdraws, and how it behaves when the API refuses.
 */
class CustomDomainProvisioningTest extends IntegrationTestCase
{
    // Aliased so the package's tables can be built BEFORE the transaction opens.
    // Creating them inside it commits it — sqlite and MySQL both do — which
    // silently drops isolation for this test and leaks its fixtures into every
    // test that runs after it in the same process.
    use DatabaseTransactions {
        beginDatabaseTransaction as private beginTransactionFromTrait;
    }
    use MigratesCustomDomainsPackage;

    private CustomDomainProvisioningService $service;

    public function beginDatabaseTransaction(): void
    {
        $this->migrateCustomDomainsPackage();

        $this->beginTransactionFromTrait();
    }

    public function setUp(): void
    {
        parent::setUp();

        // The package reads its Cloudflare settings from extension_configs.
        // No retries or sleeps, so a refused call fails at once; reset the
        // request cache so these values are the ones read.
        ExtensionConfig::query()->updateOrCreate(
            ['extension_id' => PackageSettings::EXTENSION_ID],
            [
                'enabled' => true,
                'settings' => [
                    'cloudflare_proxied' => false,
                    'cloudflare_retries' => 0,
                    'cloudflare_retry_sleep_ms' => 0,
                ],
            ],
        );
        PackageSettings::flush();

        $this->service = new CustomDomainProvisioningService(app(CloudflareDnsService::class));
    }

    protected function tearDown(): void
    {
        PackageSettings::flush();

        parent::tearDown();
    }

    public function testACnameMappingIsProvisionedAndRecorded(): void
    {
        $mapping = $this->mapping();

        Http::fake(fn ($request) => $request->method() === 'GET'
            // No record of this name exists yet, so the service creates one.
            ? Http::response(['success' => true, 'result' => []])
            : Http::response(['success' => true, 'result' => ['id' => '1b0e1f6a8c2d4e5f9a7b3c6d8e0f2a4b', 'type' => 'CNAME']]));

        $this->service->provision($mapping);
        $mapping->refresh();

        $this->assertSame('active', $mapping->status);
        $this->assertNull($mapping->last_error);
        $this->assertNotNull($mapping->last_synced_at);
        $this->assertSame('1b0e1f6a8c2d4e5f9a7b3c6d8e0f2a4b', $mapping->dns_records[0]['id']);
        $this->assertSame('host', $mapping->dns_records[0]['kind']);

        $this->assertDatabaseHas('ext_custom_domains_dns_logs', [
            'server_custom_domain_id' => $mapping->id,
            'action' => 'sync',
            'status' => 'success',
        ]);
    }

    /**
     * Re-provisioning must converge rather than duplicate — it is what makes the
     * job safe to retry, and the queue retries it on any Cloudflare wobble.
     */
    public function testReProvisioningReplacesRecordsItNoLongerNeeds(): void
    {
        $mapping = $this->mapping();
        $mapping->forceFill(['dns_records' => [['kind' => 'host', 'id' => '5fa3e2d1c0b9a8f7e6d5c4b3a2918070', 'type' => 'CNAME']]])->save();

        // A closure rather than URL patterns: Http::fake() resolves patterns by
        // reduce(), so the LAST matching pattern wins and a specific stub placed
        // before a wildcard is silently shadowed.
        Http::fake(function ($request) {
            if ($request->method() === 'DELETE') {
                return Http::response(['success' => true, 'result' => ['id' => '5fa3e2d1c0b9a8f7e6d5c4b3a2918070']]);
            }
            if ($request->method() === 'GET') {
                return Http::response(['success' => true, 'result' => []]);
            }

            return Http::response(['success' => true, 'result' => ['id' => '2c1f2a7b9d3e5f6a0b8c4d7e9f1a3b5c', 'type' => 'CNAME']]);
        });

        $this->service->provision($mapping);
        $mapping->refresh();

        $this->assertSame('active', $mapping->status);
        $this->assertSame('2c1f2a7b9d3e5f6a0b8c4d7e9f1a3b5c', $mapping->dns_records[0]['id']);

        // The record it stopped needing was withdrawn, not orphaned at Cloudflare.
        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/dns_records/5fa3e2d1c0b9a8f7e6d5c4b3a2918070'));
    }

    public function testCleanupWithdrawsEveryRecordItCreated(): void
    {
        $mapping = $this->mapping();
        $mapping->forceFill([
            'dns_records' => [
                ['kind' => 'host', 'id' => 'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf', 'type' => 'CNAME'],
                ['kind' => 'srv', 'id' => 'b0b1b2b3b4b5b6b7b8b9babbbcbdbebf', 'type' => 'SRV', 'proto' => 'tcp'],
            ],
        ])->save();

        Http::fake(['*' => Http::response(['success' => true, 'result' => []])]);

        $this->service->cleanup($mapping);

        foreach (['a0a1a2a3a4a5a6a7a8a9aaabacadaeaf', 'b0b1b2b3b4b5b6b7b8b9babbbcbdbebf'] as $recordId) {
            Http::assertSent(fn ($request) => $request->method() === 'DELETE'
                && str_contains($request->url(), '/dns_records/' . $recordId));
        }
    }

    /**
     * A failure has to land on the mapping. An operator's only view of why a
     * subdomain is not working is status + last_error on this row.
     */
    public function testAFailedApiCallMarksTheMappingAndLogsIt(): void
    {
        $mapping = $this->mapping();

        Http::fake(['*' => Http::response(['success' => false, 'errors' => [['message' => 'Invalid zone']]], 403)]);

        $this->service->provision($mapping);
        $mapping->refresh();

        $this->assertSame('failed', $mapping->status);
        $this->assertNotNull($mapping->last_error);
        $this->assertDatabaseHas('ext_custom_domains_dns_logs', [
            'server_custom_domain_id' => $mapping->id,
            'action' => 'sync',
            'status' => 'failed',
        ]);
    }

    /**
     * Provisioning must not proceed with no credential: it would otherwise send
     * an unauthenticated request and report Cloudflare's 401 as the cause.
     */
    public function testAMappingWithNoCredentialFailsBeforeCallingCloudflare(): void
    {
        $mapping = $this->mapping();
        // A domain with no credential assigned. Blanking the token instead would
        // be rejected by the model's own validation.
        $mapping->customDomain->forceFill(['api_key_id' => null])->save();
        $mapping->unsetRelation('customDomain');

        Http::fake();

        $this->service->provision($mapping);
        $mapping->refresh();

        $this->assertSame('failed', $mapping->status);
        $this->assertStringContainsString('No API key', (string) $mapping->last_error);
        Http::assertNothingSent();
    }

    /**
     * The zone id is looked up once and cached on the domain row, so a bulk
     * re-provision does not spend a lookup per mapping.
     */
    public function testTheResolvedZoneIdIsCachedOnTheDomain(): void
    {
        $mapping = $this->mapping();
        $mapping->customDomain->forceFill(['cloudflare_zone_id' => null])->save();
        $mapping->unsetRelation('customDomain');

        Http::fake([
            '*/zones?*' => Http::response(['success' => true, 'result' => [['id' => '372e67954025e0ba6aaa6d586b9e0b59']]]),
            '*/zones*' => Http::response(['success' => true, 'result' => [['id' => '372e67954025e0ba6aaa6d586b9e0b59']]]),
        ]);

        $this->service->provision($mapping);

        $this->assertSame('372e67954025e0ba6aaa6d586b9e0b59', $mapping->customDomain->fresh()->cloudflare_zone_id);
    }

    private function mapping(): ServerCustomDomain
    {
        $server = $this->createServerModel();

        $key = CustomDomainApiKey::query()->create([
            'name' => 'primary',
            'token' => 'cf-token-value-long-enough',
            'enabled' => true,
        ]);

        $domain = CustomDomain::query()->create([
            'domain' => 'example.test',
            'cloudflare_zone_id' => '023e105f4ecef8ad9ca31a8372d0c353',
            'api_key_id' => $key->id,
            'enabled' => true,
            'wildcard_enabled' => false,
        ]);

        return ServerCustomDomain::query()->create([
            'server_id' => $server->id,
            'allocation_id' => $server->allocation_id,
            'custom_domain_id' => $domain->id,
            'subdomain' => 'play',
            'full_domain' => 'play.example.test',
            'port' => 25565,
            'protocol' => 'both',
            'record_type' => 'cname',
            'status' => 'pending',
        ]);
    }
}
