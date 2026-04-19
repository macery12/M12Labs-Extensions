import http from '@/api/http';

export interface StartupEditorData {
    rawStartup: string | null;
    eggDefault: string;
    renderedCommand: string;
    isUsingEggDefault: boolean;
    eggName: string;
}

export interface StartupSaveResult {
    renderedCommand: string;
    rawStartup: string | null;
    isUsingEggDefault: boolean;
    eggDefault?: string;
}

export const getStartupEditorData = (uuid: string): Promise<StartupEditorData> => {
    return http
        .get(`/api/client/servers/${uuid}/extensions/minecraft_startup_editor`)
        .then(({ data }) => ({
            rawStartup: data.attributes.raw_startup,
            eggDefault: data.attributes.egg_default,
            renderedCommand: data.attributes.rendered_command,
            isUsingEggDefault: data.attributes.is_using_egg_default,
            eggName: data.attributes.egg_name,
        }));
};

export const saveStartupCommand = (uuid: string, startup: string): Promise<StartupSaveResult> => {
    return http
        .post(`/api/client/servers/${uuid}/extensions/minecraft_startup_editor/save`, { startup })
        .then(({ data }) => ({
            renderedCommand: data.attributes.rendered_command,
            rawStartup: data.attributes.raw_startup,
            isUsingEggDefault: data.attributes.is_using_egg_default,
        }));
};

export const resetStartupCommand = (uuid: string): Promise<StartupSaveResult> => {
    return http
        .post(`/api/client/servers/${uuid}/extensions/minecraft_startup_editor/reset`, {})
        .then(({ data }) => ({
            renderedCommand: data.attributes.rendered_command,
            rawStartup: data.attributes.raw_startup,
            isUsingEggDefault: data.attributes.is_using_egg_default,
            eggDefault: data.attributes.egg_default,
        }));
};
