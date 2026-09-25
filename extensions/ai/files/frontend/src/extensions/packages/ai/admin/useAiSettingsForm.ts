import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    getAiInference,
    getAiSettings,
    updateAiSettings,
    type AiAdminSettings,
    type AiProvider,
    type AiSettingsPayload,
} from '../adminApi';
import { resolveCapabilities, type AiCapabilities } from './capabilities';
import { notify, extensionErrorMessage, createTranslator, refreshExtensionFlags } from '@/extensions-sdk';

const t = createTranslator('ai');

export const AI_SETTINGS_KEY = ['admin', 'ai', 'settings'] as const;
export const AI_INFERENCE_KEY = ['admin', 'ai', 'inference'] as const;

/** The settings document, shared by every page in the section. */
export function useAiSettings() {
    return useQuery({ queryKey: AI_SETTINGS_KEY, queryFn: getAiSettings });
}

/**
 * What the configured provider honours.
 *
 * Takes an optional provider override so a page can reflect the value in the
 * dropdown rather than the one on file — switching provider has to redraw the
 * form immediately, not after a save.
 */
export function useAiCapabilities(provider?: AiProvider): AiCapabilities {
    const { data: settings } = useAiSettings();
    const { data: inference } = useQuery({
        queryKey: AI_INFERENCE_KEY,
        queryFn: getAiInference,
        retry: false,
        staleTime: 60_000,
    });

    return resolveCapabilities(provider ?? settings?.provider ?? 'ollama', settings, inference);
}

/**
 * One page's slice of the settings document, with dirty tracking.
 *
 * `select` narrows the document to what this page edits and `toPayload` turns
 * that back into a partial update — so a save sends only the keys the page owns
 * and cannot blank a field it never displayed. The backend is already built for
 * this: `UpdateIntelligenceSettingsRequest::normalize()` skips absent keys.
 *
 * There is deliberately no hydrate-once effect. The previous single-page form
 * latched its state on first load and never re-read the server, so a change
 * made in another tab stayed invisible until a hard reload. Here the draft is
 * null until someone types, which means an untouched page always shows what is
 * actually stored, and an edited one is never overwritten mid-edit.
 */
export function useAiSettingsForm<T extends object>(
    select: (settings: AiAdminSettings) => T,
    toPayload: (value: T) => AiSettingsPayload,
) {
    const queryClient = useQueryClient();
    const settingsQuery = useAiSettings();
    const { data: settings, isLoading, isError } = settingsQuery;
    const [draft, setDraft] = useState<T | null>(null);

    const saved = settings ? select(settings) : null;
    const value = draft ?? saved;

    // Both sides are built by the same `select`, so key order is stable and a
    // string compare is a sound (and cheap) deep compare for these flat slices.
    const dirty = draft !== null && saved !== null && JSON.stringify(draft) !== JSON.stringify(saved);

    const save = useMutation({
        mutationFn: (next: T) => updateAiSettings(toPayload(next)),
        onSuccess: () => {
            setDraft(null);
            notify('success', t('admin.settings.saved', 'AI settings have been saved.'));
            void queryClient.invalidateQueries({ queryKey: ['admin', 'ai'] });
            syncFlags();
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    return {
        settings,
        isLoading,
        isError,
        retry: () => {
            void settingsQuery.refetch();
        },
        value,
        dirty,
        saving: save.isPending,
        patch: (partial: Partial<T>) =>
            setDraft(prev => {
                const base = prev ?? saved;

                return base ? { ...base, ...partial } : prev;
            }),
        discard: () => setDraft(null),
        submit: () => {
            if (value && dirty) save.mutate(value);
        },
    };
}

/**
 * Re-read this package's declared flags so nav and slot gating update without
 * a reload.
 *
 * The panel recomputes them from what was just saved, which is why this takes
 * no argument and mirrors nothing. It used to: the client rebuilt
 * `agent.enabled && agent.admin_enabled` itself, in parallel with the backend
 * composer that computed the same conjunction — two copies of one rule, and the
 * copy here could only ever be as current as the last time somebody remembered
 * to update it. The condition now lives once, in the manifest.
 */
function syncFlags(): void {
    void refreshExtensionFlags();
}
