import { createExtensionClient } from '@/extensions-sdk';

/*
 * This package's per-server API.
 *
 * The base URL is derived from the extension id by the SDK rather than written
 * here, so a package cannot address another extension's routes:
 *   /api/client/servers/{server}/extensions/ext/discordsrv_helper
 *
 * Responses arrive in the panel's extension envelope, which the SDK client
 * unwraps — a list endpoint therefore yields a plain array.
 */

const EXTENSION_ID = 'discordsrv_helper';

const server = (uuid: string) => createExtensionClient(EXTENSION_ID, uuid);

export interface DiscordSrvHelperStatus {
    installed: boolean;
    plugin_jar: string | null;
    plugin_folder_present: boolean;
    token_file_present: boolean;
    config_present: boolean;
}

export interface DiscordSrvInstallResult {
    installed: boolean;
    jar: string;
    /** The upstream release tag the jar came from. */
    release: string;
    /** The upstream asset filename. */
    asset: string;
    /** Digest of exactly what was written, for checking against upstream. */
    sha256: string;
}

export interface DiscordSrvHelperHistoryEntry {
    id: number;
    action: string;
    created_at: string;
    actor: { id: number; email: string } | null;
}

export interface DiscordSrvHelperSubuserAccess {
    uuid: string;
    email: string;
    username: string;
    disabled: boolean;
}

export const getDiscordSrvHelperStatus = (uuid: string, signal?: AbortSignal): Promise<DiscordSrvHelperStatus> =>
    server(uuid).get<DiscordSrvHelperStatus>('/status', { signal });

/*
 * Takes no URL. The jar source is pinned in the panel, which resolves the
 * official release, checks every redirect hop against a host allowlist,
 * downloads and verifies the file itself, then writes the verified bytes to the
 * server. Letting the caller name a URL is what made this endpoint an SSRF in
 * the previous release.
 */
export const installDiscordSrv = (uuid: string): Promise<DiscordSrvInstallResult> =>
    server(uuid).post<DiscordSrvInstallResult>('/install', {});

export const setDiscordSrvToken = (uuid: string, token: string): Promise<void> =>
    server(uuid).post<void>('/token', { token });

export const setDiscordSrvGlobalChannel = (uuid: string, channelId: string): Promise<void> =>
    server(uuid).post<void>('/channel', { channel_id: channelId });

export const getDiscordSrvHistory = (uuid: string, signal?: AbortSignal): Promise<DiscordSrvHelperHistoryEntry[]> =>
    server(uuid).get<DiscordSrvHelperHistoryEntry[]>('/history', { signal });

export const revertDiscordSrvHistory = (uuid: string, snapshotId: number): Promise<void> =>
    server(uuid).post<void>(`/history/${snapshotId}/revert`);

export const getDiscordSrvSubusers = (uuid: string, signal?: AbortSignal): Promise<DiscordSrvHelperSubuserAccess[]> =>
    server(uuid).get<DiscordSrvHelperSubuserAccess[]>('/subusers', { signal });

export const setDiscordSrvSubuserAccess = (
    uuid: string,
    subuserUuid: string,
    enabled: boolean,
): Promise<void> => server(uuid).post<void>(`/subusers/${subuserUuid}`, { enabled });
