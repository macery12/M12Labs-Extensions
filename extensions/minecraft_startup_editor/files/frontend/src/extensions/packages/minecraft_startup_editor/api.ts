import { createExtensionClient } from '@/extensions-sdk';

/*
 * This package's per-server API.
 *
 * The base URL is derived from the extension id by the SDK rather than written
 * here, so a package cannot address another extension's routes:
 *   /api/client/servers/{server}/extensions/ext/minecraft_startup_editor
 *
 * Responses come back in the panel's extension envelope, which the SDK client
 * unwraps — these functions therefore see the plain attribute bag and only have
 * to rename its snake_case keys.
 *
 * Every call takes the AbortSignal TanStack Query supplies, so a request in
 * flight when the page unmounts is cancelled rather than resolving into a
 * component that is gone.
 */

const EXTENSION_ID = 'minecraft_startup_editor';

const server = (uuid: string) => createExtensionClient(EXTENSION_ID, uuid);

interface StartupStatePayload {
    raw_startup: string | null;
    egg_default: string;
    rendered_command: string;
    is_using_egg_default: boolean;
    egg_name: string;
    detected_loader: string | null;
    memory_mb: number;
}

interface StartupSavePayload {
    rendered_command: string;
    raw_startup: string | null;
    is_using_egg_default: boolean;
    egg_default?: string;
}

export interface StartupEditorData {
    rawStartup: string | null;
    eggDefault: string;
    renderedCommand: string;
    isUsingEggDefault: boolean;
    eggName: string;
    detectedLoader: string | null;
    /** The server's memory allocation in MB; 0 means unlimited. */
    memoryMb: number;
}

export interface StartupSaveResult {
    renderedCommand: string;
    rawStartup: string | null;
    isUsingEggDefault: boolean;
    eggDefault?: string;
}

export const getStartupEditorData = async (uuid: string, signal?: AbortSignal): Promise<StartupEditorData> => {
    const data = await server(uuid).get<StartupStatePayload>('/', { signal });

    return {
        rawStartup: data.raw_startup,
        eggDefault: data.egg_default,
        renderedCommand: data.rendered_command,
        isUsingEggDefault: data.is_using_egg_default,
        eggName: data.egg_name,
        detectedLoader: data.detected_loader ?? null,
        memoryMb: data.memory_mb ?? 0,
    };
};

/**
 * Save a startup configuration built from a curated list of option IDs.
 *
 * No raw command text is sent or accepted: the server renders the command from
 * its own allowlist, and rejects an option ID it does not know.
 */
export const saveStartupOptions = async (
    uuid: string,
    selectedOptions: string[],
    xmsMb: number,
    xmxMb: number,
): Promise<StartupSaveResult> => {
    const data = await server(uuid).post<StartupSavePayload>('/save', {
        selected_options: selectedOptions,
        xms_mb: xmsMb,
        xmx_mb: xmxMb,
    });

    return {
        renderedCommand: data.rendered_command,
        rawStartup: data.raw_startup,
        isUsingEggDefault: data.is_using_egg_default,
    };
};

export const resetStartupCommand = async (uuid: string): Promise<StartupSaveResult> => {
    const data = await server(uuid).post<StartupSavePayload>('/reset', {});

    return {
        renderedCommand: data.rendered_command,
        rawStartup: data.raw_startup,
        isUsingEggDefault: data.is_using_egg_default,
        eggDefault: data.egg_default,
    };
};
