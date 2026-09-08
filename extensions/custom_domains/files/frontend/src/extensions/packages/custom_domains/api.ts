import { createExtensionAdminClient, createExtensionClient } from '@/extensions-sdk';

/*
 * Both API surfaces this package talks to.
 *
 * The base URLs are derived from the extension id by the SDK rather than written
 * here, so a package cannot address another extension's routes:
 *   admin  -> /api/application/extensions/ext/custom_domains
 *   server -> /api/client/servers/{server}/extensions/ext/custom_domains
 *
 * Both sides answer in the panel's extension envelope, which the SDK client
 * unwraps — so these functions see plain data, not { object, data }.
 *
 * There are no settings or credential calls. Extension settings and the
 * account-wide Cloudflare token are owned by the panel and edited from the
 * extension's drawer; a package that stored its own settings would be storing
 * them somewhere the panel cannot validate.
 */

const EXTENSION_ID = 'custom_domains';

const admin = createExtensionAdminClient(EXTENSION_ID);

const server = (uuid: string) => createExtensionClient(EXTENSION_ID, uuid);

export type DomainStatus = 'pending' | 'active' | 'failed';
export type RecordType = 'srv' | 'cname';

// ---------------------------------------------------------------- server side

export interface CustomDomainMapping {
    id: number;
    domainId: number;
    domain: string | null;
    subdomain: string;
    fullDomain: string;
    port: number;
    protocol: string;
    serviceTag: string | null;
    recordType: RecordType;
    hostRecordType: string | null;
    status: DomainStatus;
    lastError: string | null;
    lastSyncedAt: string | null;
}

/** A parent domain this server may use, plus the DNS shape its egg implies. */
export interface CustomDomainOption {
    id: number;
    domain: string;
    wildcardEnabled: boolean;
    defaultServiceTag: string | null;
    recommendedRecordType: RecordType;
    srvSupported: boolean;
    allowRecordTypeSelection: boolean;
    forcedRecordType: RecordType | null;
    dnsMode: string;
    recommendationNotice: string | null;
    connectionHint: string | null;
}

export interface CreateMappingPayload {
    domainId: number;
    subdomain: string;
    port: number;
    recordType?: RecordType | null;
    serviceTag?: string | null;
}

function toMapping(row: any): CustomDomainMapping {
    return {
        id: row.id,
        domainId: row.domain_id,
        domain: row.domain ?? null,
        subdomain: row.subdomain,
        fullDomain: row.full_domain,
        port: row.port,
        protocol: row.protocol,
        serviceTag: row.service_tag ?? null,
        recordType: row.record_type,
        hostRecordType: row.host_record_type ?? null,
        status: row.status,
        lastError: row.last_error ?? null,
        lastSyncedAt: row.last_synced_at ?? null,
    };
}

function toOption(row: any): CustomDomainOption {
    return {
        id: row.id,
        domain: row.domain,
        wildcardEnabled: Boolean(row.wildcard_enabled),
        defaultServiceTag: row.default_service_tag ?? null,
        recommendedRecordType: row.recommended_record_type,
        srvSupported: Boolean(row.srv_supported),
        allowRecordTypeSelection: Boolean(row.allow_record_type_selection),
        forcedRecordType: row.forced_record_type ?? null,
        dnsMode: row.dns_mode,
        recommendationNotice: row.recommendation_notice ?? null,
        connectionHint: row.connection_hint ?? null,
    };
}

export async function getCustomDomains(uuid: string, signal?: AbortSignal): Promise<CustomDomainMapping[]> {
    return (await server(uuid).get<any[]>('/', { signal })).map(toMapping);
}

export async function getCustomDomainOptions(uuid: string, signal?: AbortSignal): Promise<CustomDomainOption[]> {
    return (await server(uuid).get<any[]>('/options', { signal })).map(toOption);
}

export async function createCustomDomain(uuid: string, payload: CreateMappingPayload): Promise<void> {
    await server(uuid).post('/', {
        domain_id: payload.domainId,
        subdomain: payload.subdomain,
        port: payload.port,
        protocol: 'both',
        record_type: payload.recordType ?? null,
        service_tag: payload.serviceTag ?? null,
    });
}

/** Re-queue provisioning for every mapping on the server, to retry failures. */
export async function syncCustomDomains(uuid: string): Promise<void> {
    await server(uuid).post('/sync');
}

export async function deleteCustomDomain(uuid: string, id: number): Promise<void> {
    await server(uuid).delete(`/${id}`);
}

// ----------------------------------------------------------------- admin side

export interface AdminCustomDomain {
    id: number;
    domain: string;
    cloudflareZoneId: string | null;
    apiKeyId: number | null;
    apiKeyName: string | null;
    allowedNestIds: number[];
    allowedEggIds: number[];
    serviceTag: string | null;
    eggServiceTags: Record<string, string>;
    wildcardEnabled: boolean;
    enabled: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface CustomDomainApiKey {
    id: number;
    name: string;
    enabled: boolean;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface CustomDomainNest {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
}

export interface CustomDomainEgg {
    id: number;
    uuid: string;
    nest_id: number;
    nest_name: string | null;
    name: string;
    description: string | null;
    default_service_tag: string | null;
}

export interface CustomDomainOptions {
    nests: CustomDomainNest[];
    eggs: CustomDomainEgg[];
}

export interface DomainPayload {
    domain: string;
    cloudflare_zone_id?: string | null;
    api_key_id?: number | null;
    allowed_nest_ids?: number[];
    allowed_egg_ids?: number[];
    service_tag?: string | null;
    egg_service_tags?: Record<string, string>;
    wildcard_enabled?: boolean;
    enabled?: boolean;
}

function toDomain(row: any): AdminCustomDomain {
    return {
        id: row.id,
        domain: row.domain,
        cloudflareZoneId: row.cloudflare_zone_id ?? null,
        apiKeyId: row.api_key_id ?? null,
        apiKeyName: row.api_key_name ?? null,
        allowedNestIds: (row.allowed_nest_ids ?? []).map(Number),
        allowedEggIds: (row.allowed_egg_ids ?? []).map(Number),
        eggServiceTags: (row.egg_service_tags ?? {}) as Record<string, string>,
        serviceTag: row.service_tag ?? null,
        wildcardEnabled: Boolean(row.wildcard_enabled),
        enabled: Boolean(row.enabled),
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
    };
}

function toApiKey(row: any): CustomDomainApiKey {
    return {
        id: row.id,
        name: row.name,
        enabled: Boolean(row.enabled),
        createdAt: row.created_at ?? null,
        updatedAt: row.updated_at ?? null,
    };
}

export async function getAdminCustomDomains(signal?: AbortSignal): Promise<AdminCustomDomain[]> {
    return (await admin.get<any[]>('/', { signal })).map(toDomain);
}

export async function createAdminCustomDomain(payload: DomainPayload): Promise<void> {
    await admin.post('/', payload);
}

export async function updateAdminCustomDomain(id: number, payload: DomainPayload): Promise<void> {
    await admin.patch(`/${id}`, payload);
}

export async function deleteAdminCustomDomain(id: number): Promise<void> {
    await admin.delete(`/${id}`);
}

export async function getCustomDomainCatalogOptions(signal?: AbortSignal): Promise<CustomDomainOptions> {
    const data = await admin.get<{ nests?: CustomDomainNest[]; eggs?: CustomDomainEgg[] }>('/options', { signal });
    return { nests: data.nests ?? [], eggs: data.eggs ?? [] };
}

export async function getCustomDomainApiKeys(signal?: AbortSignal): Promise<CustomDomainApiKey[]> {
    return (await admin.get<any[]>('/api-keys', { signal })).map(toApiKey);
}

export async function createCustomDomainApiKey(payload: { name: string; token: string; enabled: boolean }): Promise<void> {
    await admin.post('/api-keys', payload);
}

export async function updateCustomDomainApiKey(
    id: number,
    payload: { name?: string; token?: string; enabled?: boolean },
): Promise<void> {
    await admin.patch(`/api-keys/${id}`, payload);
}

export async function deleteCustomDomainApiKey(id: number): Promise<void> {
    await admin.delete(`/api-keys/${id}`);
}
