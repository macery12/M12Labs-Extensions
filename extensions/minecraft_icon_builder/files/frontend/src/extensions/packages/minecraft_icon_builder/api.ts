import { createExtensionClient } from '@/extensions-sdk';

/*
 * This package's per-server API.
 *
 * The base URL is derived from the extension id by the SDK rather than written
 * here, so a package cannot address another extension's routes:
 *   /api/client/servers/{server}/extensions/ext/minecraft_icon_builder
 *
 * Responses arrive in the panel's extension envelope, which the SDK client
 * unwraps for us.
 */

const EXTENSION_ID = 'minecraft_icon_builder';

const server = (uuid: string) => createExtensionClient(EXTENSION_ID, uuid);

export interface IconData {
    has_icon: boolean;
    image_base64: string | null;
}

export const getIcon = (uuid: string, signal?: AbortSignal): Promise<IconData> =>
    server(uuid).get<IconData>('/', { signal });

export const saveIcon = (uuid: string, imageBase64: string): Promise<void> =>
    server(uuid).post<void>('/icon', { image_base64: imageBase64 });
