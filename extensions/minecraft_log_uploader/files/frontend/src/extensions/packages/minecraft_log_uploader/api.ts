import { createExtensionClient } from '@/extensions-sdk';

/*
 * This package's per-server API.
 *
 * The base URL is derived from the extension id by the SDK rather than written
 * here, so a package cannot address another extension's routes:
 *   /api/client/servers/{server}/extensions/ext/minecraft_log_uploader
 *
 * Responses arrive in the panel's extension envelope, which the SDK client
 * unwraps for us.
 */

const EXTENSION_ID = 'minecraft_log_uploader';

const server = (uuid: string) => createExtensionClient(EXTENSION_ID, uuid);

export interface LogFile {
    name: string;
    size: number;
    modified_at: string | null;
}

export interface LogListResponse {
    logs: LogFile[];
}

export interface LogContentResponse {
    file: string;
    content: string;
    truncated: boolean;
}

export interface UploadResponse {
    url: string;
    id: string;
    /** True when only the tail of the file was published. */
    truncated: boolean;
}

export const listLogs = (uuid: string, signal?: AbortSignal): Promise<LogListResponse> =>
    server(uuid).get<LogListResponse>('/logs', { signal });

export const getLog = (uuid: string, file: string, signal?: AbortSignal): Promise<LogContentResponse> =>
    server(uuid).get<LogContentResponse>('/logs/content', { params: { file }, signal });

export const uploadLog = (uuid: string, file: string): Promise<UploadResponse> =>
    server(uuid).post<UploadResponse>('/logs/upload', { file });
