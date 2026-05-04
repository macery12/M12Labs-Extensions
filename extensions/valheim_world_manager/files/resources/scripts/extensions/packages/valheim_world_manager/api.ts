import http from '@/api/http';

const extensionId = 'valheim_world_manager';

const getBasePath = (uuid: string): string => `/api/client/servers/${uuid}/extensions/${extensionId}`;

export interface ValheimWorld {
    name: string;
    has_db: boolean;
    has_fwl: boolean;
    has_db_backup: boolean;
    has_fwl_backup: boolean;
    db_size: number;
    fwl_size: number;
    is_active: boolean;
}

export interface ValheimConfig {
    server_name: string;
    world_name: string;
    password: string;
    public: boolean;
    crossplay: boolean;
    modifier_combat: string;
    modifier_deathpenalty: string;
    modifier_resources: string;
    modifier_raids: string;
    modifier_portals: string;
}

export interface ValheimMod {
    name: string;
    display_name: string;
    enabled: boolean;
    is_directory: boolean;
    size: number;
}

export interface ValheimOverview {
    worlds_dir_exists: boolean;
    bepinex_installed: boolean;
    world_count: number;
    mod_count: number;
    active_world: string | null;
}

export const getOverview = async (uuid: string): Promise<ValheimOverview> => {
    const { data } = await http.get(getBasePath(uuid));
    return data.data ?? data;
};

export const listWorlds = async (uuid: string): Promise<{ worlds: ValheimWorld[]; dir_exists: boolean }> => {
    const { data } = await http.get(`${getBasePath(uuid)}/worlds`);
    return data.data ?? data;
};

export const deleteWorld = async (uuid: string, world: string): Promise<void> => {
    await http.delete(`${getBasePath(uuid)}/worlds/${encodeURIComponent(world)}`);
};

export const getConfig = async (uuid: string): Promise<{ config: ValheimConfig; file_exists: boolean }> => {
    const { data } = await http.get(`${getBasePath(uuid)}/config`);
    return data.data ?? data;
};

export const saveConfig = async (uuid: string, config: ValheimConfig): Promise<{ success: boolean; config: ValheimConfig }> => {
    const { data } = await http.post(`${getBasePath(uuid)}/config`, config);
    return data.data ?? data;
};

export const listMods = async (uuid: string): Promise<{ mods: ValheimMod[]; bepinex_installed: boolean }> => {
    const { data } = await http.get(`${getBasePath(uuid)}/mods`);
    return data.data ?? data;
};

export const toggleMod = async (uuid: string, mod: string): Promise<{ name: string; enabled: boolean }> => {
    const { data } = await http.post(`${getBasePath(uuid)}/mods/${encodeURIComponent(mod)}/toggle`);
    return data.data ?? data;
};

export const deleteMod = async (uuid: string, mod: string): Promise<void> => {
    await http.delete(`${getBasePath(uuid)}/mods/${encodeURIComponent(mod)}`);
};
