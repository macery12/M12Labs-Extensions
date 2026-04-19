import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ServerContext } from '@/state/server';
import PageContentBlock from '@/elements/PageContentBlock';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import Spinner from '@/elements/Spinner';
import { Button } from '@/elements/button';
import { usePermissions } from '@/plugins/usePermissions';
import { getStartupEditorData, StartupEditorData, saveStartupOptions, resetStartupCommand } from './api';
import {
    MINECRAFT_OPTIONS,
    PRESETS,
    CATEGORY_LABELS,
    LOADER_LABELS,
    LoaderSlug,
    MinecraftOption,
    Preset,
    OptionCategory,
    isCompatibleWithLoader,
    detectLoaderFromEggName,
    inferSelectedOptionsFromCommand,
    optionsByCategory,
} from './minecraftOptions';

const FLASH_KEY = 'server:extensions:startup_editor';
const ALL_CATEGORIES: OptionCategory[] = ['gc', 'performance', 'server', 'security'];

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: ReactNode }) {
    return (
        <span className={'group relative inline-flex'}>
            {children}
            <span
                className={
                    'pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2'
                    + ' rounded bg-zinc-950 px-3 py-2 text-xs text-neutral-200 shadow-lg group-hover:visible'
                }
                role={'tooltip'}
            >
                {text}
                <span className={'absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-950'} />
            </span>
        </span>
    );
}

// ─── Loader badge ─────────────────────────────────────────────────────────────

function LoaderBadge({ loader }: { loader: string | null }) {
    if (!loader) return null;
    const label = LOADER_LABELS[loader as LoaderSlug] ?? loader;
    return (
        <span className={'rounded-full bg-zinc-600 px-2 py-0.5 text-xs font-medium text-white'}>
            {label}
        </span>
    );
}

// ─── Option card ──────────────────────────────────────────────────────────────

interface OptionCardProps {
    option: MinecraftOption;
    checked: boolean;
    disabled: boolean;
    incompatible: boolean;
    onToggle: (id: string) => void;
}

function OptionCard({ option, checked, disabled, incompatible, onToggle }: OptionCardProps) {
    const borderClass = checked
        ? 'border-blue-500 bg-blue-900/20'
        : incompatible
        ? 'border-zinc-700 bg-zinc-900/40 opacity-50'
        : disabled
        ? 'border-zinc-700 bg-zinc-900/40 opacity-40 cursor-not-allowed'
        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 cursor-pointer';

    return (
        <div
            className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${borderClass}`}
            onClick={() => {
                if (!disabled && !incompatible) onToggle(option.id);
            }}
            role={'checkbox'}
            aria-checked={checked}
            tabIndex={disabled || incompatible ? -1 : 0}
            onKeyDown={e => {
                if ((e.key === ' ' || e.key === 'Enter') && !disabled && !incompatible) onToggle(option.id);
            }}
        >
            <span
                className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded border-2 ${
                    checked ? 'border-blue-500 bg-blue-500' : 'border-zinc-500 bg-transparent'
                }`}
            >
                {checked && (
                    <svg viewBox={'0 0 10 10'} fill={'none'} className={'h-full w-full'}>
                        <polyline points={'1.5,5 4,7.5 8.5,2.5'} stroke={'white'} strokeWidth={'1.5'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                    </svg>
                )}
            </span>

            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-2'}>
                    <span className={'text-sm font-medium text-white'}>{option.name}</span>
                    {option.recommended && (
                        <span className={'rounded-full bg-yellow-600/80 px-1.5 py-px text-xs font-medium text-yellow-100'}>
                            ⭐ Recommended
                        </span>
                    )}
                    {incompatible && (
                        <span className={'rounded-full bg-red-800/80 px-1.5 py-px text-xs font-medium text-red-200'}>
                            Incompatible
                        </span>
                    )}
                    {option.loaderCompat && (
                        <span className={'rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            {option.loaderCompat.map(l => LOADER_LABELS[l] ?? l).join(', ')} only
                        </span>
                    )}
                    {option.minJava > 8 && (
                        <span className={'rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            Java {option.minJava}+
                        </span>
                    )}
                    <Tooltip text={option.tooltip}>
                        <span className={'cursor-help rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-400 hover:bg-zinc-600'}>
                            ?
                        </span>
                    </Tooltip>
                </div>
                <p className={'mt-0.5 text-xs text-neutral-400'}>{option.description}</p>
            </div>
        </div>
    );
}

// ─── Preset card ─────────────────────────────────────────────────────────────

interface PresetCardProps {
    preset: Preset;
    active: boolean;
    onApply: (preset: Preset) => void;
}

function PresetCard({ preset, active, onApply }: PresetCardProps) {
    return (
        <div
            className={`group relative rounded-lg border p-3 transition-colors cursor-pointer ${
                active
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
            }`}
            onClick={() => onApply(preset)}
            role={'button'}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onApply(preset); }}
        >
            <div className={'flex items-start gap-2'}>
                <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${preset.accentColor}`} />
                <div className={'min-w-0 flex-1'}>
                    <p className={'text-sm font-semibold text-white'}>{preset.name}</p>
                    <p className={'mt-0.5 text-xs text-neutral-400'}>{preset.description}</p>
                    {preset.recommendedLoader && (
                        <span className={'mt-1 inline-block rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            Best for {LOADER_LABELS[preset.recommendedLoader]}
                        </span>
                    )}
                </div>
                <Tooltip text={preset.tooltip}>
                    <span className={'flex-shrink-0 cursor-help rounded-full bg-zinc-700 px-1.5 py-px text-xs text-zinc-400 hover:bg-zinc-600'}>
                        ?
                    </span>
                </Tooltip>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);

    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [data, setData]           = useState<StartupEditorData | null>(null);
    const [loading, setLoading]     = useState(true);
    const [saving, setSaving]       = useState(false);
    const [selected, setSelected]   = useState<Set<string>>(new Set());
    const [activePreset, setActivePreset] = useState<string | null>(null);

    const [canStartupRead]   = usePermissions('startup.read');
    const [canStartupUpdate] = usePermissions('startup.update');

    // Resolved loader: from server response or inferred from egg name
    const detectedLoader = data?.detectedLoader ?? (data?.eggName ? detectLoaderFromEggName(data.eggName) : null);

    useEffect(() => {
        if (!uuid) return;
        setLoading(true);
        clearFlashes(FLASH_KEY);

        getStartupEditorData(uuid)
            .then(result => {
                setData(result);
                // Pre-populate from existing startup command if present
                if (!result.isUsingEggDefault && result.rawStartup) {
                    const inferred = inferSelectedOptionsFromCommand(result.rawStartup);
                    setSelected(new Set(inferred));
                }
            })
            .catch(error => clearAndAddHttpError({ key: FLASH_KEY, error }))
            .finally(() => setLoading(false));
    }, [uuid]);

    if (!canStartupRead) {
        return (
            <PageContentBlock title={'Minecraft Startup Editor'}>
                <div className={'rounded-lg bg-zinc-800 p-6'}>
                    <p className={'text-neutral-300'}>You do not have permission to view the startup command.</p>
                    <p className={'mt-2 text-sm text-neutral-400'}>Required: startup.read</p>
                </div>
            </PageContentBlock>
        );
    }

    // ── Option toggle logic ────────────────────────────────────────────────

    const toggleOption = (id: string) => {
        setActivePreset(null);
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const applyPreset = (preset: Preset) => {
        setActivePreset(preset.id);
        setSelected(new Set(preset.optionIds));
    };

    const isIncompatible = (option: MinecraftOption): boolean => {
        return option.incompatibleWith.some(otherId => selected.has(otherId));
    };

    const isUnavailable = (option: MinecraftOption): boolean => {
        return !isCompatibleWithLoader(option, detectedLoader);
    };

    // ── Save / reset handlers ──────────────────────────────────────────────

    const handleSave = async () => {
        if (!uuid) return;
        setSaving(true);
        clearFlashes(FLASH_KEY);
        try {
            const result = await saveStartupOptions(uuid, [...selected]);
            setData(prev =>
                prev
                    ? {
                          ...prev,
                          rawStartup:        result.rawStartup,
                          renderedCommand:   result.renderedCommand,
                          isUsingEggDefault: result.isUsingEggDefault,
                      }
                    : prev,
            );
            addFlash({ key: FLASH_KEY, type: 'success', message: 'Startup configuration saved.' });
        } catch (error) {
            clearAndAddHttpError({ key: FLASH_KEY, error });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        if (!uuid) return;
        setSaving(true);
        clearFlashes(FLASH_KEY);
        try {
            const result = await resetStartupCommand(uuid);
            setData(prev =>
                prev
                    ? {
                          ...prev,
                          rawStartup:        result.rawStartup,
                          renderedCommand:   result.renderedCommand,
                          isUsingEggDefault: result.isUsingEggDefault,
                          eggDefault:        result.eggDefault ?? prev.eggDefault,
                      }
                    : prev,
            );
            setSelected(new Set());
            setActivePreset(null);
            addFlash({ key: FLASH_KEY, type: 'success', message: 'Reset to egg default.' });
        } catch (error) {
            clearAndAddHttpError({ key: FLASH_KEY, error });
        } finally {
            setSaving(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <PageContentBlock title={'Minecraft Startup Editor'}>
            <FlashMessageRender byKey={FLASH_KEY} className={'mb-4'} />

            {loading ? (
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            ) : (
                <>
                    {/* ── Header ── */}
                    <div className={'mb-6 rounded-lg bg-zinc-800 p-5'}>
                        <div className={'flex flex-wrap items-center gap-3'}>
                            <span className={'text-2xl'}>⛏️</span>
                            <h2 className={'text-lg font-bold text-white'}>Minecraft Startup Editor</h2>
                            {data?.isUsingEggDefault ? (
                                <span className={'rounded-full bg-green-700 px-2 py-0.5 text-xs font-medium text-white'}>
                                    Using egg default
                                </span>
                            ) : (
                                <span className={'rounded-full bg-yellow-600 px-2 py-0.5 text-xs font-medium text-white'}>
                                    Custom override active
                                </span>
                            )}
                            <LoaderBadge loader={detectedLoader} />
                        </div>
                        {data?.eggName && (
                            <p className={'mt-1 text-sm text-neutral-400'}>
                                Egg: <span className={'text-neutral-200'}>{data.eggName}</span>
                            </p>
                        )}
                        <p className={'mt-2 text-xs text-neutral-500'}>
                            Select presets or individual options below. Options incompatible with your detected
                            loader or with each other are blocked automatically. No raw command editing is
                            available — all commands are generated from the curated allowlist.
                        </p>
                    </div>

                    {/* ── Two-column layout ── */}
                    <div className={'flex flex-col gap-6 lg:flex-row lg:items-start'}>

                        {/* ── Presets side panel ── */}
                        <aside className={'lg:w-64 lg:flex-shrink-0'}>
                            <div className={'rounded-lg bg-zinc-800 p-4'}>
                                <h3 className={'mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400'}>
                                    Presets
                                </h3>
                                <div className={'flex flex-col gap-2'}>
                                    {PRESETS.map(preset => (
                                        <PresetCard
                                            key={preset.id}
                                            preset={preset}
                                            active={activePreset === preset.id}
                                            onApply={applyPreset}
                                        />
                                    ))}
                                </div>
                                <p className={'mt-3 text-xs text-neutral-500'}>
                                    Selecting a preset replaces your current selection. You can then
                                    fine-tune individual options on the right.
                                </p>
                            </div>
                        </aside>

                        {/* ── Option cards main area ── */}
                        <div className={'flex-1 min-w-0'}>
                            {ALL_CATEGORIES.map(category => {
                                const opts = optionsByCategory(category);
                                // Filter out options that are loader-incompatible (show as disabled, not hidden)
                                return (
                                    <div key={category} className={'mb-6'}>
                                        <h3 className={'mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400'}>
                                            {CATEGORY_LABELS[category]}
                                        </h3>
                                        <div className={'flex flex-col gap-2'}>
                                            {opts.map(option => (
                                                <OptionCard
                                                    key={option.id}
                                                    option={option}
                                                    checked={selected.has(option.id)}
                                                    disabled={
                                                        !canStartupUpdate ||
                                                        saving ||
                                                        isUnavailable(option)
                                                    }
                                                    incompatible={
                                                        canStartupUpdate &&
                                                        !selected.has(option.id) &&
                                                        isIncompatible(option)
                                                    }
                                                    onToggle={toggleOption}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Rendered preview ── */}
                    <div className={'mt-6 rounded-lg bg-zinc-800 p-5'}>
                        <h3 className={'mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-400'}>
                            Rendered Preview
                        </h3>
                        <p className={'mb-2 text-xs text-neutral-500'}>
                            The fully rendered startup command after variable substitution (reflects the last
                            saved state, not your unsaved selection).
                        </p>
                        <pre className={'overflow-x-auto rounded bg-zinc-900 p-3 font-mono text-sm text-neutral-200'}>
                            {data?.renderedCommand || '—'}
                        </pre>
                    </div>

                    {/* ── Action bar ── */}
                    <div className={'mt-6 flex flex-wrap items-center gap-3'}>
                        <Button
                            disabled={!canStartupUpdate || saving}
                            onClick={handleSave}
                        >
                            {saving ? 'Saving…' : `Apply ${selected.size} Option${selected.size !== 1 ? 's' : ''}`}
                        </Button>
                        <Button
                            disabled={!canStartupUpdate || saving || (data?.isUsingEggDefault ?? true)}
                            onClick={handleReset}
                        >
                            Reset to Egg Default
                        </Button>
                        {!canStartupUpdate && (
                            <p className={'text-xs text-neutral-500'}>Requires: startup.update</p>
                        )}
                    </div>
                </>
            )}
        </PageContentBlock>
    );
};
