import http from '@/api/http';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ServerStatus {
    eggName: string;
    detectedLoader: string | null;
    jarVariable: string;
    currentJar: string | null;
    currentVersion: string | null;
}

export interface VersionEntry {
    id: string;
    type: string;
    releaseTime?: string | null;
}

export interface BuildEntry {
    id: string | number;
    label: string;
    type?: string;
    time?: string | null;
    promoted?: boolean;
    stable?: boolean;
    changes?: string[];
}

export interface BuildInfo {
    loader: string;
    mcVersion: string;
    builds: BuildEntry[];
    // Fabric-specific auto-selected versions
    loaderVersion?: string | null;
    installerVersion?: string | null;
    jarFilename?: string | null;
    availableLoaders?: { version: string; stable: boolean }[];
    // Forge-specific
    recommended?: string | null;
    latest?: string | null;
    // Vanilla meta
    type?: string;
    releaseTime?: string | null;
}

export interface SwitchPayload {
    loader: string;
    mc_version: string;
    build?: number | null;
    loader_version?: string | null;
    installer_version?: string | null;
    forge_version?: string | null;
}

export interface SwitchResult {
    jar: string;
    loader: string;
    mcVersion: string;
}

export interface BackupResult {
    uuid: string;
    name: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export const getVersionChangerStatus = (uuid: string): Promise<ServerStatus> =>
    http
        .get(`/api/client/servers/${uuid}/extensions/minecraft_version_changer`)
        .then(({ data }) => ({
            eggName:        data.attributes.egg_name,
            detectedLoader: data.attributes.detected_loader ?? null,
            jarVariable:    data.attributes.jar_variable,
            currentJar:     data.attributes.current_jar ?? null,
            currentVersion: data.attributes.current_version ?? null,
        }));

export const getVersions = (
    uuid: string,
    loader: string,
    snapshots = false,
): Promise<VersionEntry[]> =>
    http
        .get(`/api/client/servers/${uuid}/extensions/minecraft_version_changer/versions/${loader}`, {
            params: { snapshots: snapshots ? '1' : '0' },
        })
        .then(({ data }) =>
            (data.versions as Array<Record<string, unknown>>).map(v => ({
                id:          String(v.id),
                type:        String(v.type ?? 'release'),
                releaseTime: v.release_time ? String(v.release_time) : null,
            })),
        );

export const getBuilds = (uuid: string, loader: string, mcVersion: string): Promise<BuildInfo> =>
    http
        .get(`/api/client/servers/${uuid}/extensions/minecraft_version_changer/builds/${loader}/${mcVersion}`)
        .then(({ data }) => ({
            loader:           data.loader,
            mcVersion:        data.mc_version,
            builds:           (data.builds ?? []) as BuildEntry[],
            loaderVersion:    data.loader_version ?? null,
            installerVersion: data.installer_version ?? null,
            jarFilename:      data.jar_filename ?? null,
            availableLoaders: data.available_loaders ?? [],
            recommended:      data.recommended ?? null,
            latest:           data.latest ?? null,
            type:             data.type ?? null,
            releaseTime:      data.release_time ?? null,
        }));

export const createBackup = (uuid: string): Promise<BackupResult> =>
    http
        .post(`/api/client/servers/${uuid}/extensions/minecraft_version_changer/backup`, {})
        .then(({ data }) => ({
            uuid: data.attributes.uuid,
            name: data.attributes.name,
        }));

export const switchVersion = (uuid: string, payload: SwitchPayload): Promise<SwitchResult> =>
    http
        .post(`/api/client/servers/${uuid}/extensions/minecraft_version_changer/switch`, payload)
        .then(({ data }) => ({
            jar:       data.attributes.jar,
            loader:    data.attributes.loader,
            mcVersion: data.attributes.mc_version,
        }));
