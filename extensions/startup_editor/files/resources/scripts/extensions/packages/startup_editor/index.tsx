import { useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import PageContentBlock from '@/elements/PageContentBlock';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import Spinner from '@/elements/Spinner';
import { Button } from '@/elements/button';
import { usePermissions } from '@/plugins/usePermissions';
import {
    getStartupEditorData,
    StartupEditorData,
    saveStartupCommand,
    resetStartupCommand,
} from './api';

const FLASH_KEY = 'server:extensions:startup_editor';

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);

    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [data, setData] = useState<StartupEditorData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [overrideValue, setOverrideValue] = useState('');

    const [canStartupRead] = usePermissions('startup.read');
    const [canStartupUpdate] = usePermissions('startup.update');

    useEffect(() => {
        if (!uuid) return;

        setLoading(true);
        clearFlashes(FLASH_KEY);

        getStartupEditorData(uuid)
            .then(result => {
                setData(result);
                setOverrideValue(result.rawStartup ?? '');
            })
            .catch(error => {
                clearAndAddHttpError({ key: FLASH_KEY, error });
            })
            .finally(() => setLoading(false));
    }, [uuid]);

    if (!canStartupRead) {
        return (
            <PageContentBlock title={'Startup Command Editor'}>
                <div className={'rounded-lg bg-zinc-800 p-6'}>
                    <p className={'text-neutral-300'}>You do not have permission to view the startup command.</p>
                    <p className={'mt-2 text-sm text-neutral-400'}>Required: startup.read</p>
                </div>
            </PageContentBlock>
        );
    }

    return (
        <PageContentBlock title={'Startup Command Editor'}>
            <FlashMessageRender byKey={FLASH_KEY} className={'mb-4'} />

            {loading ? (
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            ) : (
                <>
                    <div className={'rounded-lg bg-zinc-800 p-6'}>
                        <div className={'flex items-center gap-3'}>
                            <h3 className={'text-lg font-semibold text-white'}>Startup Command Editor</h3>
                            {data?.isUsingEggDefault ? (
                                <span className={'rounded-full bg-green-700 px-2 py-0.5 text-xs font-medium text-white'}>
                                    Using egg default
                                </span>
                            ) : (
                                <span className={'rounded-full bg-yellow-600 px-2 py-0.5 text-xs font-medium text-white'}>
                                    Custom override active
                                </span>
                            )}
                        </div>
                        {data?.eggName && (
                            <p className={'mt-1 text-sm text-neutral-400'}>
                                Egg: <span className={'text-neutral-200'}>{data.eggName}</span>
                            </p>
                        )}
                    </div>

                    <div className={'mt-6 rounded-lg bg-zinc-800 p-6'}>
                        <h3 className={'text-lg font-semibold text-white'}>Egg Default</h3>
                        <p className={'mt-2 text-sm text-neutral-400'}>The unmodified startup command defined by the egg.</p>
                        <pre className={'mt-3 overflow-x-auto rounded bg-zinc-900 p-3 font-mono text-sm text-neutral-200'}>
                            {data?.eggDefault || '—'}
                        </pre>
                    </div>

                    <div className={'mt-6 rounded-lg bg-zinc-800 p-6'}>
                        <h3 className={'text-lg font-semibold text-white'}>Custom Override</h3>
                        <p className={'mt-2 text-sm text-neutral-400'}>
                            Override the startup command for this server. Leave blank and reset to use the egg default.
                        </p>
                        <textarea
                            className={
                                'mt-3 w-full rounded bg-zinc-900 p-3 font-mono text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
                            }
                            rows={4}
                            disabled={!canStartupUpdate || saving}
                            value={overrideValue}
                            onChange={e => setOverrideValue(e.target.value)}
                            placeholder={'Enter custom startup command override...'}
                        />
                        {!canStartupUpdate && (
                            <p className={'mt-2 text-xs text-neutral-500'}>Requires: startup.update</p>
                        )}
                        <div className={'mt-4 flex flex-wrap gap-3'}>
                            <Button
                                disabled={!canStartupUpdate || saving}
                                onClick={async () => {
                                    if (!uuid) return;
                                    setSaving(true);
                                    clearFlashes(FLASH_KEY);
                                    try {
                                        const result = await saveStartupCommand(uuid, overrideValue);
                                        setData(prev =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      rawStartup: result.rawStartup,
                                                      renderedCommand: result.renderedCommand,
                                                      isUsingEggDefault: result.isUsingEggDefault,
                                                  }
                                                : prev,
                                        );
                                        addFlash({ key: FLASH_KEY, type: 'success', message: 'Startup command saved.' });
                                    } catch (error) {
                                        clearAndAddHttpError({ key: FLASH_KEY, error });
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                            >
                                Save Command
                            </Button>
                            <Button
                                disabled={!canStartupUpdate || saving || (data?.isUsingEggDefault ?? true)}
                                onClick={async () => {
                                    if (!uuid) return;
                                    setSaving(true);
                                    clearFlashes(FLASH_KEY);
                                    try {
                                        const result = await resetStartupCommand(uuid);
                                        setData(prev =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      rawStartup: result.rawStartup,
                                                      renderedCommand: result.renderedCommand,
                                                      isUsingEggDefault: result.isUsingEggDefault,
                                                      eggDefault: result.eggDefault ?? prev.eggDefault,
                                                  }
                                                : prev,
                                        );
                                        setOverrideValue('');
                                        addFlash({ key: FLASH_KEY, type: 'success', message: 'Reset to egg default.' });
                                    } catch (error) {
                                        clearAndAddHttpError({ key: FLASH_KEY, error });
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                            >
                                Reset to Egg Default
                            </Button>
                        </div>
                    </div>

                    <div className={'mt-6 rounded-lg bg-zinc-800 p-6'}>
                        <h3 className={'text-lg font-semibold text-white'}>Rendered Preview</h3>
                        <p className={'mt-2 text-sm text-neutral-400'}>
                            The fully rendered startup command after variable substitution.
                        </p>
                        <pre className={'mt-3 overflow-x-auto rounded bg-zinc-900 p-3 font-mono text-sm text-neutral-200'}>
                            {data?.renderedCommand || '—'}
                        </pre>
                    </div>
                </>
            )}
        </PageContentBlock>
    );
};
