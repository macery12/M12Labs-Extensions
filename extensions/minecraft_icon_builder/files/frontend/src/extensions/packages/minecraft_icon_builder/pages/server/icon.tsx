import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, Save, Eraser } from 'lucide-react';
import {
    Button,
    createTranslator,
    extensionErrorMessage,
    notify,
    useExtensionQueryKey,
    useExtensionServerContext,
} from '@/extensions-sdk';
import PixelEditor, { type PixelEditorHandle } from '../../PixelEditor';
import { getIcon, saveIcon } from '../../api';

/*
 * The pixel editor, mounted by the panel as this package's server page.
 * Everything it can reach comes from '@/extensions-sdk', and every colour is a
 * theme variable — except MINECRAFT_PALETTE in PixelEditor, which is paint,
 * not chrome.
 */

const t = createTranslator('minecraft_icon_builder');

/** Cache namespace for this release; an upgrade must not serve an old shape. */
const VERSION = '3.0.0';

export default function MinecraftIconBuilderPage() {
    // The SDK hands a package its server plus the viewer's permissions on it.
    // Hiding a control is not authorization — the FormRequest behind each call
    // is — so this only avoids showing controls that would 403.
    const { server, can } = useExtensionServerContext();
    const uuid = server.uuid;
    const editorRef = useRef<PixelEditorHandle>(null);

    const canReadExtensions = can('extension.read');
    const canManage = can('extension.manage');
    // Reading the existing icon returns the file's bytes, so it answers to
    // file.read-content — file.read only permits listing a directory. This
    // mirrors GetIconRequest, which is the gate that actually decides.
    const canReadContent = can('file.read-content');

    const { data } = useQuery({
        queryKey: useExtensionQueryKey('minecraft_icon_builder', VERSION, 'icon', uuid),
        queryFn: ({ signal }) => getIcon(uuid, signal),
        enabled: canReadExtensions && canReadContent,
    });

    // Paint the saved icon into the always-mounted editor once it loads. (The V1
    // page tried to load while its editor was still unmounted, so a saved icon
    // never appeared — keeping the editor mounted fixes that.)
    useEffect(() => {
        if (data?.has_icon && data.image_base64) {
            editorRef.current?.loadFromDataUrl(data.image_base64);
        }
    }, [data]);

    const save = useMutation({
        mutationFn: () => saveIcon(uuid, editorRef.current?.getImageDataUrl() ?? ''),
        onSuccess: () => notify('success', t('toast.saved', 'Server icon saved successfully.')),
        // The server rejects a non-PNG, an oversized payload or anything that
        // is not exactly 64x64, and says which. Surfacing its message beats a
        // generic failure the user cannot act on.
        onError: err =>
            notify('error', extensionErrorMessage(err, t('toast.saveFailed', 'Could not save the server icon.'))),
    });

    const title = (
        <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">
                {t('page.title', 'Minecraft Icon Builder')}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {t('page.subtitle', 'Paint a 64×64 icon and save it as the server icon.')}
            </p>
        </div>
    );

    if (!canReadExtensions) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    {t('page.deniedExtensions', 'You do not have permission to view extensions.')}
                </div>
            </div>
        );
    }

    if (!canReadContent) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    <p>{t('page.deniedFiles', 'This extension requires permission to read file contents.')}</p>
                    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                        {t('page.deniedFilesPermission', 'Required: {permission}', { permission: 'file.read-content' })}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {title}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Editor panel */}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
                        <ImagePlus className="h-4 w-4 text-[var(--color-ink-faint)]" />
                        {t('editor.title', 'Icon Editor')}
                    </h3>
                    <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
                        {t(
                            'editor.description',
                            'Paint a 64×64 pixel icon. This is saved as {file} in the server root directory.',
                            { file: 'server-icon.png' },
                        )}
                    </p>
                    <PixelEditor ref={editorRef} disabled={!canManage} />
                </div>

                {/* Actions panel */}
                <div className="flex flex-col gap-4">
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                        <h3 className="mb-4 text-base font-semibold text-[var(--color-ink)]">
                            {t('actions.title', 'Actions')}
                        </h3>
                        <div className="flex flex-col gap-3">
                            {canManage ? (
                                <>
                                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                                        <Save className="h-4 w-4" />
                                        {save.isPending
                                            ? t('actions.saving', 'Saving…')
                                            : t('actions.save', 'Save Icon to Server')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => editorRef.current?.clear()}
                                        disabled={save.isPending}
                                    >
                                        <Eraser className="h-4 w-4" />
                                        {t('actions.clear', 'Clear Canvas')}
                                    </Button>
                                </>
                            ) : (
                                <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-warning)]">
                                    {t('actions.needsManage', 'You need the {permission} permission to save icons.', {
                                        permission: 'extension.manage',
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                        <h3 className="mb-3 text-sm font-medium text-[var(--color-ink)]">{t('tips.title', 'Tips')}</h3>
                        <ul className="space-y-1 text-xs text-[var(--color-ink-muted)]">
                            <li>• {t('tips.dimensions', 'Minecraft server icons must be exactly 64×64 pixels.')}</li>
                            <li>• {t('tips.serverList', 'The icon appears on the server list in the Minecraft client.')}</li>
                            <li>• {t('tips.restart', 'Restart the server after saving for the icon to appear.')}</li>
                            <li>• {t('tips.palette', 'Use the palette for classic Minecraft colours.')}</li>
                            <li>• {t('tips.fill', 'Use the Fill tool to quickly colour large areas.')}</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
