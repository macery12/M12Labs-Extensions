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

/** Option IDs always included in every generated command. */
const ALWAYS_INCLUDED_IDS = [
    'core_flags',
    'always_pre_touch',
    'disable_explicit_gc',
    'use_container_support',
    'parallel_ref_proc_enabled',
] as const;

/** Toggleable (checkbox) categories. The 'server' category is always-on and handled separately. */
const TOGGLE_CATEGORIES: OptionCategory[] = ['performance', 'security'];

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
            <span className={'cursor-help rounded-full border border-zinc-600 bg-zinc-800 px-1.5 py-px text-[10px] font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}>
                ?
            </span>
        </Tooltip>
    );
}

// ─── LoaderBadge ─────────────────────────────────────────────────────────────

function LoaderBadge({ loader }: { loader: string | null }) {
    if (!loader) return null;
    const label = LOADER_LABELS[loader as LoaderSlug] ?? loader;
    return (
        <span className={'rounded-full border border-zinc-600 bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-200'}>
            {label}
        </span>
    );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

interface CollapsibleSectionProps {
    id: string;
    title: string;
    children: ReactNode;
    collapsed: boolean;
    onToggle: (id: string) => void;
    badge?: string;
}

function CollapsibleSection({ id, title, children, collapsed, onToggle, badge }: CollapsibleSectionProps) {
    return (
        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
            <button
                className={'flex w-full items-center justify-between px-4 py-3 text-left'}
                onClick={() => onToggle(id)}
                aria-expanded={!collapsed}
            >
                <div className={'flex items-center gap-2'}>
                    <h3 className={'text-xs font-semibold uppercase tracking-wider text-zinc-400'}>{title}</h3>
                    {badge && (
                        <span className={'rounded-full bg-zinc-700 px-1.5 py-px text-[10px] font-medium text-zinc-400'}>
                            {badge}
                        </span>
                    )}
                </div>
                <span className={'text-zinc-500 ' + (collapsed ? '' : '[transform:rotate(180deg)]')}>
                    <svg width={'12'} height={'12'} viewBox={'0 0 12 12'} fill={'none'}>
                        <path d={'M2 4l4 4 4-4'} stroke={'currentColor'} strokeWidth={'1.5'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                    </svg>
                </span>
            </button>
            {!collapsed && (
                <div className={'border-t border-zinc-700 px-4 pb-4 pt-3'}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── GC option card (radio style, compact) ───────────────────────────────────

interface GcCardProps {
    option: MinecraftOption;
    selected: boolean;
    onSelect: (id: GcOptionId) => void;
    disabled: boolean;
}

function GcCard({ option, selected, onSelect, disabled }: GcCardProps) {
    const stateClass = selected
        ? 'border-zinc-600 bg-zinc-700/40 border-l-2 border-l-blue-500'
        : disabled
        ? 'border-zinc-700 bg-zinc-900/50 opacity-40 cursor-not-allowed'
        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50 cursor-pointer';

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${stateClass}`}
            onClick={() => { if (!disabled) onSelect(option.id as GcOptionId); }}
            role={'radio'}
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) onSelect(option.id as GcOptionId); }}
        >
            <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-500'}`}>
                {selected && <span className={'h-1.5 w-1.5 rounded-full bg-white'} />}
            </span>
            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-1.5'}>
                    <span className={'text-sm font-medium text-white'}>{option.name}</span>
                    {option.recommended && (
                        <span className={'rounded-full bg-yellow-600/80 px-1.5 py-px text-[10px] font-medium text-yellow-100'}>
                            Recommended
                        </span>
                    )}
                    {option.minJava > 8 && (
                        <span className={'rounded-full border border-zinc-600 bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400'}>
                            Java {option.minJava}+
                        </span>
                    )}
                    <InfoBadge text={option.tooltip} />
                </div>
                <p className={'text-xs text-zinc-400'}>{option.description}</p>
            </div>
        </div>
    );
}

// ─── GC "None" card ───────────────────────────────────────────────────────────

function GcNoneCard({ selected, onSelect, disabled }: { selected: boolean; onSelect: () => void; disabled: boolean }) {
    const stateClass = selected
        ? 'border-zinc-600 bg-zinc-700/40 border-l-2 border-l-blue-500'
        : disabled
        ? 'border-zinc-700 bg-zinc-900/50 opacity-40 cursor-not-allowed'
        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50 cursor-pointer';

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${stateClass}`}
            onClick={() => { if (!disabled) onSelect(); }}
            role={'radio'}
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !disabled) onSelect(); }}
        >
            <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-500'}`}>
                {selected && <span className={'h-1.5 w-1.5 rounded-full bg-white'} />}
            </span>
            <div>
                <span className={'text-sm font-medium text-white'}>No GC Selection</span>
                <p className={'text-xs text-zinc-400'}>Run with JVM defaults — no explicit GC flags applied.</p>
            </div>
        </div>
    );
}

// ─── Option row (checkbox, compact) ──────────────────────────────────────────

interface OptionRowProps {
    option: MinecraftOption;
    checked: boolean;
    disabled: boolean;
    incompatible: boolean;
    onToggle: (id: string) => void;
}

function OptionRow({ option, checked, disabled, incompatible, onToggle }: OptionRowProps) {
    const stateClass = checked
        ? 'border-zinc-600 bg-zinc-700/30 border-l-2 border-l-blue-500'
        : incompatible
        ? 'border-zinc-700 bg-zinc-900/40 opacity-50'
        : disabled
        ? 'border-zinc-700 bg-zinc-900/40 opacity-40 cursor-not-allowed'
        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50 cursor-pointer';

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${stateClass}`}
            onClick={() => { if (!disabled && !incompatible) onToggle(option.id); }}
            role={'checkbox'}
            aria-checked={checked}
            tabIndex={disabled || incompatible ? -1 : 0}
            onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !disabled && !incompatible) onToggle(option.id); }}
        >
            <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border-2 ${checked ? 'border-blue-500 bg-blue-500' : 'border-zinc-500'}`}>
                {checked && (
                    <svg viewBox={'0 0 10 10'} fill={'none'} className={'h-full w-full'}>
                        <polyline points={'1.5,5 4,7.5 8.5,2.5'} stroke={'white'} strokeWidth={'1.5'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                    </svg>
                )}
            </span>
            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-1.5'}>
                    <span className={'text-sm font-medium text-white'}>{option.name}</span>
                    {option.recommended && !incompatible && (
                        <span className={'rounded-full bg-yellow-600/70 px-1.5 py-px text-[10px] font-medium text-yellow-100'}>
                            Recommended
                        </span>
                    )}
                    {incompatible && (
                        <span className={'rounded-full border border-red-800 bg-red-900/60 px-1.5 py-px text-[10px] font-medium text-red-300'}>
                            Incompatible
                        </span>
                    )}
                    {option.loaderCompat && (
                        <span className={'rounded-full border border-zinc-600 bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400'}>
                            {option.loaderCompat.map(l => LOADER_LABELS[l] ?? l).join(', ')} only
                        </span>
                    )}
                    {option.minJava > 8 && (
                        <span className={'rounded-full border border-zinc-600 bg-zinc-800 px-1.5 py-px text-[10px] text-zinc-400'}>
                            Java {option.minJava}+
                        </span>
                    )}
                    <InfoBadge text={option.tooltip} />
                </div>
                <p className={'text-xs text-zinc-400'}>{option.description}</p>
            </div>
        </div>
    );
}

// ─── CoreFlagRow (individual always-on item) ──────────────────────────────────

function CoreFlagRow({ option }: { option: MinecraftOption }) {
    return (
        <div className={'flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-2'}>
            <span className={'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border-2 border-blue-600 bg-blue-600'}>
                <svg viewBox={'0 0 10 10'} fill={'none'} className={'h-full w-full'}>
                    <polyline points={'1.5,5 4,7.5 8.5,2.5'} stroke={'white'} strokeWidth={'1.5'} strokeLinecap={'round'} strokeLinejoin={'round'} />
                </svg>
            </span>
            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-1.5'}>
                    <span className={'text-sm font-medium text-white'}>{option.name}</span>
                    <span className={'rounded-full border border-blue-800 bg-blue-900/40 px-1.5 py-px text-[10px] font-medium text-blue-300'}>
                        Always on
                    </span>
                    <InfoBadge text={option.tooltip} />
                </div>
                <p className={'text-xs text-zinc-400'}>{option.description}</p>
            </div>
        </div>
    );
}

// ─── PresetCard (left accent strip) ──────────────────────────────────────────

interface PresetCardProps {
    preset: Preset;
    active: boolean;
    onApply: (preset: Preset) => void;
}

function PresetCard({ preset, active, onApply }: PresetCardProps) {
    return (
        <div
            className={[
                'group cursor-pointer rounded-lg border transition-all',
                active
                    ? 'border-zinc-500 bg-zinc-700/40'
                    : 'border-transparent hover:border-zinc-700 hover:bg-zinc-800/40',
            ].join(' ')}
            onClick={() => onApply(preset)}
            role={'button'}
            tabIndex={0}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onApply(preset); }}
        >
            <div className={'flex items-start gap-2 px-2.5 py-2'}>
                <span className={`mt-1.5 h-2 w-1.5 flex-shrink-0 rounded-full ${preset.accentColor}`} />
                <div className={'min-w-0 flex-1'}>
                    <div className={'flex items-center gap-1.5'}>
                        <p className={`text-sm font-medium leading-tight ${active ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                            {preset.name}
                        </p>
                        {active && <span className={'text-xs text-blue-400'}>{'✓'}</span>}
                    </div>
                    {preset.recommendedLoader && (
                        <p className={'text-[10px] text-zinc-500'}>
                            Best for {LOADER_LABELS[preset.recommendedLoader]}
                        </p>
                    )}
                </div>
                <InfoBadge text={preset.tooltip} />
            </div>
        </div>
    );
}

// ─── Memory section ───────────────────────────────────────────────────────────

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
        <div className={'space-y-2'}>
            <div className={'flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2'}>
                <div>
                    <div className={'flex items-center gap-1.5'}>
                        <span className={'text-sm font-medium text-white'}>Xmx — Maximum Heap</span>
                        <span className={'rounded-full border border-green-800 bg-green-900/40 px-1.5 py-px text-[10px] font-medium text-green-300'}>
                            Auto
                        </span>
                        <InfoBadge text={"Xmx is set to 80% of your container memory limit via -XX:MaxRAMPercentage=80.0. This ensures the JVM respects Pterodactyl's container limits without needing explicit math on {{SERVER_MEMORY}}."} />
                    </div>
                    <p className={'text-xs text-zinc-500'}>
                        <span className={'font-mono'}>-XX:MaxRAMPercentage=80.0</span> — 80% of container memory
                    </p>
                </div>
            </div>

            <div className={'flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2'}>
                <div>
                    <label htmlFor={inputId} className={'flex items-center gap-1.5 text-sm font-medium text-white'}>
                        Xms — Initial Heap
                        <InfoBadge text={'Lower Xms reduces startup memory usage. Increase for more consistent performance (less GC pressure at boot). Recommend ~10% of your allocated server RAM.'} />
                    </label>
                    <p className={'text-xs text-zinc-500'}>~10% of allocated RAM (e.g. 256 MB for a 2.5 GB server)</p>
                </div>
                <div className={'flex items-center gap-2'}>
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
                            'w-24 rounded-lg border border-zinc-600 bg-zinc-800 px-2.5 py-1.5 text-right text-sm text-white',
                            'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                        ].join(' ')}
                    />
                    <span className={'text-xs text-zinc-500'}>MB</span>
                </div>
            </div>
        </div>
    );
}

// ─── Command preview with copy button ────────────────────────────────────────

function CommandPreview({ command, raw }: { command?: string; raw?: string }) {
    const [copied, setCopied] = useState(false);
    const displayText = command || raw;

    const handleCopy = () => {
        if (!displayText) return;
        navigator.clipboard.writeText(displayText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className={'flex min-w-0 flex-1 items-start gap-3'}>
            <div className={'min-w-0 flex-1'}>
                <p className={'mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500'}>
                    Last saved command
                </p>
                <pre className={'overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-zinc-300'}>
                    {displayText || '—'}
                </pre>
            </div>
            <button
                onClick={handleCopy}
                disabled={!displayText}
                aria-live={'polite'}
                aria-label={copied ? 'Copied to clipboard' : 'Copy command to clipboard'}
                className={[
                    'flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    copied
                        ? 'border-green-700 bg-green-900/40 text-green-300'
                        : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                ].join(' ')}
            >
                {copied ? '✓ Copied' : 'Copy'}
            </button>
        </div>
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
    // UI mode: basic hides non-recommended options
    const [advancedMode, setAdvancedMode] = useState(false);
    // Collapsed section IDs
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set<string>());

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

    // ── Section collapse helper ───────────────────────────────────────────

    const toggleSection = (id: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); } else { next.add(id); }
            return next;
        });
    };

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

    // ── Build payload ─────────────────────────────────────────────────────

    const buildSelectedOptions = (): string[] => {
        const ids: string[] = [...ALWAYS_INCLUDED_IDS];
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

    // ── Visibility helpers ────────────────────────────────────────────────

    /** In basic mode, only recommended (or alwaysEnabled) options are visible. */
    const filterByMode = (opts: MinecraftOption[]) =>
        advancedMode ? opts : opts.filter(o => o.recommended || o.alwaysEnabled);

    const gcOptions = MINECRAFT_OPTIONS.filter(o => (GC_OPTION_IDS as readonly string[]).includes(o.id));
    const visibleGcOptions = filterByMode(gcOptions);

    /** Always-on Core JVM Performance Toggle items (server category). */
    const coreToggleOptions = optionsByCategory('server').filter(o => o.alwaysEnabled);

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <PageContentBlock title={'Minecraft Startup Editor'}>
            <FlashMessageRender byKey={FLASH_KEY} className={'mb-4'} />

            {loading ? (
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            ) : (
                <div className={'space-y-4 pb-28'}>

                    {/* ── Header ── */}
                    <div className={'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3'}>
                        <div className={'flex flex-wrap items-center gap-2'}>
                            <span aria-hidden>{'⛏️'}</span>
                            <h2 className={'text-base font-bold text-white'}>Minecraft Startup Editor</h2>
                            {data?.isUsingEggDefault ? (
                                <span className={'rounded-full border border-green-700 bg-green-900/40 px-2 py-0.5 text-xs text-green-300'}>
                                    Egg default
                                </span>
                            ) : (
                                <span className={'rounded-full border border-yellow-600 bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-300'}>
                                    Custom override
                                </span>
                            )}
                            <LoaderBadge loader={detectedLoader} />
                            {data?.eggName && (
                                <span className={'text-xs text-zinc-500'}>{data.eggName}</span>
                            )}
                        </div>
                        <button
                            onClick={() => setAdvancedMode(m => !m)}
                            className={[
                                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                advancedMode
                                    ? 'border-blue-700 bg-blue-900/40 text-blue-300 hover:bg-blue-900/60'
                                    : 'border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-white',
                            ].join(' ')}
                        >
                            {advancedMode ? '⚙ Advanced' : '✦ Basic'}
                        </button>
                    </div>

                    {/* ── Two-column layout ── */}
                    <div className={'flex flex-col gap-4 lg:flex-row lg:items-start'}>

                        {/* ── Left: Presets ── */}
                        <aside className={'lg:w-52 lg:flex-shrink-0'}>
                            <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-3'}>
                                <h3 className={'mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500'}>
                                    Presets
                                </h3>
                                <div className={'space-y-0.5'}>
                                    {PRESETS.map(preset => (
                                        <PresetCard
                                            key={preset.id}
                                            preset={preset}
                                            active={activePreset === preset.id}
                                            onApply={applyPreset}
                                        />
                                    ))}
                                </div>
                                <p className={'mt-2 px-1 text-[10px] leading-relaxed text-zinc-600'}>
                                    Selecting a preset replaces your current selection.
                                </p>
                            </div>
                        </aside>

                        {/* ── Right: Configuration sections ── */}
                        <div className={'flex-1 space-y-3'}>

                            {/* Memory */}
                            <CollapsibleSection
                                id={'memory'}
                                title={'💾 Memory Configuration'}
                                collapsed={collapsedSections.has('memory')}
                                onToggle={toggleSection}
                            >
                                <MemorySection
                                    xmsMb={xmsMb}
                                    onChange={setXmsMb}
                                    disabled={!canStartupUpdate || saving}
                                />
                            </CollapsibleSection>

                            {/* Garbage Collector */}
                            <CollapsibleSection
                                id={'gc'}
                                title={'🗑️ Garbage Collector'}
                                collapsed={collapsedSections.has('gc')}
                                onToggle={toggleSection}
                                badge={!advancedMode && gcOptions.length > visibleGcOptions.length
                                    ? `+${gcOptions.length - visibleGcOptions.length} in Advanced`
                                    : undefined}
                            >
                                {!advancedMode && (
                                    <p className={'mb-2 text-xs text-zinc-500'}>
                                        Showing recommended options only. Enable Advanced for all GC options.
                                    </p>
                                )}
                                <div role={'radiogroup'} aria-label={'Garbage Collector'} className={'space-y-1.5'}>
                                    {visibleGcOptions.map(option => (
                                        <GcCard
                                            key={option.id}
                                            option={option}
                                            selected={selectedGc === option.id}
                                            onSelect={id => { setSelectedGc(id); setActivePreset(null); }}
                                            disabled={!canStartupUpdate || saving}
                                        />
                                    ))}
                                    {advancedMode && (
                                        <GcNoneCard
                                            selected={selectedGc === null}
                                            onSelect={() => { setSelectedGc(null); setActivePreset(null); }}
                                            disabled={!canStartupUpdate || saving}
                                        />
                                    )}
                                </div>
                            </CollapsibleSection>

                            {/* Core JVM Performance Toggles */}
                            <CollapsibleSection
                                id={'core-toggles'}
                                title={CATEGORY_LABELS['server']}
                                collapsed={collapsedSections.has('core-toggles')}
                                onToggle={toggleSection}
                            >
                                <p className={'mb-2 text-xs text-zinc-500'}>
                                    Always included. Required for Pterodactyl container compatibility.
                                </p>
                                <div className={'space-y-1.5'}>
                                    {coreToggleOptions.map(option => (
                                        <CoreFlagRow key={option.id} option={option} />
                                    ))}
                                </div>
                            </CollapsibleSection>

                            {/* Performance + Security */}
                            {TOGGLE_CATEGORIES.map(category => {
                                const allOpts = optionsByCategory(category).filter(o => !o.alwaysEnabled);
                                const opts = filterByMode(allOpts);
                                const hiddenCount = allOpts.length - opts.length;
                                if (opts.length === 0) return null;
                                return (
                                    <CollapsibleSection
                                        key={category}
                                        id={category}
                                        title={CATEGORY_LABELS[category]}
                                        collapsed={collapsedSections.has(category)}
                                        onToggle={toggleSection}
                                        badge={hiddenCount > 0 ? `+${hiddenCount} in Advanced` : undefined}
                                    >
                                        <div className={'space-y-1.5'}>
                                            {opts.map(option => (
                                                <OptionRow
                                                    key={option.id}
                                                    option={option}
                                                    checked={selected.has(option.id)}
                                                    disabled={!canStartupUpdate || saving || isUnavailable(option)}
                                                    incompatible={canStartupUpdate && !selected.has(option.id) && isIncompatible(option)}
                                                    onToggle={toggleOption}
                                                />
                                            ))}
                                        </div>
                                    </CollapsibleSection>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Sticky bottom bar ── */}
                    <div className={'fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-700 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur-sm'}>
                        <div className={'mx-auto flex max-w-screen-xl items-center gap-3'}>
                            <CommandPreview command={data?.renderedCommand} raw={data?.rawStartup} />
                            <div className={'flex flex-shrink-0 items-center gap-2'}>
                                {!canStartupUpdate && (
                                    <p className={'text-xs text-zinc-500'}>
                                        Requires <span className={'font-mono text-zinc-400'}>startup.update</span>
                                    </p>
                                )}
                                <Button
                                    disabled={!canStartupUpdate || saving}
                                    onClick={handleSave}
                                >
                                    {saving ? 'Saving…' : 'Apply'}
                                </Button>
                                <Button
                                    disabled={!canStartupUpdate || saving || (data?.isUsingEggDefault ?? true)}
                                    onClick={handleReset}
                                >
                                    Reset
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageContentBlock>
    );
};
