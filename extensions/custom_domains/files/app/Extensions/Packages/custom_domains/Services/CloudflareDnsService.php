<?php

namespace Everest\Extensions\Packages\custom_domains\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\ConnectionException;

class CloudflareDnsService
{
    /**
     * Credentials must only ever be sent to Cloudflare's canonical API
     * endpoint. Making this administrator-configurable turns a settings write
     * into an API-token exfiltration primitive.
     */
    private const API_BASE_URL = 'https://api.cloudflare.com/client/v4';

    private function client(#[\SensitiveParameter] ?string $tokenOverride = null): PendingRequest
    {
        // The account-wide token now lives in the panel's encrypted secret
        // store; a per-domain CustomDomainApiKey still overrides it via
        // $tokenOverride. There is no plaintext fallback.
        $token = $tokenOverride ?? (PackageSettings::cloudflareToken() ?? '');

        $token = $this->normalizeToken($token);

        if ($token === '') {
            throw new \Exception('Cloudflare API token is not configured for custom domains.');
        }

        $retries = PackageSettings::retries();
        $sleep = PackageSettings::retrySleepMs();

        return Http::retry($retries, $sleep)
            ->withOptions(['allow_redirects' => false])
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'Authorization' => 'Bearer ' . $token,
            ]);
    }

    private function normalizeToken(#[\SensitiveParameter] string $token): string
    {
        $normalized = trim($token);

        if ($normalized === '') {
            return '';
        }

        $normalized = trim($normalized, "\"'");
        $normalized = preg_replace('/\s+/', '', $normalized) ?? '';

        if (str_starts_with(strtolower($normalized), 'bearer')) {
            $normalized = preg_replace('/^bearer/i', '', $normalized) ?? '';
            $normalized = trim($normalized);
        }

        return $normalized;
    }

    private function baseUrl(): string
    {
        return self::API_BASE_URL;
    }

    private function resourceId(string $value, string $label): string
    {
        if (preg_match('/^[a-f0-9]{32}$/i', $value) !== 1) {
            throw new \Exception(sprintf('Invalid Cloudflare %s identifier.', $label));
        }

        return $value;
    }

    public function getZoneByName(string $domain, #[\SensitiveParameter] ?string $tokenOverride = null): ?array
    {
        try {
            $response = $this->client($tokenOverride)->get($this->baseUrl() . '/zones', [
                'name' => $domain,
                'status' => 'active',
                'match' => 'all',
            ])->throw();
        } catch (RequestException|ConnectionException $exception) {
            throw new \Exception($this->formatCloudflareError('Cloudflare zone lookup failed.', $exception));
        }

        $json = $response->json();

        if (!($json['success'] ?? false)) {
            return null;
        }

        return Arr::first($json['result'] ?? []);
    }

    public function createOrUpdateAOrCnameRecord(
        string $zoneId,
        string $name,
        string $target,
        #[\SensitiveParameter] ?string $tokenOverride = null,
        ?string $forcedType = null,
    ): array {
        $type = $forcedType !== null
            ? strtoupper(trim($forcedType))
            : (filter_var($target, FILTER_VALIDATE_IP) ? 'A' : 'CNAME');

        if (!in_array($type, ['A', 'CNAME'], true)) {
            throw new \Exception('Invalid DNS record type for host record.');
        }

        if ($type === 'A' && !filter_var($target, FILTER_VALIDATE_IP)) {
            throw new \Exception('A record content must be a valid IP address.');
        }

        if ($type === 'CNAME' && filter_var($target, FILTER_VALIDATE_IP)) {
            throw new \Exception('CNAME record content must be a hostname, not an IP address.');
        }

        $proxied = PackageSettings::proxied();

        $existingRecords = $this->findRecordsByName($zoneId, $name, $tokenOverride);
        $existing = collect($existingRecords)->first(fn (array $record) => ($record['type'] ?? null) === $type);

        foreach ($existingRecords as $record) {
            if (($record['type'] ?? null) === $type) {
                continue;
            }

            if (!in_array($record['type'] ?? '', ['A', 'CNAME'], true)) {
                continue;
            }

            if (!empty($record['id'])) {
                $this->deleteRecord($zoneId, (string) $record['id'], $tokenOverride);
            }
        }

        $payload = [
            'type' => $type,
            'name' => $name,
            'content' => $target,
            'proxied' => $type === 'A' ? $proxied : false,
            'ttl' => 1,
        ];

        if ($existing) {
            return $this->updateRecord($zoneId, $existing['id'], $payload, $tokenOverride);
        }

        return $this->createRecord($zoneId, $payload, $tokenOverride);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function getRecordsByName(string $zoneId, string $name, #[\SensitiveParameter] ?string $tokenOverride = null): array
    {
        return $this->findRecordsByName($zoneId, $name, $tokenOverride);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function findRecordsByName(string $zoneId, string $name, #[\SensitiveParameter] ?string $tokenOverride = null): array
    {
        $zoneId = $this->resourceId($zoneId, 'zone');

        try {
            $response = $this->client($tokenOverride)->get($this->baseUrl() . '/zones/' . $zoneId . '/dns_records', [
                'name' => $name,
                'per_page' => 100,
                'page' => 1,
                'match' => 'all',
            ])->throw();
        } catch (RequestException|ConnectionException $exception) {
            throw new \Exception($this->formatCloudflareError('Cloudflare DNS lookup request failed.', $exception));
        }

        $json = $response->json();

        if (!($json['success'] ?? false)) {
            return [];
        }

        return is_array($json['result'] ?? null) ? $json['result'] : [];
    }

    public function createOrUpdateSrvRecord(
        string $zoneId,
        string $fqdn,
        string $servicePrefix,
        string $proto,
        int $port,
        string $target,
        #[\SensitiveParameter] ?string $tokenOverride = null,
    ): array {
        $normalizedPrefix = $this->normalizeServicePrefix($servicePrefix);
        $recordName = $normalizedPrefix . $proto . '.' . $fqdn;

        $payload = [
            'type' => 'SRV',
            'name' => $recordName,
            'data' => [
                'priority' => 1,
                'weight' => 1,
                'port' => $port,
                'target' => $target,
            ],
            'ttl' => 1,
        ];

        $existing = $this->findRecord($zoneId, 'SRV', $recordName, $tokenOverride);

        if ($existing) {
            return $this->updateRecord($zoneId, $existing['id'], $payload, $tokenOverride);
        }

        return $this->createRecord($zoneId, $payload, $tokenOverride);
    }

    private function normalizeServicePrefix(string $servicePrefix): string
    {
        $value = strtolower(trim($servicePrefix));

        if (preg_match('/^_([a-z0-9][a-z0-9-]*)\._$/', $value, $matches) === 1) {
            return '_' . $matches[1] . '._';
        }

        if (preg_match('/^_?([a-z0-9][a-z0-9-]*)$/', $value, $matches) === 1) {
            return '_' . $matches[1] . '._';
        }

        throw new \Exception('Invalid SRV service prefix. Use format like _minecraft._');
    }

    public function deleteRecord(string $zoneId, string $recordId, #[\SensitiveParameter] ?string $tokenOverride = null): void
    {
        $zoneId = $this->resourceId($zoneId, 'zone');
        $recordId = $this->resourceId($recordId, 'DNS record');

        try {
            $this->client($tokenOverride)->delete($this->baseUrl() . '/zones/' . $zoneId . '/dns_records/' . $recordId)->throw();
        } catch (RequestException|ConnectionException $exception) {
            throw new \Exception($this->formatCloudflareError('Cloudflare DNS delete request failed.', $exception));
        }
    }

    private function findRecord(string $zoneId, string $type, string $name, #[\SensitiveParameter] ?string $tokenOverride = null): ?array
    {
        $zoneId = $this->resourceId($zoneId, 'zone');

        try {
            $response = $this->client($tokenOverride)->get($this->baseUrl() . '/zones/' . $zoneId . '/dns_records', [
                'type' => $type,
                'name' => $name,
                'per_page' => 1,
                'page' => 1,
                'match' => 'all',
            ])->throw();
        } catch (RequestException|ConnectionException $exception) {
            throw new \Exception($this->formatCloudflareError('Cloudflare DNS lookup request failed.', $exception));
        }

        $json = $response->json();

        if (!($json['success'] ?? false)) {
            return null;
        }

        return Arr::first($json['result'] ?? []);
    }

    private function createRecord(string $zoneId, array $payload, #[\SensitiveParameter] ?string $tokenOverride = null): array
    {
        $zoneId = $this->resourceId($zoneId, 'zone');

        try {
            $response = $this->client($tokenOverride)
                ->post($this->baseUrl() . '/zones/' . $zoneId . '/dns_records', $payload)
                ->throw();
        } catch (RequestException|ConnectionException $exception) {
            throw new \Exception($this->formatCloudflareError('Cloudflare DNS create request failed.', $exception));
        }

        $json = $response->json();

        if (!($json['success'] ?? false)) {
            throw new \Exception('Cloudflare DNS create request failed.');
        }

        return $json['result'];
    }

    private function updateRecord(string $zoneId, string $recordId, array $payload, #[\SensitiveParameter] ?string $tokenOverride = null): array
    {
        $zoneId = $this->resourceId($zoneId, 'zone');
        $recordId = $this->resourceId($recordId, 'DNS record');

        try {
            $response = $this->client($tokenOverride)
                ->put($this->baseUrl() . '/zones/' . $zoneId . '/dns_records/' . $recordId, $payload)
                ->throw();
        } catch (RequestException|ConnectionException $exception) {
            throw new \Exception($this->formatCloudflareError('Cloudflare DNS update request failed.', $exception));
        }

        $json = $response->json();

        if (!($json['success'] ?? false)) {
            throw new \Exception('Cloudflare DNS update request failed.');
        }

        return $json['result'];
    }

    private function formatCloudflareError(string $prefix, RequestException|ConnectionException $exception): string
    {
        // Provider bodies can echo credentials and reach persistent DNS logs.
        return $exception instanceof RequestException
            ? $prefix . ' HTTP ' . $exception->response->status() . '.'
            : $prefix . ' Connection failed.';
    }
}
