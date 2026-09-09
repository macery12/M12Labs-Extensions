import { useEffect, useState, useId } from 'react';
import type { ReactNode, ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Button,
    Spinner,
    createTranslator,
    extensionErrorMessage,
    notify,
    useExtensionQueryKey,
    useExtensionServerContext,
} from '@/extensions-sdk';
import { getStartupEditorData, saveStartupOptions, resetStartupCommand, type StartupEditorData } from '../../api';
import {
    MINECRAFT_OPTIONS,
    PRESETS,
    CATEGORY_LABELS,
    LOADER_LABELS,
    GC_OPTION_IDS,
    DEFAULT_GC,
    DEFAULT_ENABLED_OPTION_IDS,
    DEFAULT_JAVA_TIER,
    JAVA_VERSION_TIER_LABELS,
    TIER_MAX_JAVA,
    type LoaderSlug,
    type GcOptionId,
    type JavaVersionTier,
    type MinecraftOption,
    type Preset,
    type OptionCategory,
    isCompatibleWithLoader,
    isGcRecommendedForTier,
    isGcLegacyForTier,
    getDefaultGcForTier,
    getAlwaysIncludedForContext,
    detectLoaderFromEggName,
    inferStateFromCommand,
    optionsByCategory,
} from '../../minecraftOptions';

/*
 * The curated startup editor, mounted by the panel as this package's server
 * page. Everything it can reach comes from '@/extensions-sdk' — the package
 * has no access to panel internals — and every colour is a theme variable, so
 * the page follows the operator's palette. Semantic mapping: brand=selection/
 * recommended, accent=positive, warning=caution/legacy, danger=incompatible.
 * (Preset accent stripes in minecraftOptions.ts keep distinct categorical hues
 * by design.)
 *
 * Strings resolve through the package's own `ext.minecraft_startup_editor.*`
 * namespace. The option catalog passes its English text as the fallback, so the
 * page reads correctly in a locale that has not translated a flag description
 * yet, and messages/en.json carries every key a translator can override.
 */

const t = createTranslator('minecraft_startup_editor');

/** Cache namespace for this release; an upgrade must not serve an old shape. */
const VERSION = '3.0.0';

/**
 * Share of a bounded allocation the heap may claim.
 *
 * Mirrors SaveStartupEditorRequest::HEAP_BUDGET_PERCENT. The server is the
 * authority — this copy only stops the editor offering a value the save would
 * reject.
 */
const HEAP_BUDGET_PERCENT = 85;

const MIN_HEAP_MB = 64;
const MAX_XMS_MB = 16384;
const MAX_XMX_MB = 65536;

/** The largest heap the given allocation supports; 0 means unlimited. */
function heapBudgetMb(memoryMb: number): number {
    return memoryMb > 0 ? Math.max(MIN_HEAP_MB, Math.floor((memoryMb * HEAP_BUDGET_PERCENT) / 100)) : 0;
}

/** Toggleable (checkbox) categories. The 'server' category is always-on and handled separately. */
const TOGGLE_CATEGORIES: OptionCategory[] = ['performance', 'security'];

// Reusable badge style fragments.
const BADGE = 'rounded-full px-1.5 py-px text-[10px] font-medium';
const BADGE_NEUTRAL = `${BADGE} border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-ink-faint)]`;
const BADGE_BRAND = `${BADGE} border border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-bright)]`;
const BADGE_ACCENT = `${BADGE} border border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-accent)]`;
const BADGE_WARNING = `${BADGE} border border-[var(--color-warning)] bg-[var(--color-surface-2)] text-[var(--color-warning)]`;
const BADGE_DANGER = `${BADGE} border border-[var(--color-danger)] bg-[var(--color-surface-2)] text-[var(--color-danger)]`;

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: ReactNode }) {
    // Named group (`group/tt`) so the tooltip only reveals on hover of its own
    // trigger — an ancestor card that also uses a bare `group` must not open it.
    return (
        <span className="group/tt relative inline-flex">
            {children}
            <span
                className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-canvas)] px-3 py-2 text-xs leading-relaxed text-[var(--color-ink)] opacity-0 shadow-xl transition-opacity group-hover/tt:visible group-hover/tt:opacity-100"
                role="tooltip"
            >
                {text}
            </span>
        </span>
    );
}

// ─── InfoBadge ────────────────────────────────────────────────────────────────

function InfoBadge({ text }: { text: string }) {
    return (
        <Tooltip text={text}>
            <span className="cursor-help rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-1.5 py-px text-[10px] font-medium text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]">
                ?
            </span>
        </Tooltip>
    );
}

// ─── LoaderBadge ─────────────────────────────────────────────────────────────

function LoaderBadge({ loader }: { loader: string | null }) {
    if (!loader) return null;
    const label = t(`loader.${loader}`, LOADER_LABELS[loader as LoaderSlug] ?? loader);
    return (
        <span className="rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-ink)]">
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
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
            <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => onToggle(id)}
                aria-expanded={!collapsed}
            >
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                        {title}
                    </h3>
                    {badge && <span className={BADGE_NEUTRAL}>{badge}</span>}
                </div>
                <span className={'text-[var(--color-ink-faint)] ' + (collapsed ? '' : '[transform:rotate(180deg)]')}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path
                            d="M2 4l4 4 4-4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </span>
            </button>
            {!collapsed && (
                <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3">{children}</div>
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
    recommended?: boolean;
    legacy?: boolean;
}

function GcCard({ option, selected, onSelect, disabled, recommended, legacy }: GcCardProps) {
    const stateClass = selected
        ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] border-l-2 border-l-[var(--brand)]'
        : disabled
          ? 'border-[var(--color-border)] bg-[var(--color-canvas)] opacity-40 cursor-not-allowed'
          : 'border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-border-strong)] cursor-pointer';

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${stateClass}`}
            onClick={() => {
                if (!disabled) onSelect(option.id as GcOptionId);
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => {
                if ((e.key === ' ' || e.key === 'Enter') && !disabled) onSelect(option.id as GcOptionId);
            }}
        >
            <span
                className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-[var(--color-ink-faint)]'}`}
            >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-ink)]" />}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--color-ink)]">
                        {t(`option.${option.id}.name`, option.name)}
                    </span>
                    {recommended && <span className={BADGE_BRAND}>{t('badge.recommended', 'Recommended')}</span>}
                    {legacy && <span className={BADGE_WARNING}>{t('badge.legacy', 'Legacy')}</span>}
                    {option.minJava > 8 && (
                        <span className={BADGE_NEUTRAL}>
                            {t('badge.minJava', 'Java {version}+', { version: option.minJava })}
                        </span>
                    )}
                    <InfoBadge text={t(`option.${option.id}.tooltip`, option.tooltip)} />
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                    {t(`option.${option.id}.description`, option.description)}
                </p>
            </div>
        </div>
    );
}

// ─── GC "None" card ───────────────────────────────────────────────────────────

function GcNoneCard({ selected, onSelect, disabled }: { selected: boolean; onSelect: () => void; disabled: boolean }) {
    const stateClass = selected
        ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] border-l-2 border-l-[var(--brand)]'
        : disabled
          ? 'border-[var(--color-border)] bg-[var(--color-canvas)] opacity-40 cursor-not-allowed'
          : 'border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-border-strong)] cursor-pointer';

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${stateClass}`}
            onClick={() => {
                if (!disabled) onSelect();
            }}
            role="radio"
            aria-checked={selected}
            tabIndex={disabled ? -1 : 0}
            onKeyDown={e => {
                if ((e.key === ' ' || e.key === 'Enter') && !disabled) onSelect();
            }}
        >
            <span
                className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-[var(--color-ink-faint)]'}`}
            >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-ink)]" />}
            </span>
            <div>
                <span className="text-sm font-medium text-[var(--color-ink)]">
                    {t('gc.none.title', 'No GC Selection')}
                </span>
                <p className="text-xs text-[var(--color-ink-muted)]">
                    {t('gc.none.description', 'Run with JVM defaults — no explicit GC flags applied.')}
                </p>
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
    alwaysOn?: boolean;
}

function OptionRow({ option, checked, disabled, incompatible, onToggle, alwaysOn }: OptionRowProps) {
    const effectiveChecked = alwaysOn || checked;
    const stateClass = alwaysOn
        ? 'border-[var(--color-border)] bg-[var(--color-canvas)]'
        : effectiveChecked
          ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] border-l-2 border-l-[var(--brand)]'
          : incompatible
            ? 'border-[var(--color-border)] bg-[var(--color-canvas)] opacity-50'
            : disabled
              ? 'border-[var(--color-border)] bg-[var(--color-canvas)] opacity-40 cursor-not-allowed'
              : 'border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-border-strong)] cursor-pointer';

    const isClickable = !alwaysOn && !disabled && !incompatible;

    return (
        <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-all ${stateClass}`}
            onClick={() => {
                if (isClickable) onToggle(option.id);
            }}
            role="checkbox"
            aria-checked={effectiveChecked}
            tabIndex={isClickable ? 0 : -1}
            onKeyDown={e => {
                if ((e.key === ' ' || e.key === 'Enter') && isClickable) onToggle(option.id);
            }}
        >
            <span
                className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border-2 ${effectiveChecked ? 'border-[var(--brand)] bg-[var(--brand)]' : 'border-[var(--color-ink-faint)]'}`}
            >
                {effectiveChecked && (
                    <svg viewBox="0 0 10 10" fill="none" className="h-full w-full">
                        <polyline
                            points="1.5,5 4,7.5 8.5,2.5"
                            stroke="var(--color-brand-ink)"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--color-ink)]">
                        {t(`option.${option.id}.name`, option.name)}
                    </span>
                    {alwaysOn && <span className={BADGE_BRAND}>{t('badge.alwaysOn', 'Always on')}</span>}
                    {!alwaysOn && option.recommended && !incompatible && (
                        <span className={BADGE_BRAND}>{t('badge.recommended', 'Recommended')}</span>
                    )}
                    {incompatible && <span className={BADGE_DANGER}>{t('badge.incompatible', 'Incompatible')}</span>}
                    {option.loaderCompat && (
                        <span className={BADGE_NEUTRAL}>
                            {t('badge.loaderOnly', '{loaders} only', {
                                loaders: option.loaderCompat
                                    .map(l => t(`loader.${l}`, LOADER_LABELS[l] ?? l))
                                    .join(', '),
                            })}
                        </span>
                    )}
                    {option.minJava > 8 && (
                        <span className={BADGE_NEUTRAL}>
                            {t('badge.minJava', 'Java {version}+', { version: option.minJava })}
                        </span>
                    )}
                    <InfoBadge text={t(`option.${option.id}.tooltip`, option.tooltip)} />
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                    {t(`option.${option.id}.description`, option.description)}
                </p>
            </div>
        </div>
    );
}

// ─── CoreFlagRow (individual always-on item) ──────────────────────────────────

function CoreFlagRow({ option }: { option: MinecraftOption }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2">
            <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border-2 border-[var(--brand)] bg-[var(--brand)]">
                <svg viewBox="0 0 10 10" fill="none" className="h-full w-full">
                    <polyline
                        points="1.5,5 4,7.5 8.5,2.5"
                        stroke="var(--color-brand-ink)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--color-ink)]">
                        {t(`option.${option.id}.name`, option.name)}
                    </span>
                    <span className={BADGE_BRAND}>{t('badge.alwaysOn', 'Always on')}</span>
                    <InfoBadge text={t(`option.${option.id}.tooltip`, option.tooltip)} />
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                    {t(`option.${option.id}.description`, option.description)}
                </p>
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
                    ? 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)]'
                    : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-surface-2)]',
            ].join(' ')}
            onClick={() => onApply(preset)}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') onApply(preset);
            }}
        >
            <div className="flex items-start gap-2 px-2.5 py-2">
                <span className={`mt-1.5 h-2 w-1.5 flex-shrink-0 rounded-full ${preset.accentColor}`} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <p
                            className={`text-sm font-medium leading-tight ${active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]'}`}
                        >
                            {t(`preset.${preset.id}.name`, preset.name)}
                        </p>
                        {active && <span className="text-xs text-[var(--brand-bright)]">✓</span>}
                    </div>
                    {preset.recommendedLoader && (
                        <p className="text-[10px] text-[var(--color-ink-faint)]">
                            {t('presets.bestFor', 'Best for {loader}', {
                                loader: t(
                                    `loader.${preset.recommendedLoader}`,
                                    LOADER_LABELS[preset.recommendedLoader],
                                ),
                            })}
                        </p>
                    )}
                </div>
                <InfoBadge text={t(`preset.${preset.id}.tooltip`, preset.tooltip)} />
            </div>
        </div>
    );
}

// ─── Memory section ───────────────────────────────────────────────────────────

interface MemorySectionProps {
    xmsMb: number;
    xmxMb: number;
    suggestedXmsMb: number;
    suggestedXmxMb: number;
    /** The server's allocation in MB; 0 when the server is unlimited. */
    memoryMb: number;
    onXmsChange: (v: number) => void;
    onXmxChange: (v: number) => void;
    disabled: boolean;
}

function MemorySection({
    xmsMb,
    xmxMb,
    suggestedXmsMb,
    suggestedXmxMb,
    memoryMb,
    onXmsChange,
    onXmxChange,
    disabled,
}: MemorySectionProps) {
    const baseId = useId();
    const xmsId = `${baseId}-xms`;
    const xmxId = `${baseId}-xmx`;

    // What the server will actually accept. Offering a spinner that runs to
    // 64 GiB on a 2 GiB server just produces a save that 422s, so the input
    // stops where SaveStartupEditorRequest stops.
    const budget = heapBudgetMb(memoryMb);
    const xmsMax = budget > 0 ? Math.min(MAX_XMS_MB, budget) : MAX_XMS_MB;
    const xmxMax = budget > 0 ? Math.min(MAX_XMX_MB, budget) : MAX_XMX_MB;

    const handleXmsChange = (e: ChangeEvent<HTMLInputElement>) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= MIN_HEAP_MB) onXmsChange(Math.min(v, xmsMax));
    };

    const handleXmxChange = (e: ChangeEvent<HTMLInputElement>) => {
        const v = parseInt(e.target.value, 10);
        if (!isNaN(v) && v >= MIN_HEAP_MB) onXmxChange(Math.min(v, xmxMax));
    };

    const inputClass = [
        'w-24 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-right text-sm text-[var(--color-ink)]',
        'focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
    ].join(' ');

    return (
        <div className="space-y-2">
            {budget > 0 && (
                <p className="text-xs text-[var(--color-ink-faint)]">
                    {t('memory.limit', 'This server is allocated {memory} MB, so the heap is capped at {budget} MB.', {
                        memory: memoryMb,
                        budget,
                    })}
                </p>
            )}

            {/* Xms */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2">
                <div>
                    <label htmlFor={xmsId} className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink)]">
                        {t('memory.xms.label', 'Xms — Initial Heap')}
                        <InfoBadge
                            text={t(
                                'memory.xms.tooltip',
                                'The initial heap size the JVM allocates at startup. Lower values reduce startup memory; higher values reduce GC pressure early on. Recommended: 25% of allocated server RAM.',
                            )}
                        />
                    </label>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                        {t('memory.xms.suggested', 'Suggested: {value} MB (25% of container RAM)', {
                            value: suggestedXmsMb,
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        id={xmsId}
                        type="number"
                        min={MIN_HEAP_MB}
                        max={xmsMax}
                        step={64}
                        value={xmsMb}
                        onChange={handleXmsChange}
                        disabled={disabled}
                        className={inputClass}
                    />
                    <span className="text-xs text-[var(--color-ink-faint)]">{t('memory.unit', 'MB')}</span>
                </div>
            </div>

            {/* Xmx */}
            <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-2">
                <div>
                    <label htmlFor={xmxId} className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-ink)]">
                        {t('memory.xmx.label', 'Xmx — Maximum Heap')}
                        <InfoBadge
                            text={t(
                                'memory.xmx.tooltip',
                                'The maximum heap size the JVM may use. It is capped below the container memory limit so the JVM has room for metaspace, thread stacks and direct buffers — a heap sized to the whole allocation starts and then dies under load. Recommended: 85% of allocated server RAM.',
                            )}
                        />
                    </label>
                    <p className="text-xs text-[var(--color-ink-faint)]">
                        {t('memory.xmx.suggested', 'Suggested: {value} MB (85% of container RAM)', {
                            value: suggestedXmxMb,
                        })}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        id={xmxId}
                        type="number"
                        min={MIN_HEAP_MB}
                        max={xmxMax}
                        step={64}
                        value={xmxMb}
                        onChange={handleXmxChange}
                        disabled={disabled}
                        className={inputClass}
                    />
                    <span className="text-xs text-[var(--color-ink-faint)]">{t('memory.unit', 'MB')}</span>
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
        navigator.clipboard?.writeText(displayText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="min-w-0 flex-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
                    {t('command.lastSaved', 'Last saved command')}
                </p>
                <pre className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-[var(--color-ink-muted)]">
                    {displayText || '—'}
                </pre>
            </div>
            <button
                type="button"
                onClick={handleCopy}
                disabled={!displayText}
                aria-live="polite"
                aria-label={
                    copied
                        ? t('command.copiedAria', 'Copied to clipboard')
                        : t('command.copyAria', 'Copy command to clipboard')
                }
                className={[
                    'flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    copied
                        ? 'border-[var(--color-accent)] bg-[var(--color-surface-2)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                ].join(' ')}
            >
                {copied ? t('command.copied', '✓ Copied') : t('command.copy', 'Copy')}
            </button>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MinecraftStartupEditorPage() {
    // The SDK hands a package its server plus the viewer's permissions on it.
    // Hiding a control is not authorization — the FormRequest behind each call
    // is — so this only avoids showing controls that would 403.
    const { server, can } = useExtensionServerContext();
    const uuid = server.uuid;

    const canStartupRead = can('startup.read');
    const canStartupUpdate = can('startup.update');

    const [data, setData] = useState<StartupEditorData | null>(null);
    const [saving, setSaving] = useState(false);

    // The allocation reported by the API, which is the same number the save
    // request validates against. 0 means the server is unlimited.
    const serverMemoryMb = data?.memoryMb ?? 0;
    const budgetMb = heapBudgetMb(serverMemoryMb);

    // Suggested Xms = 25%, Xmx = 85% of the allocation, each held inside the
    // budget; safe defaults until the allocation is known.
    const suggestedXmsMb =
        serverMemoryMb > 0 ? Math.min(budgetMb, Math.max(MIN_HEAP_MB, Math.round(serverMemoryMb * 0.25))) : 256;
    const suggestedXmxMb =
        serverMemoryMb > 0 ? Math.min(budgetMb, Math.max(128, Math.round(serverMemoryMb * 0.85))) : 1024;

    // Java version tier — controls GC recommendations and flag generation
    const [javaVersionTier, setJavaVersionTier] = useState<JavaVersionTier>(DEFAULT_JAVA_TIER);
    // GC selection state (null = no GC / JVM defaults)
    const [selectedGc, setSelectedGc] = useState<GcOptionId | null>(DEFAULT_GC);
    // Non-GC, non-core toggle state
    const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_ENABLED_OPTION_IDS));
    // Memory state — initialised to calculated suggestions
    const [xmsMb, setXmsMb] = useState(() => suggestedXmsMb);
    const [xmxMb, setXmxMb] = useState(() => suggestedXmxMb);
    // Active preset indicator
    const [activePreset, setActivePreset] = useState<string | null>(null);
    // UI mode: basic hides non-recommended options
    const [advancedMode, setAdvancedMode] = useState(false);
    // Collapsed section IDs
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set<string>());

    // Load the current startup configuration and seed the editor state from it.
    // The key is namespaced by extension and version, so an upgrade never
    // serves a previous release's cached shape; the signal cancels the request
    // when the page unmounts.
    const queryKey = useExtensionQueryKey('minecraft_startup_editor', VERSION, 'state', uuid);
    const {
        data: loaded,
        isLoading,
        isError,
    } = useQuery({
        queryKey,
        queryFn: ({ signal }) => getStartupEditorData(uuid, signal),
        enabled: canStartupRead,
    });

    useEffect(() => {
        if (!loaded) return;
        setData(loaded);

        // Both branches clamp to the allocation. A command saved before the
        // server was resized down would otherwise seed the editor with a heap
        // the save endpoint now refuses, and the first Apply would 422 on a
        // value the user never typed.
        const budget = heapBudgetMb(loaded.memoryMb);
        const clamp = (value: number, ceiling: number) =>
            budget > 0 ? Math.min(value, budget, ceiling) : Math.min(value, ceiling);

        if (!loaded.isUsingEggDefault && loaded.rawStartup) {
            const {
                gcId,
                selectedIds,
                xmsMb: inferredXms,
                xmxMb: inferredXmx,
                javaVersionTier: inferredTier,
            } = inferStateFromCommand(loaded.rawStartup);
            setSelectedGc(gcId);
            setSelected(new Set(selectedIds));
            setXmsMb(clamp(inferredXms, MAX_XMS_MB));
            setJavaVersionTier(inferredTier);
            // If the saved command has an explicit -Xmx, restore it; otherwise keep the suggested value
            if (inferredXmx > 0) setXmxMb(clamp(inferredXmx, MAX_XMX_MB));

            return;
        }

        // On the egg default there is nothing to infer, so start from what the
        // allocation suggests rather than the pre-load placeholder.
        if (loaded.memoryMb > 0) {
            setXmsMb(clamp(Math.max(MIN_HEAP_MB, Math.round(loaded.memoryMb * 0.25)), MAX_XMS_MB));
            setXmxMb(clamp(Math.max(128, Math.round(loaded.memoryMb * 0.85)), MAX_XMX_MB));
        }
    }, [loaded]);

    // Resolved loader: from server response or inferred from egg name
    const detectedLoader = data?.detectedLoader ?? (data?.eggName ? detectLoaderFromEggName(data.eggName) : null);

    const title = (
        <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">
                {t('page.title', 'Minecraft Startup Editor')}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {t('page.subtitle', 'Build a tuned JVM startup command from curated, validated flags.')}
            </p>
        </div>
    );

    if (!canStartupRead) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                    <p className="text-sm text-[var(--color-ink)]">
                        {t('page.denied', 'You do not have permission to view the startup command.')}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                        {t('page.deniedPermission', 'Required permission: {permission}', {
                            permission: 'startup.read',
                        })}
                    </p>
                </div>
            </div>
        );
    }

    // ── Section collapse helper ───────────────────────────────────────────

    const toggleSection = (id: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // ── Java tier change ──────────────────────────────────────────────────

    const handleTierChange = (newTier: JavaVersionTier) => {
        setJavaVersionTier(newTier);
        setActivePreset(null);
        // If the current GC is incompatible with the new tier, switch to the best option for the tier
        if (selectedGc) {
            const gcOption = MINECRAFT_OPTIONS.find(o => o.id === selectedGc);
            if (gcOption && gcOption.minJava > TIER_MAX_JAVA[newTier]) {
                setSelectedGc(getDefaultGcForTier(newTier));
            }
        }
        // native_access is recommended for Java 21+ and always-on for Java 25+
        if (newTier === 'java21_24' || newTier === 'java25plus') {
            setSelected(prev => new Set([...prev, 'native_access']));
        }
    };

    // ── Option toggle helpers ─────────────────────────────────────────────

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
        setSelectedGc(preset.gcId);
        setSelected(new Set(preset.optionIds));
        // Ensure the tier is compatible with the preset's GC requirement
        if (preset.gcId === 'zgc' && (javaVersionTier === 'java8_16' || javaVersionTier === 'java17_20')) {
            setJavaVersionTier('java21_24');
        }
        // Reset memory to the values calculated from server RAM
        setXmsMb(suggestedXmsMb);
        setXmxMb(suggestedXmxMb);
    };

    const isIncompatible = (option: MinecraftOption): boolean => {
        if (option.incompatibleWith.some(id => selected.has(id))) return true;
        if (selectedGc && option.incompatibleWith.includes(selectedGc)) return true;
        return false;
    };

    const isUnavailable = (option: MinecraftOption): boolean => !isCompatibleWithLoader(option, detectedLoader);

    // ── Build payload ─────────────────────────────────────────────────────

    const buildSelectedOptions = (): string[] => {
        const ids: string[] = getAlwaysIncludedForContext(javaVersionTier, selectedGc);
        // Translate ZGC to the Java-25+ variant when appropriate
        if (selectedGc) {
            if (selectedGc === 'zgc' && javaVersionTier === 'java25plus') {
                ids.push('zgc_java25');
            } else {
                ids.push(selectedGc);
            }
        }
        // Add user-selected options; skip native_access if already forced in by Java 25+
        for (const id of selected) {
            if (id === 'native_access' && javaVersionTier === 'java25plus') continue;
            ids.push(id);
        }
        return ids;
    };

    // ── Save / reset ──────────────────────────────────────────────────────

    const handleSave = async () => {
        setSaving(true);
        try {
            const result = await saveStartupOptions(uuid, buildSelectedOptions(), xmsMb, xmxMb);
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
            notify('success', t('toast.saved', 'Startup configuration saved.'));
        } catch (err) {
            notify(
                'error',
                extensionErrorMessage(err, t('toast.saveFailed', 'Could not save the startup configuration.')),
            );
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setSaving(true);
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
            setJavaVersionTier(DEFAULT_JAVA_TIER);
            setSelectedGc(DEFAULT_GC);
            setSelected(new Set(DEFAULT_ENABLED_OPTION_IDS));
            setXmsMb(suggestedXmsMb);
            setXmxMb(suggestedXmxMb);
            setActivePreset(null);
            notify('success', t('toast.reset', 'Reset to egg default.'));
        } catch (err) {
            notify(
                'error',
                extensionErrorMessage(err, t('toast.resetFailed', 'Could not reset the startup command.')),
            );
        } finally {
            setSaving(false);
        }
    };

    // ── Visibility helpers ────────────────────────────────────────────────

    /** In basic mode, only recommended (or alwaysEnabled) options are visible. */
    const filterByMode = (opts: MinecraftOption[]) =>
        advancedMode ? opts : opts.filter(o => o.recommended || o.alwaysEnabled);

    const tierMaxJava = TIER_MAX_JAVA[javaVersionTier];

    // Filter GC options to those compatible with the current tier;
    // in advanced mode show all but disable incompatible ones
    const allGcOptions = MINECRAFT_OPTIONS.filter(o => (GC_OPTION_IDS as readonly string[]).includes(o.id));
    const gcOptions = advancedMode ? allGcOptions : allGcOptions.filter(o => o.minJava <= tierMaxJava);
    const visibleGcOptions = gcOptions;

    /** Always-on Core JVM Performance Toggle items (server category).
     *  ParallelRefProcEnabled is hidden when ZGC is active (it's G1GC-specific). */
    const coreToggleOptions = optionsByCategory('server').filter(
        o => o.alwaysEnabled && !(o.id === 'parallel_ref_proc_enabled' && selectedGc === 'zgc'),
    );

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col gap-4">
            {title}

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner className="h-7 w-7" />
                </div>
            ) : isError ? (
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                    <p className="text-sm text-[var(--color-ink)]">
                        {t('page.loadFailed', 'Could not load the startup configuration.')}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* ── Header ── */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span aria-hidden>⛏️</span>
                            <h2 className="text-base font-bold text-[var(--color-ink)]">
                                {t('page.title', 'Minecraft Startup Editor')}
                            </h2>
                            {data?.isUsingEggDefault ? (
                                <span className={BADGE_ACCENT}>{t('badge.eggDefault', 'Egg default')}</span>
                            ) : (
                                <span className={BADGE_WARNING}>{t('badge.customOverride', 'Custom override')}</span>
                            )}
                            <LoaderBadge loader={detectedLoader} />
                            {data?.eggName && <span className="text-xs text-[var(--color-ink-faint)]">{data.eggName}</span>}
                        </div>
                        <button
                            type="button"
                            onClick={() => setAdvancedMode(m => !m)}
                            className={[
                                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                advancedMode
                                    ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-bright)]'
                                    : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                            ].join(' ')}
                        >
                            {advancedMode ? t('mode.advanced', '⚙ Advanced') : t('mode.basic', '✦ Basic')}
                        </button>
                    </div>

                    {/* ── Two-column layout ── */}
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                        {/* ── Left: Presets ── */}
                        <aside className="lg:w-52 lg:flex-shrink-0">
                            <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-3">
                                <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
                                    {t('section.presets', 'Presets')}
                                </h3>
                                <div className="space-y-0.5">
                                    {PRESETS.map(preset => (
                                        <PresetCard
                                            key={preset.id}
                                            preset={preset}
                                            active={activePreset === preset.id}
                                            onApply={applyPreset}
                                        />
                                    ))}
                                </div>
                                <p className="mt-2 px-1 text-[10px] leading-relaxed text-[var(--color-ink-faint)]">
                                    {t('presets.hint', 'Selecting a preset replaces your current selection.')}
                                </p>
                            </div>
                        </aside>

                        {/* ── Right: Configuration sections ── */}
                        <div className="flex-1 space-y-3">
                            {/* Memory */}
                            <CollapsibleSection
                                id="memory"
                                title={t('section.memory', '💾 Memory Configuration')}
                                collapsed={collapsedSections.has('memory')}
                                onToggle={toggleSection}
                            >
                                <MemorySection
                                    xmsMb={xmsMb}
                                    xmxMb={xmxMb}
                                    suggestedXmsMb={suggestedXmsMb}
                                    suggestedXmxMb={suggestedXmxMb}
                                    memoryMb={serverMemoryMb}
                                    onXmsChange={setXmsMb}
                                    onXmxChange={setXmxMb}
                                    disabled={!canStartupUpdate || saving}
                                />
                            </CollapsibleSection>

                            {/* Garbage Collector */}
                            <CollapsibleSection
                                id="gc"
                                title={t('section.gc', '🗑️ Garbage Collector')}
                                collapsed={collapsedSections.has('gc')}
                                onToggle={toggleSection}
                                badge={
                                    advancedMode && allGcOptions.length > gcOptions.length
                                        ? t('badge.hiddenByTier', '+{count} hidden by tier', {
                                              count: allGcOptions.length - gcOptions.length,
                                          })
                                        : undefined
                                }
                            >
                                {/* Java version tier selector */}
                                <div className="mb-3 flex items-center gap-2">
                                    <label className="text-xs font-medium text-[var(--color-ink-muted)]">
                                        {t('gc.javaVersion', 'Java version:')}
                                    </label>
                                    <select
                                        value={javaVersionTier}
                                        onChange={e => handleTierChange(e.target.value as JavaVersionTier)}
                                        disabled={!canStartupUpdate || saving}
                                        className={[
                                            'rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-ink)]',
                                            'focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]',
                                            'disabled:cursor-not-allowed disabled:opacity-50',
                                        ].join(' ')}
                                        aria-label={t('gc.javaVersionAria', 'Java version tier')}
                                    >
                                        {(Object.keys(JAVA_VERSION_TIER_LABELS) as JavaVersionTier[]).map(tier => (
                                            <option key={tier} value={tier}>
                                                {t(`javaTier.${tier}`, JAVA_VERSION_TIER_LABELS[tier])}
                                            </option>
                                        ))}
                                    </select>
                                    {javaVersionTier === 'java25plus' && (
                                        <span className={BADGE_BRAND}>
                                            {t('badge.modernMinecraft', 'Minecraft 26.1+')}
                                        </span>
                                    )}
                                </div>
                                <div
                                    role="radiogroup"
                                    aria-label={t('section.gc', '🗑️ Garbage Collector')}
                                    className="space-y-1.5"
                                >
                                    {visibleGcOptions.map(option => (
                                        <GcCard
                                            key={option.id}
                                            option={option}
                                            selected={selectedGc === option.id}
                                            onSelect={id => {
                                                setSelectedGc(id);
                                                setActivePreset(null);
                                            }}
                                            disabled={!canStartupUpdate || saving || (advancedMode && option.minJava > tierMaxJava)}
                                            recommended={isGcRecommendedForTier(option.id, javaVersionTier)}
                                            legacy={isGcLegacyForTier(option.id, javaVersionTier)}
                                        />
                                    ))}
                                    {advancedMode && (
                                        <GcNoneCard
                                            selected={selectedGc === null}
                                            onSelect={() => {
                                                setSelectedGc(null);
                                                setActivePreset(null);
                                            }}
                                            disabled={!canStartupUpdate || saving}
                                        />
                                    )}
                                </div>
                            </CollapsibleSection>

                            {/* Core JVM Performance Toggles */}
                            <CollapsibleSection
                                id="core-toggles"
                                title={t('category.server', CATEGORY_LABELS['server'])}
                                collapsed={collapsedSections.has('core-toggles')}
                                onToggle={toggleSection}
                            >
                                <p className="mb-2 text-xs text-[var(--color-ink-faint)]">
                                    {t('core.hint', 'Always included. Required for container compatibility.')}
                                    {selectedGc === 'zgc' && (
                                        <span className="ml-1">
                                            {t(
                                                'core.zgcHint',
                                                'ParallelRefProcEnabled is hidden — not applicable under ZGC.',
                                            )}
                                        </span>
                                    )}
                                </p>
                                <div className="space-y-1.5">
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
                                        title={t(`category.${category}`, CATEGORY_LABELS[category])}
                                        collapsed={collapsedSections.has(category)}
                                        onToggle={toggleSection}
                                        badge={
                                            hiddenCount > 0
                                                ? t('badge.hiddenInAdvanced', '+{count} in Advanced', {
                                                      count: hiddenCount,
                                                  })
                                                : undefined
                                        }
                                    >
                                        <div className="space-y-1.5">
                                            {opts.map(option => {
                                                const isNativeAccessAlwaysOn =
                                                    option.id === 'native_access' && javaVersionTier === 'java25plus';
                                                return (
                                                    <OptionRow
                                                        key={option.id}
                                                        option={option}
                                                        checked={selected.has(option.id)}
                                                        disabled={!canStartupUpdate || saving || isUnavailable(option)}
                                                        incompatible={
                                                            !isNativeAccessAlwaysOn &&
                                                            canStartupUpdate &&
                                                            !selected.has(option.id) &&
                                                            isIncompatible(option)
                                                        }
                                                        onToggle={toggleOption}
                                                        alwaysOn={isNativeAccessAlwaysOn}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </CollapsibleSection>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Sticky bottom bar ── */}
                    <div className="sticky bottom-0 z-20 -mx-1 mt-4 rounded-t-[var(--radius-card)] border-t border-[var(--color-border-strong)] bg-[var(--color-canvas)] px-4 py-3 shadow-2xl">
                        <div className="flex items-center gap-3">
                            <CommandPreview command={data?.renderedCommand} raw={data?.rawStartup ?? undefined} />
                            <div className="flex flex-shrink-0 items-center gap-2">
                                {!canStartupUpdate && (
                                    <p className="text-xs text-[var(--color-ink-faint)]">
                                        {t('footer.requires', 'Requires {permission}', {
                                            permission: 'startup.update',
                                        })}
                                    </p>
                                )}
                                <Button disabled={!canStartupUpdate || saving} onClick={handleSave}>
                                    {saving ? t('action.saving', 'Saving…') : t('action.apply', 'Apply')}
                                </Button>
                                <Button
                                    variant="outline"
                                    disabled={!canStartupUpdate || saving || (data?.isUsingEggDefault ?? true)}
                                    onClick={handleReset}
                                >
                                    {t('action.reset', 'Reset')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
