import { useEffect, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ImagePlus, Save, Eraser } from 'lucide-react';
import { useServer } from '@/components/server/ServerContext';
import { useFlashes } from '@/state/flashes';
import { can } from '@/lib/can';
import { Button } from '@/components/ui/Button';
import PixelEditor, { type PixelEditorHandle } from './PixelEditor';
import { getIcon, saveIcon } from './api';

// Extension UI: strings are literal English (extensions cannot contribute
// Paraglide messages) and every colour comes from a theme CSS variable.

export default function MinecraftIconBuilderPage() {
    const server = useServer();
    const uuid = server.uuid;
    const push = useFlashes(s => s.push);
    const editorRef = useRef<PixelEditorHandle>(null);

    const held = server.permissions;
    const canReadExtensions = can(held, 'extension.read');
    const canManage = can(held, 'extension.manage');
    const canFileRead = can(held, 'file.read');

    const { data } = useQuery({
        queryKey: ['ext', 'minecraft_icon_builder', uuid, 'icon'],
        queryFn: () => getIcon(uuid),
        enabled: canReadExtensions && canFileRead,
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
        onSuccess: () => push({ type: 'success', message: 'Server icon saved successfully.' }),
        onError: () => push({ type: 'error', message: 'Could not save the server icon.' }),
    });

    const title = (
        <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">Minecraft Icon Builder</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Paint a 64×64 icon and save it as the server icon.
            </p>
        </div>
    );

    if (!canReadExtensions) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    You do not have permission to view extensions.
                </div>
            </div>
        );
    }

    if (!canFileRead) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    <p>This extension requires file read permission.</p>
                    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">Required: file.read</p>
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
                        Icon Editor
                    </h3>
                    <p className="mb-4 text-sm text-[var(--color-ink-muted)]">
                        Paint a 64×64 pixel icon. This is saved as{' '}
                        <code className="rounded bg-[var(--color-surface-2)] px-1 text-xs text-[var(--color-ink)]">
                            server-icon.png
                        </code>{' '}
                        in the server root directory.
                    </p>
                    <PixelEditor ref={editorRef} disabled={!canManage} />
                </div>

                {/* Actions panel */}
                <div className="flex flex-col gap-4">
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                        <h3 className="mb-4 text-base font-semibold text-[var(--color-ink)]">Actions</h3>
                        <div className="flex flex-col gap-3">
                            {canManage ? (
                                <>
                                    <Button onClick={() => save.mutate()} disabled={save.isPending}>
                                        <Save className="h-4 w-4" />
                                        {save.isPending ? 'Saving…' : 'Save Icon to Server'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => editorRef.current?.clear()}
                                        disabled={save.isPending}
                                    >
                                        <Eraser className="h-4 w-4" />
                                        Clear Canvas
                                    </Button>
                                </>
                            ) : (
                                <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-warning)]">
                                    You need extension.manage permission to save icons.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                        <h3 className="mb-3 text-sm font-medium text-[var(--color-ink)]">Tips</h3>
                        <ul className="space-y-1 text-xs text-[var(--color-ink-muted)]">
                            <li>• Minecraft server icons must be exactly 64×64 pixels.</li>
                            <li>• The icon appears on the server list in the Minecraft client.</li>
                            <li>• Restart the server after saving for the icon to appear.</li>
                            <li>• Use the palette for classic Minecraft colours.</li>
                            <li>• Use the Fill tool to quickly colour large areas.</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}
