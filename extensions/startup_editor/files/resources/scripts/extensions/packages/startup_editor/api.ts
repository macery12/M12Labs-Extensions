import http from '@/api/http';

export interface StartupEditorData {
    rawStartup: string | null;
    eggDefault: string;
    renderedCommand: string;
    isUsingEggDefault: boolean;
    eggName: string;
    detectedLoader: string | null;
}

export interface StartupSaveResult {
    renderedCommand: string;
    rawStartup: string | null;
    isUsingEggDefault: boolean;
    eggDefault?: string;
}

export const getStartupEditorData = (uuid: string): Promise<StartupEditorData> => {
    return http
        .get(`/api/client/servers/${uuid}/extensions/startup_editor`)
        .then(({ data }) => ({
            rawStartup:        data.attributes.raw_startup,
            eggDefault:        data.attributes.egg_default,
            renderedCommand:   data.attributes.rendered_command,
            isUsingEggDefault: data.attributes.is_using_egg_default,
            eggName:           data.attributes.egg_name,
            detectedLoader:    data.attributes.detected_loader ?? null,
        }));
};

/**
 * Save a startup configuration built from a curated list of option IDs.
 * No raw command text is accepted by the server; all command text is
 * generated server-side from the validated allowlist.
 *
 * @param selectedOptions  Option IDs to activate (including GC and core_flags).
 * @param xmsMb            Initial heap size in MB (-Xms).
 */
export const saveStartupOptions = (
    uuid: string,
    selectedOptions: string[],
    xmsMb: number,
): Promise<StartupSaveResult> => {
    return http
        .post(`/api/client/servers/${uuid}/extensions/startup_editor/save`, {
            selected_options: selectedOptions,
            xms_mb:           xmsMb,
        })
        .then(({ data }) => ({
            renderedCommand:   data.attributes.rendered_command,
            rawStartup:        data.attributes.raw_startup,
            isUsingEggDefault: data.attributes.is_using_egg_default,
        }));
};

export const resetStartupCommand = (uuid: string): Promise<StartupSaveResult> => {
    return http
        .post(`/api/client/servers/${uuid}/extensions/startup_editor/reset`, {})
        .then(({ data }) => ({
            renderedCommand:   data.attributes.rendered_command,
            rawStartup:        data.attributes.raw_startup,
            isUsingEggDefault: data.attributes.is_using_egg_default,
            eggDefault:        data.attributes.egg_default,
        }));
};
