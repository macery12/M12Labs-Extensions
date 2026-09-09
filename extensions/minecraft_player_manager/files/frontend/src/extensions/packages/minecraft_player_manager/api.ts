import { createExtensionClient } from '@/extensions-sdk';

/*
 * This package's per-server API.
 *
 * The base URL is derived from the extension id by the SDK rather than written
 * here, so a package cannot address another extension's routes:
 *   /api/client/servers/{server}/extensions/ext/minecraft_player_manager
 *
 * These endpoints answer with a bare `{ success, ... }` object rather than the
 * panel envelope, which the SDK client passes through untouched.
 */

const EXTENSION_ID = 'minecraft_player_manager';

const client = (uuid: string) => createExtensionClient(EXTENSION_ID, uuid);

export interface OnlinePlayer {
    name: string;
    uuid?: string;
}

export interface ServerStatus {
    online: boolean;
    players: {
        online: number;
        max: number;
        list: OnlinePlayer[];
    };
    version: string;
    motd: string;
}

export interface PlayerEntry {
    uuid: string;
    name: string;
    level?: number;
    bypassesPlayerLimit?: boolean;
    source?: string;
    created?: string;
    reason?: string;
    expires?: string;
}

export interface PlayerManagerStatus {
    server: ServerStatus;
    operators: PlayerEntry[];
    whitelist: PlayerEntry[];
    bannedPlayers: PlayerEntry[];
    bannedIps: { ip: string; reason: string; created: string; source: string; expires: string | null }[];
    whitelistEnabled: boolean;
}

export const getPlayerManagerStatus = (uuid: string, signal?: AbortSignal): Promise<PlayerManagerStatus> =>
    // The endpoint answers with a bare status object, and the SDK client
    // already unwraps the panel envelope, so there is nothing left to unnest —
    // the old `data.data` guard was reaching for a shape neither layer emits.
    client(uuid).get<PlayerManagerStatus>('/', { signal });

export const setWhitelistEnabled = async (uuid: string, enabled: boolean): Promise<void> => {
    await client(uuid).post('/whitelist', { enabled });
};

export const addToWhitelist = async (uuid: string, player: string): Promise<void> => {
    await client(uuid).put(`/whitelist/${player}`);
};

export const removeFromWhitelist = async (uuid: string, player: string): Promise<void> => {
    await client(uuid).delete(`/whitelist/${player}`);
};

export const opPlayer = async (uuid: string, player: string): Promise<void> => {
    await client(uuid).put(`/op/${player}`);
};

export const deopPlayer = async (uuid: string, player: string): Promise<void> => {
    await client(uuid).delete(`/op/${player}`);
};

export const banPlayer = async (uuid: string, player: string, reason: string): Promise<void> => {
    await client(uuid).put(`/ban/${player}`, { reason });
};

export const unbanPlayer = async (uuid: string, player: string): Promise<void> => {
    await client(uuid).delete(`/ban/${player}`);
};

export const banIp = async (uuid: string, ip: string, reason: string): Promise<void> => {
    await client(uuid).put(`/ban-ip/${ip}`, { reason });
};

export const unbanIp = async (uuid: string, ip: string): Promise<void> => {
    await client(uuid).delete(`/ban-ip/${ip}`);
};

export const kickPlayer = async (uuid: string, player: string, reason?: string): Promise<void> => {
    await client(uuid).post(`/kick/${player}`, { reason });
};

export const whisperPlayer = async (uuid: string, player: string, message: string): Promise<void> => {
    await client(uuid).post(`/whisper/${player}`, { message });
};

export const killPlayer = async (uuid: string, player: string): Promise<void> => {
    await client(uuid).post(`/kill/${player}`);
};

// v1.0.1 - Server Version
export interface ServerVersion {
    raw: string;
    major: number;
    minor: number;
    patch: number;
    protocol: number;
    supportsAttributes: boolean;
}

export interface ServerVersionResponse {
    success: boolean;
    version?: ServerVersion;
    error?: string;
}

export const getServerVersion = async (uuid: string, signal?: AbortSignal): Promise<ServerVersionResponse> => {
    const data = await client(uuid).get<ServerVersionResponse>('/version', { signal });
    return data;
};

// v1.0.1 - Player Data Types
export interface ItemEnchantment {
    id: string;
    name: string;
    level: number;
    levelRoman: string;
}

export interface ItemDurability {
    current: number;
    max: number;
    percentage: number;
}

export interface InventoryItem {
    id: string;
    displayId: string;
    name: string;
    slot: number;
    count: number;
    damage: number;
    enchantments: ItemEnchantment[];
    storedEnchantments: ItemEnchantment[];
    customName: string | null;
    lore: string[];
    durability: ItemDurability | null;
    contents: InventoryItem[];
}

export interface PlayerArmor {
    helmet: InventoryItem | null;
    chestplate: InventoryItem | null;
    leggings: InventoryItem | null;
    boots: InventoryItem | null;
}

export interface PlayerLocation {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    dimension: string;
    world: string;
}

export interface PlayerStats {
    health: number;
    maxHealth: number;
    food: number;
    saturation: number;
    xpLevel: number;
    xpTotal: number;
    xpProgress: number;
    gamemode: string;
    score: number;
}

export interface PlayerDataResponse {
    success: boolean;
    player?: {
        uuid: string;
        name: string;
    };
    inventory?: InventoryItem[];
    armor?: PlayerArmor;
    offhand?: InventoryItem | null;
    enderChest?: InventoryItem[];
    location?: PlayerLocation;
    stats?: PlayerStats;
    error?: string;
}

export const getPlayerData = async (uuid: string, player: string): Promise<PlayerDataResponse> => {
    const data = await client(uuid).get<PlayerDataResponse>(`/player/${player}/data`);
    return data;
};

// v1.0.1 - Attributes
export interface AttributeInfo {
    id: string;
    name: string;
    default: number;
    min: number;
    max: number;
    description: string;
}

export interface AttributeCategory {
    category: string;
    attributes: AttributeInfo[];
}

export interface AttributesResponse {
    success: boolean;
    attributes?: AttributeCategory[];
    error?: string;
}

export const getAttributes = async (uuid: string): Promise<AttributesResponse> => {
    const data = await client(uuid).get<AttributesResponse>('/attributes');
    return data;
};

export interface SetAttributeResponse {
    success: boolean;
    attribute?: string;
    value?: number;
    error?: string;
}

export const setAttribute = async (uuid: string, player: string, attribute: string, value: number): Promise<SetAttributeResponse> => {
    const data = await client(uuid).post<SetAttributeResponse>(`/player/${player}/attribute/${attribute}`, { value });
    return data;
};

export interface ResetAttributeResponse {
    success: boolean;
    attribute?: string;
    defaultValue?: number;
    error?: string;
}

export const resetAttribute = async (uuid: string, player: string, attribute: string): Promise<ResetAttributeResponse> => {
    const data = await client(uuid).delete<ResetAttributeResponse>(`/player/${player}/attribute/${attribute}`);
    return data;
};

