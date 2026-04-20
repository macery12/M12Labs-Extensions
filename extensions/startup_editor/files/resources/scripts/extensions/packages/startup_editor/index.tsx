import { useEffect, useState, useId } from 'react';
import type { ReactNode, ChangeEvent } from 'react';
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
    GC_OPTION_IDS,
    DEFAULT_GC,
    DEFAULT_ENABLED_OPTION_IDS,
    LoaderSlug,
    GcOptionId,
    MinecraftOption,
    Preset,
    OptionCategory,
    isCompatibleWithLoader,
    detectLoaderFromEggName,
    inferStateFromCommand,
    optionsByCategory,
} from './minecraftOptions';

const FLASH_KEY = 'server:extensions:startup_editor';

/** Non-GC, non-core categories shown as toggleable checkboxes. */
const TOGGLE_CATEGORIES: OptionCategory[] = ['performance', 'server', 'security'];

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: ReactNode }) {
    return (
        <span className={'group relative inline-flex'}>
            {children}
            <span
                className={[
                    'pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2',
                    'rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs leading-relaxed',
                    'text-neutral-200 shadow-xl group-hover:visible',
                ].join(' ')}
                role={'tooltip'}
            >
                {text}
                <span className={'absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-900'} />
            </span>
        </span>
    );
}

// ─── InfoBadge ────────────────────────────────────────────────────────────────

function InfoBadge({ text }: { text: string }) {
    return (
        <Tooltip text={text}>
            <span
                className={'cursor-help rounded-full border border-zinc-600 bg-zinc-800 px-1.5 py-px text-[10px] font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}
            >
                ?
            </span>
        </Tooltip>
    );
}

// ─── Loader badge ─────────────────────────────────────────────────────────────

function LoaderBadge({ loader }: { loader: string | null }) {
    if (!loader) return null;
    const label = LOADER_LABELS[loader as LoaderSlug] ?? loader;
    return (
        <span className={'rounded-full border border-zinc-600 bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200'}>
            {label}
        </span>
    );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-5'}>
            <h3 className={'mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400'}>{title}</h3>
            {children}
        </div>
    );
}

// ─── GC option card (radio style) ────────────────────────────────────────────

interface GcCardProps {
    option: MinecraftOption;
    selected: boolean;
    onSelect: (id: GcOptionId) => void;
    disabled: boolean;
}

function GcCard({ option, selected, onSelect, disabled }: GcCardProps) {
    const borderClass = selected
        ? 'border-blue-500 bg-blue-900/25 shadow-sm shadow-blue-900/30'
        : disabled
        ? 'border-zinc-700 bg-zinc-900/50 opacity-40 cursor-not-allowed'
        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 cursor-pointer';

    return (
        <div
            className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${borderClass}`}
            onClick={() => { if (!disabled) onSelect(option.id as GcOptionId); }}
            role={'radio'}
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) onSelect(option.id as GcOptionId); }}
        >
            {/* Radio dot */}
            <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-500 bg-transparent'}`}>
                {selected && <span className={'h-1.5 w-1.5 rounded-full bg-white'} />}
            </span>

            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-2'}>
                    <span className={'text-sm font-semibold text-white'}>{option.name}</span>
                    {option.recommended && (
                        <span className={'rounded-full bg-yellow-600/90 px-1.5 py-px text-xs font-medium text-yellow-100'}>
                            ⭐ Recommended
                        </span>
                    )}
                    {option.minJava > 8 && (
                        <span className={'rounded-full border border-zinc-600 bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            Java {option.minJava}+
                        </span>
                    )}
                    <InfoBadge text={option.tooltip} />
                </div>
                <p className={'mt-1 text-xs leading-relaxed text-zinc-300'}>{option.description}</p>
            </div>
        </div>
    );
}

// ─── GC "None" card ───────────────────────────────────────────────────────────

function GcNoneCard({ selected, onSelect, disabled }: { selected: boolean; onSelect: () => void; disabled: boolean }) {
    const borderClass = selected
        ? 'border-blue-500 bg-blue-900/25'
        : disabled
        ? 'border-zinc-700 bg-zinc-900/50 opacity-40 cursor-not-allowed'
        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 cursor-pointer';

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border p-3 transition-all ${borderClass}`}
            onClick={() => { if (!disabled) onSelect(); }}
            role={'radio'}
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) onSelect(); }}
        >
            <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-500 bg-transparent'}`}>
                {selected && <span className={'h-1.5 w-1.5 rounded-full bg-white'} />}
            </span>
            <div>
                <span className={'text-sm font-semibold text-white'}>No GC Selection</span>
                <p className={'mt-0.5 text-xs text-zinc-400'}>Run with JVM defaults — no explicit GC flags applied.</p>
            </div>
        </div>
    );
}

// ─── Option card (checkbox) ───────────────────────────────────────────────────

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
            className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${borderClass}`}
            onClick={() => { if (!disabled && !incompatible) onToggle(option.id); }}
            role={'checkbox'}
            aria-checked={checked}
            tabIndex={disabled || incompatible ? -1 : 0}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !disabled && !incompatible) onToggle(option.id); }}
        >
            <span className={`mt-0.5 h-4 w-4 flex-shrink-0 rounded border-2 ${checked ? 'border-blue-500 bg-blue-500' : 'border-zinc-500 bg-transparent'}`}>
                {checked && (
                    <svg viewBox={'0 0 10 10'} fill={'none'} className={'h-full w-full'}>
                        <polyline points={'1.5,5 4,7.5 8.5,2.5'} stroke={'white'} strokeWidth={'1.5'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                    </svg>
                )}
            </span>

            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-2'}>
                    <span className={'text-sm font-medium text-white'}>{option.name}</span>
                    {option.recommended && !incompatible && (
                        <span className={'rounded-full bg-yellow-600/80 px-1.5 py-px text-xs font-medium text-yellow-100'}>
                            ⭐ Recommended
                        </span>
                    )}
                    {incompatible && (
                        <span className={'rounded-full border border-red-800 bg-red-900/60 px-1.5 py-px text-xs font-medium text-red-300'}>
                            ⚠ Incompatible
                        </span>
                    )}
                    {option.loaderCompat && (
                        <span className={'rounded-full border border-zinc-600 bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            {option.loaderCompat.map(l => LOADER_LABELS[l] ?? l).join(', ')} only
                        </span>
                    )}
                    {option.minJava > 8 && (
                        <span className={'rounded-full border border-zinc-600 bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            Java {option.minJava}+
                        </span>
                    )}
                    <InfoBadge text={option.tooltip} />
                </div>
                <p className={'mt-1 text-xs leading-relaxed text-zinc-300'}>{option.description}</p>
            </div>
        </div>
    );
}

// ─── Core flags row (always-on, locked) ──────────────────────────────────────

function CoreFlagsRow() {
    const option = MINECRAFT_OPTIONS.find(o => o.id === 'core_flags')!;
    return (
        <div className={'flex items-start gap-3 rounded-lg border border-zinc-600 bg-zinc-700/40 p-3'}>
            <span className={'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border-2 border-blue-500 bg-blue-500 text-[10px] text-white'}>
                🔒
            </span>
            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-2'}>
                    <span className={'text-sm font-medium text-white'}>{option.name}</span>
                    <span className={'rounded-full border border-blue-700 bg-blue-900/50 px-1.5 py-px text-xs font-medium text-blue-300'}>
                        Always enabled
                    </span>
                    <InfoBadge text={option.tooltip} />
                </div>
                <p className={'mt-1 text-xs leading-relaxed text-zinc-300'}>{option.description}</p>
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
            className={[
                'group cursor-pointer rounded-lg border p-3 transition-all',
                active ? 'border-blue-500 bg-blue-900/20 shadow-sm shadow-blue-900/30' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500',
            ].join(' ')}
            onClick={() => onApply(preset)}
            role={'button'}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onApply(preset); }}
        >
            <div className={'flex items-start gap-2'}>
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${preset.accentColor}`} />
                <div className={'min-w-0 flex-1'}>
                    <div className={'flex items-center gap-2'}>
                        <p className={'text-sm font-semibold text-white'}>{preset.name}</p>
                        <InfoBadge text={preset.tooltip} />
                    </div>
                    <p className={'mt-1 text-xs leading-relaxed text-zinc-300'}>{preset.description}</p>
                    {preset.recommendedLoader && (
                        <span className={'mt-1.5 inline-block rounded-full border border-zinc-600 bg-zinc-700 px-1.5 py-px text-xs text-zinc-300'}>
                            Best for {LOADER_LABELS[preset.recommendedLoader]}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Memory input ─────────────────────────────────────────────────────────────

interface MemorySectionProps {
    xmsMb: number;
    onChange: (v: number) => void;
    disabled: boolean;
}

function MemorySection({ xmsMb, onChange, disabled }: MemorySectionProps) {
    const inputId = useId();

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= 64) onChange(v);
    };

    return (
        <Section title={'💾 Memory Configuration'}>
            {/* Xmx — auto */}
            <div className={'mb-4 rounded-lg border border-zinc-700 bg-zinc-900 p-3'}>
                <div className={'flex items-center gap-2'}>
                    <span className={'text-sm font-semibold text-white'}>Xmx — Maximum Heap</span>
                    <span className={'rounded-full border border-green-800 bg-green-900/50 px-1.5 py-px text-xs font-medium text-green-300'}>
                        Auto-configured
                    </span>
                    <InfoBadge text={'Xmx is set to 80% of your container memory limit via -XX:MaxRAMPercentage=80.0. This ensures the JVM respects Pterodactyl\'s container limits without needing explicit math on {{SERVER_MEMORY}}.'} />
                </div>
                <p className={'mt-1.5 text-xs leading-relaxed text-zinc-400'}>
                    Set to <span className={'font-mono text-zinc-200'}>-XX:MaxRAMPercentage=80.0</span> (80% of container memory). Since the JVM uses 80% of the container limit, allocate your server memory to 125% of your desired JVM heap (e.g. 5 GB container → ~4 GB JVM).
                </p>
            </div>

            {/* Xms — user input */}
            <div>
                <label htmlFor={inputId} className={'mb-1.5 flex items-center gap-2 text-sm font-semibold text-white'}>
                    Xms — Initial Heap (MB)
                    <InfoBadge text={'Lower Xms reduces startup memory usage. Increase for more consistent performance (less GC pressure at boot). Recommend ~10% of your allocated server RAM.'} />
                </label>
                <div className={'flex items-center gap-3'}>
                    <input
                        id={inputId}
                        type={'number'}
                        min={64}
                        max={16384}
                        step={64}
                        value={xmsMb}
                        onChange={handleChange}
                        disabled={disabled}
                        className={[
                            'w-32 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-white',
                            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                        ].join(' ')}
                    />
                    <span className={'text-sm text-zinc-400'}>MB</span>
                </div>
                <p className={'mt-1.5 text-xs leading-relaxed text-zinc-500'}>
                    Minimum: 64 MB. Recommend ~10% of allocated RAM (e.g. 256 MB for a 2.5 GB server).
                </p>
            </div>
        </Section>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);

    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [data, setData]       = useState<StartupEditorData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);

    // GC selection state (null = no GC / JVM defaults)
    const [selectedGc, setSelectedGc] = useState<GcOptionId | null>(DEFAULT_GC);
    // Non-GC, non-core toggle state
    const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_ENABLED_OPTION_IDS));
    // Memory state
    const [xmsMb, setXmsMb] = useState(256);
    // Active preset indicator
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
                if (!result.isUsingEggDefault && result.rawStartup) {
                    const { gcId, selectedIds, xmsMb: inferredXms } = inferStateFromCommand(result.rawStartup);
                    setSelectedGc(gcId);
                    setSelected(new Set(selectedIds));
                    setXmsMb(inferredXms);
                }
            })
            .catch(error => clearAndAddHttpError({ key: FLASH_KEY, error }))
            .finally(() => setLoading(false));
    }, [uuid]);

    if (!canStartupRead) {
        return (
            <PageContentBlock title={'Minecraft Startup Editor'}>
                <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-6'}>
                    <p className={'text-zinc-200'}>You do not have permission to view the startup command.</p>
                    <p className={'mt-2 text-sm text-zinc-400'}>Required permission: <span className={'font-mono text-zinc-300'}>startup.read</span></p>
                </div>
            </PageContentBlock>
        );
    }

    // ── Option toggle helpers ─────────────────────────────────────────────

    const toggleOption = (id: string) => {
        setActivePreset(null);
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

    const applyPreset = (preset: Preset) => {
        setActivePreset(preset.id);
        setSelectedGc(preset.gcId);
        setSelected(new Set(preset.optionIds));
        setXmsMb(preset.xmsMb);
    };

    const isIncompatible = (option: MinecraftOption): boolean => {
        if (option.incompatibleWith.some(id => selected.has(id))) return true;
        if (selectedGc && option.incompatibleWith.includes(selectedGc)) return true;
        return false;
    };

    const isUnavailable = (option: MinecraftOption): boolean =>
        !isCompatibleWithLoader(option, detectedLoader);

    // ── Build payload helper ──────────────────────────────────────────────

    const buildSelectedOptions = (): string[] => {
        const ids: string[] = ['core_flags'];
        if (selectedGc) ids.push(selectedGc);
        ids.push(...selected);
        return ids;
    };

    // ── Save / reset ──────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!uuid) return;
        setSaving(true);
        clearFlashes(FLASH_KEY);
        try {
            const result = await saveStartupOptions(uuid, buildSelectedOptions(), xmsMb);
            setData(prev =>
                prev ? { ...prev, rawStartup: result.rawStartup, renderedCommand: result.renderedCommand, isUsingEggDefault: result.isUsingEggDefault } : prev,
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
                prev ? { ...prev, rawStartup: result.rawStartup, renderedCommand: result.renderedCommand, isUsingEggDefault: result.isUsingEggDefault, eggDefault: result.eggDefault ?? prev.eggDefault } : prev,
            );
            setSelectedGc(DEFAULT_GC);
            setSelected(new Set(DEFAULT_ENABLED_OPTION_IDS));
            setXmsMb(256);
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
                <div className={'space-y-5'}>
                    {/* ── Header ── */}
                    <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-5'}>
                        <div className={'flex flex-wrap items-center gap-3'}>
                            <span className={'text-2xl'} aria-hidden>⛏️</span>
                            <h2 className={'text-lg font-bold text-white'}>Minecraft Startup Editor</h2>
                            {data?.isUsingEggDefault ? (
                                <span className={'rounded-full border border-green-700 bg-green-900/50 px-2 py-0.5 text-xs font-medium text-green-300'}>
                                    Using egg default
                                </span>
                            ) : (
                                <span className={'rounded-full border border-yellow-600 bg-yellow-900/50 px-2 py-0.5 text-xs font-medium text-yellow-300'}>
                                    Custom override active
                                </span>
                            )}
                            <LoaderBadge loader={detectedLoader} />
                        </div>
                        {data?.eggName && (
                            <p className={'mt-1.5 text-sm text-zinc-400'}>
                                Egg: <span className={'text-zinc-200'}>{data.eggName}</span>
                            </p>
                        )}
                        <p className={'mt-2 text-xs leading-relaxed text-zinc-500'}>
                            Select a preset or configure individual options. Options incompatible with your loader or with each other are blocked automatically. No raw command editing — all commands are generated from the safe, curated allowlist.
                        </p>
                    </div>

                    {/* ── Two-column layout ── */}
                    <div className={'flex flex-col gap-5 lg:flex-row lg:items-start'}>

                        {/* ── Presets side panel ── */}
                        <aside className={'lg:w-64 lg:flex-shrink-0'}>
                            <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-4'}>
                                <h3 className={'mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400'}>
                                    Presets
                                </h3>
                                <div className={'space-y-2'}>
                                    {PRESETS.map(preset => (
                                        <PresetCard
                                            key={preset.id}
                                            preset={preset}
                                            active={activePreset === preset.id}
                                            onApply={applyPreset}
                                        />
                                    ))}
                                </div>
                                <p className={'mt-3 text-xs leading-relaxed text-zinc-500'}>
                                    Selecting a preset replaces your current selection. Fine-tune individual options on the right.
                                </p>
                            </div>
                        </aside>

                        {/* ── Main configuration area ── */}
                        <div className={'flex-1 space-y-5'}>

                            {/* Memory */}
                            <MemorySection
                                xmsMb={xmsMb}
                                onChange={setXmsMb}
                                disabled={!canStartupUpdate || saving}
                            />

                            {/* GC Selection */}
                            <Section title={'🗑️ Garbage Collector'}>
                                <p className={'mb-3 text-xs leading-relaxed text-zinc-400'}>
                                    Choose a garbage collector. Select "No GC Selection" to run with JVM defaults.
                                </p>
                                <div role={'radiogroup'} aria-label={'Garbage Collector'} className={'space-y-2'}>
                                    {MINECRAFT_OPTIONS.filter(o => (GC_OPTION_IDS as readonly string[]).includes(o.id)).map(option => (
                                        <GcCard
                                            key={option.id}
                                            option={option}
                                            selected={selectedGc === option.id}
                                            onSelect={id => { setSelectedGc(id); setActivePreset(null); }}
                                            disabled={!canStartupUpdate || saving}
                                        />
                                    ))}
                                    <GcNoneCard
                                        selected={selectedGc === null}
                                        onSelect={() => { setSelectedGc(null); setActivePreset(null); }}
                                        disabled={!canStartupUpdate || saving}
                                    />
                                </div>
                            </Section>

                            {/* Core flags (always-on) */}
                            <Section title={'🔒 Core JVM Flags — Always Enabled'}>
                                <p className={'mb-3 text-xs leading-relaxed text-zinc-400'}>
                                    These flags are always included in the generated command. They are required for Pterodactyl container compatibility and cannot be disabled.
                                </p>
                                <CoreFlagsRow />
                            </Section>

                            {/* Toggle sections */}
                            {TOGGLE_CATEGORIES.map(category => {
                                const opts = optionsByCategory(category).filter(o => !o.alwaysEnabled);
                                if (opts.length === 0) return null;
                                return (
                                    <Section key={category} title={CATEGORY_LABELS[category]}>
                                        <div className={'space-y-2'}>
                                            {opts.map(option => (
                                                <OptionCard
                                                    key={option.id}
                                                    option={option}
                                                    checked={selected.has(option.id)}
                                                    disabled={!canStartupUpdate || saving || isUnavailable(option)}
                                                    incompatible={canStartupUpdate && !selected.has(option.id) && isIncompatible(option)}
                                                    onToggle={toggleOption}
                                                />
                                            ))}
                                        </div>
                                    </Section>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Rendered preview ── */}
                    <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-5'}>
                        <div className={'mb-2 flex items-center gap-2'}>
                            <h3 className={'text-xs font-semibold uppercase tracking-wider text-zinc-400'}>
                                Rendered Preview
                            </h3>
                            <InfoBadge text={'The fully rendered startup command after Pterodactyl variable substitution. This reflects the last saved state, not your unsaved selection.'} />
                        </div>
                        <pre className={'overflow-x-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm leading-relaxed text-zinc-200'}>
                            {data?.renderedCommand || '—'}
                        </pre>
                    </div>

                    {/* ── Action bar ── */}
                    <div className={'flex flex-wrap items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-4'}>
                        <Button
                            disabled={!canStartupUpdate || saving}
                            onClick={handleSave}
                        >
                            {saving ? 'Saving…' : `Apply Configuration`}
                        </Button>
                        <Button
                            disabled={!canStartupUpdate || saving || (data?.isUsingEggDefault ?? true)}
                            onClick={handleReset}
                        >
                            Reset to Egg Default
                        </Button>
                        {!canStartupUpdate && (
                            <p className={'text-xs text-zinc-500'}>
                                Requires permission: <span className={'font-mono text-zinc-400'}>startup.update</span>
                            </p>
                        )}
                    </div>
                </div>
            )}
        </PageContentBlock>
    );
};
