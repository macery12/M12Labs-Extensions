import { useEffect, useRef, useState } from 'react';
import { ServerContext } from '@/state/server';
import { usePermissions } from '@/plugins/usePermissions';
import useFlash from '@/plugins/useFlash';
import FlashMessageRender from '@/elements/FlashMessageRender';
import PageContentBlock from '@/elements/PageContentBlock';
import { Button } from '@/elements/button';
import Spinner from '@/elements/Spinner';
import PixelEditor, { PixelEditorHandle } from './PixelEditor';
import { getIcon, saveIcon } from './api';

export default function MinecraftIconBuilderPage() {
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const editorRef = useRef<PixelEditorHandle>(null);

    const [canReadExtensions] = usePermissions('extension.read');
    const [canManageExtensions] = usePermissions('extension.manage');
    const [canFileRead] = usePermissions('file.read');

    useEffect(() => {
        if (!uuid || !canFileRead) { setLoading(false); return; }
        getIcon(uuid)
            .then(data => {
                if (data.has_icon && data.image_base64 && editorRef.current) {
                    editorRef.current.loadFromDataUrl(data.image_base64);
                }
            })
            .catch(err => clearAndAddHttpError({ key: 'server:extensions:minecraft_icon_builder', error: err }))
            .finally(() => setLoading(false));
    }, [uuid, canFileRead]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = () => {
        if (!uuid || !editorRef.current) return;
        const dataUrl = editorRef.current.getImageDataUrl();
        setSaving(true);
        clearFlashes('server:extensions:minecraft_icon_builder');
        saveIcon(uuid, dataUrl)
            .then(() => addFlash({ key: 'server:extensions:minecraft_icon_builder', type: 'success', message: 'Server icon saved successfully.' }))
            .catch(err => clearAndAddHttpError({ key: 'server:extensions:minecraft_icon_builder', error: err }))
            .finally(() => setSaving(false));
    };

    const handleClear = () => {
        editorRef.current?.clear();
    };

    if (!canReadExtensions) {
        return (
            <PageContentBlock title={'Minecraft Icon Builder'}>
                <div className={'rounded-lg bg-zinc-800 p-6'}>
                    <p className={'text-neutral-300'}>You do not have permission to view extensions.</p>
                </div>
            </PageContentBlock>
        );
    }

    if (!canFileRead) {
        return (
            <PageContentBlock title={'Minecraft Icon Builder'}>
                <div className={'rounded-lg bg-zinc-800 p-6'}>
                    <p className={'text-neutral-300'}>This extension requires file read permission.</p>
                    <p className={'mt-2 text-sm text-neutral-400'}>Required: file.read</p>
                </div>
            </PageContentBlock>
        );
    }

    return (
        <PageContentBlock title={'Minecraft Icon Builder'}>
            <FlashMessageRender byKey={'server:extensions:minecraft_icon_builder'} className={'mb-4'} />

            {loading ? (
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            ) : (
                <div className={'grid gap-6 lg:grid-cols-2'}>
                    {/* Editor panel */}
                    <div className={'rounded-lg bg-zinc-800 p-6'}>
                        <h3 className={'mb-4 text-lg font-semibold text-white'}>Icon Editor</h3>
                        <p className={'mb-4 text-sm text-neutral-400'}>
                            Paint a 64×64 pixel icon. This will be saved as{' '}
                            <code className={'rounded bg-zinc-700 px-1 text-xs text-neutral-300'}>server-icon.png</code>{' '}
                            in the server root directory.
                        </p>
                        <PixelEditor ref={editorRef} disabled={!canManageExtensions} />
                    </div>

                    {/* Actions panel */}
                    <div className={'flex flex-col gap-4'}>
                        <div className={'rounded-lg bg-zinc-800 p-6'}>
                            <h3 className={'mb-4 text-lg font-semibold text-white'}>Actions</h3>
                            <div className={'flex flex-col gap-3'}>
                                {canManageExtensions ? (
                                    <>
                                        <Button onClick={handleSave} disabled={saving}>
                                            {saving ? 'Saving...' : 'Save Icon to Server'}
                                        </Button>
                                        <Button.Text onClick={handleClear} disabled={saving}>
                                            Clear Canvas
                                        </Button.Text>
                                    </>
                                ) : (
                                    <div className={'rounded-lg border border-amber-600/40 bg-amber-500/10 p-3 text-sm text-amber-300'}>
                                        You need extension.manage permission to save icons.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className={'rounded-lg bg-zinc-800 p-6'}>
                            <h3 className={'mb-3 text-sm font-medium text-neutral-300'}>Tips</h3>
                            <ul className={'space-y-1 text-xs text-neutral-400'}>
                                <li>• Minecraft server icons must be exactly 64×64 pixels.</li>
                                <li>• The icon appears on the server list in the Minecraft client.</li>
                                <li>• Restart the server after saving for the icon to appear.</li>
                                <li>• Use the palette for classic Minecraft colours.</li>
                                <li>• Use the Fill tool to quickly colour large areas.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </PageContentBlock>
    );
}
