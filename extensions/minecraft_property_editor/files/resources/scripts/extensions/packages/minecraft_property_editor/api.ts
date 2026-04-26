import http from '@/api/http';

export interface PropertyEditorData {
    rawContent: string;
    properties: Record<string, string>;
    detectedVersion: string | null;
    detectedServerType: string | null;
    eggName: string;
    fileExists: boolean;
}

export interface PropertySaveResult {
    properties: Record<string, string>;
}

export const getPropertyEditorData = (uuid: string): Promise<PropertyEditorData> => {
    return http
        .get(`/api/client/servers/${uuid}/extensions/minecraft_property_editor`)
        .then(({ data }) => ({
            rawContent:         data.raw_content ?? '',
            properties:         data.properties ?? {},
            detectedVersion:    data.detected_version ?? null,
            detectedServerType: data.detected_server_type ?? null,
            eggName:            data.egg_name ?? '',
            fileExists:         data.file_exists ?? false,
        }));
};

export const saveProperties = (
    uuid: string,
    properties: Record<string, string>,
    serverType?: string,
    mcVersion?: string,
): Promise<PropertySaveResult> => {
    return http
        .post(`/api/client/servers/${uuid}/extensions/minecraft_property_editor/save`, {
            properties,
            server_type: serverType ?? null,
            mc_version:  mcVersion  ?? null,
        })
        .then(({ data }) => ({
            properties: data.properties ?? {},
        }));
};
