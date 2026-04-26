import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ReactNode, ChangeEvent } from 'react';
import { ServerContext } from '@/state/server';
import PageContentBlock from '@/elements/PageContentBlock';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import Spinner from '@/elements/Spinner';
import { usePermissions } from '@/plugins/usePermissions';
import { getPropertyEditorData, saveProperties } from './api';
import {
    FIELD_DEFS,
    SECTIONS,
    SECTION_LABELS,
    BIOME_PRESETS,
    fieldsBySection,
    isFieldAvailable,
    validateAll,
    buildDefaultProperties,
    getRecommendations,
    type FieldDef,
    type SectionId,
    type ServerType,
    type ValidationResult,
    type RecommendedSetting,
} from './serverProperties';

const FLASH_KEY = 'server:extensions:minecraft_property_editor';
const MC_VERSIONS = ['1.16', '1.17', '1.18', '1.19', '1.19.1', '1.20', '1.20.4', '1.21', '1.21.4'];
const SERVER_TYPES: ServerType[] = ['vanilla', 'spigot', 'paper', 'fabric', 'forge', 'neoforge'];

// ─── Tooltip ──────────────────────────────────────────────────────────────────

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

function InfoBadge({ text }: { text: string }) {
    return (
        <Tooltip text={text}>
            <span className={'cursor-help rounded-full border border-zinc-600 bg-zinc-800 px-1.5 py-px text-[10px] font-medium text-zinc-400 hover:border-zinc-500 hover:text-zinc-300'}>
                ?
            </span>
        </Tooltip>
    );
}

// ─── Collapsible (used only for Recommendations banner) ───────────────────────

function Collapsible({
    id,
    title,
    badge,
    children,
    collapsed,
    onToggle,
}: {
    id: string;
    title: string;
    badge?: string;
    children: ReactNode;
    collapsed: boolean;
    onToggle: (id: string) => void;
}) {
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

// ─── TabBar ───────────────────────────────────────────────────────────────────

interface TabDef {
    id: string;
    label: string;
    disabled?: boolean;
    soon?: boolean;
}

function TabBar({
    tabs,
    activeTab,
    onSelect,
}: {
    tabs: TabDef[];
    activeTab: string;
    onSelect: (id: string) => void;
}) {
    return (
        <div className={'overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-800'}>
            <div className={'flex min-w-max items-stretch'}>
                {tabs.map((tab, i) => {
                    const isActive = !tab.disabled && tab.id === activeTab;
                    return (
                        <button
                            key={tab.id}
                            type={'button'}
                            disabled={tab.disabled}
                            onClick={() => !tab.disabled && onSelect(tab.id)}
                            className={[
                                'relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-xs font-medium transition-colors',
                                i > 0 ? 'border-l border-zinc-700' : '',
                                isActive
                                    ? 'bg-zinc-700 text-white'
                                    : tab.disabled
                                        ? 'cursor-not-allowed text-zinc-600'
                                        : 'text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200',
                            ].join(' ')}
                        >
                            {isActive && (
                                <span className={'absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500'} />
                            )}
                            {tab.label}
                            {tab.soon && (
                                <span className={'rounded-full border border-zinc-600 bg-zinc-700 px-1 py-px text-[9px] text-zinc-500'}>
                                    Soon
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean }) {
    return (
        <button
            type={'button'}
            role={'switch'}
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={[
                'relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                checked ? 'bg-blue-600' : 'bg-zinc-600',
                disabled ? 'cursor-not-allowed opacity-50' : '',
            ].join(' ')}
        >
            <span
                className={[
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200',
                    checked ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')}
            />
        </button>
    );
}

// ─── FieldRow ─────────────────────────────────────────────────────────────────

interface FieldRowProps {
    field: FieldDef;
    value: string;
    onChange: (key: string, value: string) => void;
    disabled: boolean;
    mcVersion: string | null;
    errors: ValidationResult[];
}

function FieldRow({ field, value, onChange, disabled, mcVersion, errors }: FieldRowProps) {
    const [showPassword, setShowPassword] = useState(false);
    const availability = isFieldAvailable(field, mcVersion);
    const fieldErrors = errors.filter(e => e.field === field.key);

    const inputClass = [
        'rounded-lg border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-sm text-white',
        'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
    ].join(' ');

    const renderInput = () => {
        if (field.type === 'boolean') {
            return (
                <Toggle
                    checked={value === 'true'}
                    onChange={v => onChange(field.key, v ? 'true' : 'false')}
                    disabled={disabled}
                />
            );
        }

        if (field.type === 'select' && field.options) {
            return (
                <select
                    value={value}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(field.key, e.target.value)}
                    disabled={disabled}
                    className={inputClass}
                >
                    {field.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            );
        }

        if (field.type === 'integer' || field.type === 'port') {
            return (
                <input
                    type={'number'}
                    value={value}
                    min={field.min}
                    max={field.max}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(field.key, e.target.value)}
                    disabled={disabled}
                    className={inputClass + ' w-32 text-right'}
                />
            );
        }

        if (field.type === 'password') {
            return (
                <div className={'flex items-center gap-1'}>
                    <input
                        type={showPassword ? 'text' : 'password'}
                        value={value}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(field.key, e.target.value)}
                        disabled={disabled}
                        className={inputClass + ' w-48'}
                    />
                    <button
                        type={'button'}
                        onClick={() => setShowPassword(s => !s)}
                        className={'rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-400 hover:text-white'}
                    >
                        {showPassword ? 'Hide' : 'Show'}
                    </button>
                </div>
            );
        }

        if (field.type === 'textarea') {
            return (
                <textarea
                    value={value}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(field.key, e.target.value)}
                    disabled={disabled}
                    rows={3}
                    className={inputClass + ' w-full font-mono text-xs'}
                />
            );
        }

        if (field.key === 'level-seed') {
            return (
                <div className={'flex items-center gap-1'}>
                    <input
                        type={'text'}
                        value={value}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(field.key, e.target.value)}
                        disabled={disabled}
                        placeholder={'Leave blank for random'}
                        className={inputClass + ' w-40'}
                    />
                    <button
                        type={'button'}
                        disabled={disabled}
                        onClick={() => onChange(field.key, String(Math.floor(Math.random() * 2000000000) - 1000000000))}
                        className={'rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'}
                        title={'Generate random seed'}
                    >
                        🎲 Random
                    </button>
                </div>
            );
        }

        if (field.key === 'motd') {
            const charCount = value.length;
            const overLimit = charCount > 59;
            return (
                <div className={'flex flex-col gap-1'}>
                    <input
                        type={'text'}
                        value={value}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(field.key, e.target.value)}
                        disabled={disabled}
                        className={inputClass + ' w-full'}
                    />
                    <span className={`text-[10px] ${overLimit ? 'text-yellow-400' : 'text-zinc-500'}`}>
                        {charCount}/59 chars{overLimit ? ' — some clients may truncate' : ''}
                    </span>
                </div>
            );
        }

        return (
            <input
                type={'text'}
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(field.key, e.target.value)}
                disabled={disabled}
                className={inputClass + ' w-48'}
            />
        );
    };

    return (
        <div className={`flex flex-col gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 ${availability !== 'available' ? 'opacity-60' : ''}`}>
            <div className={'flex items-center justify-between gap-3'}>
                <div className={'flex min-w-0 flex-1 items-center gap-1.5'}>
                    <span className={'text-sm font-medium text-white'}>{field.label}</span>
                    <InfoBadge text={field.description} />
                    {availability === 'not_yet' && mcVersion && (
                        <span className={'rounded-full border border-yellow-700 bg-yellow-900/40 px-1.5 py-px text-[10px] font-medium text-yellow-300'}>
                            Not available in MC {mcVersion}
                        </span>
                    )}
                    {availability === 'removed' && mcVersion && (
                        <span className={'rounded-full border border-red-700 bg-red-900/40 px-1.5 py-px text-[10px] font-medium text-red-300'}>
                            Removed in MC {field.removedVersion}
                        </span>
                    )}
                </div>
                <div className={'flex-shrink-0'}>
                    {renderInput()}
                </div>
            </div>
            {fieldErrors.map((e, i) => (
                <p key={i} className={`text-xs ${e.severity === 'error' ? 'text-red-400' : e.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'}`}>
                    {e.severity === 'error' ? '✕' : e.severity === 'warning' ? '⚠' : 'ℹ'} {e.message}
                </p>
            ))}
        </div>
    );
}

// ─── BiomePresetCard ──────────────────────────────────────────────────────────

interface BiomePresetCardProps {
    preset: typeof BIOME_PRESETS[number];
    serverType: ServerType;
    onApply: (levelType: string) => void;
    active: boolean;
}

function BiomePresetCard({ preset, serverType, onApply, active }: BiomePresetCardProps) {
    const incompatible = !preset.supportedServerTypes.includes(serverType);
    return (
        <div className={[
            'rounded-lg border p-3 transition-all',
            active ? 'border-blue-600 bg-blue-900/20' : 'border-zinc-700 bg-zinc-900',
        ].join(' ')}>
            <div className={'flex items-start justify-between gap-2'}>
                <div className={'min-w-0 flex-1'}>
                    <div className={'flex flex-wrap items-center gap-1.5'}>
                        <span className={'text-sm font-medium text-white'}>{preset.name}</span>
                        {active && <span className={'text-[10px] text-blue-400'}>✓ Active</span>}
                        {incompatible && (
                            <span className={'rounded-full border border-orange-700 bg-orange-900/40 px-1.5 py-px text-[10px] font-medium text-orange-300'}>
                                Requires Fabric/Forge
                            </span>
                        )}
                    </div>
                    <p className={'mt-0.5 text-xs text-zinc-400'}>{preset.description}</p>
                    <p className={'mt-1 font-mono text-[10px] text-zinc-500'}>{preset.levelType}</p>
                    {preset.notes && <p className={'mt-0.5 text-[10px] text-zinc-500'}>{preset.notes}</p>}
                </div>
                <button
                    type={'button'}
                    onClick={() => onApply(preset.levelType)}
                    className={'flex-shrink-0 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white'}
                >
                    Apply
                </button>
            </div>
        </div>
    );
}

// ─── RecommendationCard ───────────────────────────────────────────────────────

function RecommendationCard({
    rec,
    onAccept,
    onDismiss,
}: {
    rec: RecommendedSetting;
    onAccept: (key: string, value: string) => void;
    onDismiss: (key: string) => void;
}) {
    const fieldDef = FIELD_DEFS.find(f => f.key === rec.key);
    return (
        <div className={'flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2'}>
            <div className={'min-w-0 flex-1'}>
                <p className={'text-sm font-medium text-white'}>{fieldDef?.label ?? rec.key}</p>
                <p className={'text-xs text-zinc-400'}>{rec.reason}</p>
                <p className={'mt-0.5 font-mono text-[10px] text-zinc-500'}>
                    Suggested: <span className={'text-zinc-300'}>{rec.value}</span>
                </p>
            </div>
            <div className={'flex flex-shrink-0 items-center gap-1'}>
                <button
                    type={'button'}
                    onClick={() => onAccept(rec.key, rec.value)}
                    className={'rounded border border-blue-700 bg-blue-900/40 px-2 py-1 text-xs text-blue-300 hover:bg-blue-900/70'}
                >
                    Accept
                </button>
                <button
                    type={'button'}
                    onClick={() => onDismiss(rec.key)}
                    className={'rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200'}
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default () => {
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);

    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [canFileRead]   = usePermissions('file.read');
    const [canFileUpdate] = usePermissions('file.update');

    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [fileExists, setFileExists] = useState(false);
    const [eggName, setEggName]       = useState('');

    const [properties, setProperties]           = useState<Record<string, string>>({});
    const [savedProperties, setSavedProperties] = useState<Record<string, string>>({});

    const [serverType, setServerType]     = useState<ServerType>('vanilla');
    const [mcVersion, setMcVersion]       = useState<string | null>(null);
    const [advancedMode, setAdvancedMode] = useState(false);
    const [activeTab, setActiveTab]       = useState<SectionId | 'raw'>('general');
    const [recsCollapsed, setRecsCollapsed] = useState(false);

    const [rawText, setRawText]             = useState('');
    const [rawTextDirty, setRawTextDirty]   = useState(false);

    const [dismissedRecs, setDismissedRecs] = useState<Set<string>>(new Set());

    const [customBiomePresets, setCustomBiomePresets] = useState<Array<{ name: string; levelType: string }>>([]);
    const [customPresetName, setCustomPresetName]     = useState('');
    const [customPresetLevelType, setCustomPresetLevelType] = useState('');

    // ── Derived ───────────────────────────────────────────────────────────

    const isDirty = useMemo(() => {
        const keys = new Set([...Object.keys(properties), ...Object.keys(savedProperties)]);
        for (const k of keys) {
            if ((properties[k] ?? '') !== (savedProperties[k] ?? '')) return true;
        }
        return false;
    }, [properties, savedProperties]);

    const validationErrors = useMemo(() => validateAll(properties), [properties]);

    const recommendations = useMemo(() => {
        const recs = getRecommendations(serverType, mcVersion);
        return recs.filter(r => !dismissedRecs.has(r.key));
    }, [serverType, mcVersion, dismissedRecs]);

    // When switching off advanced mode, move away from advanced/raw tabs
    useEffect(() => {
        if (!advancedMode && (activeTab === 'advanced' || activeTab === 'raw')) {
            setActiveTab('general');
        }
    }, [advancedMode]);

    // ── Load ──────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!uuid) return;
        setLoading(true);
        clearFlashes(FLASH_KEY);

        getPropertyEditorData(uuid)
            .then(data => {
                setFileExists(data.fileExists);
                setEggName(data.eggName);
                const props = data.fileExists ? data.properties : buildDefaultProperties();
                setProperties(props);
                setSavedProperties(props);
                setRawText(data.rawContent);
                if (data.detectedVersion) setMcVersion(data.detectedVersion);
                if (data.detectedServerType) setServerType(data.detectedServerType as ServerType);
            })
            .catch(error => clearAndAddHttpError({ key: FLASH_KEY, error }))
            .finally(() => setLoading(false));
    }, [uuid]);

    // ── Callbacks ─────────────────────────────────────────────────────────

    const updateField = useCallback((key: string, value: string) => {
        setProperties(prev => ({ ...prev, [key]: value }));
    }, []);

    const applyBiomePreset = useCallback((levelType: string) => {
        setProperties(prev => ({ ...prev, 'level-type': levelType }));
    }, []);

    const acceptRecommendation = useCallback((key: string, value: string) => {
        setProperties(prev => ({ ...prev, [key]: value }));
        setDismissedRecs(prev => new Set([...prev, key]));
    }, []);

    const dismissRecommendation = useCallback((key: string) => {
        setDismissedRecs(prev => new Set([...prev, key]));
    }, []);

    const applyRawText = useCallback(() => {
        const parsed: Record<string, string> = {};
        for (const line of rawText.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const pos = trimmed.indexOf('=');
            if (pos < 0) continue;
            const key = trimmed.slice(0, pos).trim();
            const val = trimmed.slice(pos + 1);
            if (key) parsed[key] = val;
        }
        setProperties(parsed);
        setRawTextDirty(false);
    }, [rawText]);

    // ── Save / Discard ────────────────────────────────────────────────────

    const handleSave = async () => {
        if (!uuid) return;
        setSaving(true);
        clearFlashes(FLASH_KEY);
        try {
            const result = await saveProperties(uuid, properties, serverType, mcVersion ?? undefined);
            setSavedProperties(result.properties);
            addFlash({ key: FLASH_KEY, type: 'success', message: 'server.properties saved.' });
        } catch (error) {
            clearAndAddHttpError({ key: FLASH_KEY, error });
        } finally {
            setSaving(false);
        }
    };

    const handleDiscard = () => {
        setProperties(savedProperties);
    };

    // ── Permission guard ──────────────────────────────────────────────────

    if (!canFileRead) {
        return (
            <PageContentBlock title={'MC Property Editor'}>
                <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-6'}>
                    <p className={'text-zinc-200'}>You do not have permission to read files.</p>
                    <p className={'mt-2 text-sm text-zinc-400'}>Required permission: <span className={'font-mono text-zinc-300'}>file.read</span></p>
                </div>
            </PageContentBlock>
        );
    }

    // ── Tab definitions ───────────────────────────────────────────────────

    const visibleSections: SectionId[] = advancedMode
        ? SECTIONS
        : SECTIONS.filter(s => s !== 'advanced');

    const tabs: TabDef[] = [
        ...visibleSections.map(s => ({ id: s, label: SECTION_LABELS[s] })),
        ...(advancedMode ? [{ id: 'raw', label: '📄 Raw' }] : []),
        { id: 'plugin_configs', label: '🔒 Plugin Configs', disabled: true, soon: true },
        { id: 'mod_configs',    label: '🔒 Mod Configs',    disabled: true, soon: true },
    ];

    // ── Tab content ───────────────────────────────────────────────────────

    const activeLevelType = properties['level-type'] ?? '';

    const renderTabContent = () => {
        if (activeTab === 'raw') {
            return (
                <div className={'space-y-3'}>
                    <p className={'text-xs text-zinc-500'}>
                        Directly edit the raw file content. Click "Apply Raw" to sync changes to the form fields.
                    </p>
                    <textarea
                        value={rawText}
                        onChange={e => { setRawText(e.target.value); setRawTextDirty(true); }}
                        rows={24}
                        spellCheck={false}
                        className={[
                            'w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2',
                            'font-mono text-xs text-zinc-200 focus:border-blue-500 focus:outline-none',
                        ].join(' ')}
                    />
                    <button
                        type={'button'}
                        disabled={!rawTextDirty}
                        onClick={applyRawText}
                        className={'rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'}
                    >
                        Apply Raw
                    </button>
                </div>
            );
        }

        const sectionId = activeTab as SectionId;
        let fields = fieldsBySection(sectionId);

        if (!advancedMode) {
            fields = fields.filter(f => !f.basicHide && !f.advanced);
        }

        return (
            <div className={'space-y-2'}>
                {fields.map(field => (
                    <FieldRow
                        key={field.key}
                        field={field}
                        value={properties[field.key] ?? field.defaultValue}
                        onChange={updateField}
                        disabled={!canFileUpdate || saving}
                        mcVersion={mcVersion}
                        errors={validationErrors.filter(e => e.field === field.key)}
                    />
                ))}

                {/* Biome Mod Presets — World tab only */}
                {sectionId === 'world' && (
                    <div className={'mt-4 rounded-lg border border-zinc-700 bg-zinc-800 p-3'}>
                        <h4 className={'mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400'}>
                            🌿 Biome Mod Presets
                        </h4>
                        {serverType === 'vanilla' && (
                            <div className={'mb-2 rounded border border-orange-700 bg-orange-900/20 px-3 py-2 text-xs text-orange-300'}>
                                ⚠ Biome mods require Fabric or Forge/NeoForge. Vanilla servers are not compatible.
                            </div>
                        )}
                        <div className={'space-y-2'}>
                            {BIOME_PRESETS.map(preset => (
                                <BiomePresetCard
                                    key={preset.id}
                                    preset={preset}
                                    serverType={serverType}
                                    onApply={applyBiomePreset}
                                    active={activeLevelType === preset.levelType}
                                />
                            ))}
                        </div>

                        {/* Custom preset */}
                        <div className={'mt-3 rounded-lg border border-zinc-700 bg-zinc-900 p-3'}>
                            <p className={'mb-2 text-xs font-medium text-zinc-400'}>Custom Biome Preset</p>
                            <div className={'flex flex-wrap items-center gap-2'}>
                                <input
                                    type={'text'}
                                    placeholder={'Preset name'}
                                    value={customPresetName}
                                    onChange={e => setCustomPresetName(e.target.value)}
                                    className={'w-32 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-white focus:outline-none'}
                                />
                                <input
                                    type={'text'}
                                    placeholder={'level-type value'}
                                    value={customPresetLevelType}
                                    onChange={e => setCustomPresetLevelType(e.target.value)}
                                    className={'w-48 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 font-mono text-xs text-white focus:outline-none'}
                                />
                                <button
                                    type={'button'}
                                    disabled={!customPresetName || !customPresetLevelType}
                                    onClick={() => {
                                        if (customPresetName && customPresetLevelType) {
                                            setCustomBiomePresets(prev => [...prev, { name: customPresetName, levelType: customPresetLevelType }]);
                                            setCustomPresetName('');
                                            setCustomPresetLevelType('');
                                        }
                                    }}
                                    className={'rounded border border-zinc-600 bg-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'}
                                >
                                    Save Preset
                                </button>
                            </div>
                            {customBiomePresets.length > 0 && (
                                <div className={'mt-2 space-y-1'}>
                                    {customBiomePresets.map((p, i) => (
                                        <div key={i} className={'flex items-center justify-between rounded border border-zinc-700 px-2 py-1'}>
                                            <span className={'text-xs text-zinc-300'}>{p.name}</span>
                                            <div className={'flex items-center gap-1'}>
                                                <span className={'font-mono text-[10px] text-zinc-500'}>{p.levelType}</span>
                                                <button
                                                    type={'button'}
                                                    onClick={() => applyBiomePreset(p.levelType)}
                                                    className={'rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:text-white'}
                                                >
                                                    Apply
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <PageContentBlock title={'MC Property Editor'}>
            <FlashMessageRender byKey={FLASH_KEY} className={'mb-4'} />

            {loading ? (
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            ) : (
                <div className={'space-y-3 pb-28'}>

                    {/* ── Header ── */}
                    <div className={'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3'}>
                        <div className={'flex flex-wrap items-center gap-2'}>
                            <span aria-hidden>{'⚙️'}</span>
                            <h2 className={'text-base font-bold text-white'}>MC Property Editor</h2>
                            {!fileExists && (
                                <span className={'rounded-full border border-orange-700 bg-orange-900/40 px-2 py-0.5 text-xs text-orange-300'}>
                                    File not found — defaults loaded
                                </span>
                            )}
                            {isDirty && (
                                <span className={'rounded-full border border-yellow-600 bg-yellow-900/40 px-2 py-0.5 text-xs text-yellow-300'}>
                                    Unsaved Changes
                                </span>
                            )}
                            {eggName && (
                                <span className={'text-xs text-zinc-500'}>{eggName}</span>
                            )}
                        </div>
                        <div className={'flex flex-wrap items-center gap-2'}>
                            {/* Server type */}
                            <select
                                value={serverType}
                                onChange={e => setServerType(e.target.value as ServerType)}
                                className={'rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none'}
                            >
                                {SERVER_TYPES.map(t => (
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                ))}
                            </select>
                            {/* MC Version */}
                            <select
                                value={mcVersion ?? ''}
                                onChange={e => setMcVersion(e.target.value || null)}
                                className={'rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 focus:outline-none'}
                            >
                                <option value={''}>Version: Auto</option>
                                {MC_VERSIONS.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                ))}
                            </select>
                            {/* Mode toggle */}
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
                    </div>

                    {/* ── Validation summary (errors only) ── */}
                    {validationErrors.filter(e => e.severity === 'error').length > 0 && (
                        <div className={'rounded-xl border border-red-800 bg-red-900/20 px-4 py-3'}>
                            <p className={'text-sm font-medium text-red-300'}>
                                {validationErrors.filter(e => e.severity === 'error').length} validation error(s) — review fields below.
                            </p>
                        </div>
                    )}

                    {/* ── Recommendations (persistent collapsible banner, above tab bar) ── */}
                    {recommendations.length > 0 && (
                        <Collapsible
                            id={'recommendations'}
                            title={'💡 Recommended Settings'}
                            badge={String(recommendations.length)}
                            collapsed={recsCollapsed}
                            onToggle={() => setRecsCollapsed(v => !v)}
                        >
                            <p className={'mb-2 text-xs text-zinc-500'}>
                                Suggestions for {serverType} servers. Accept to apply, dismiss to hide.
                            </p>
                            <div className={'space-y-2'}>
                                {recommendations.map(rec => (
                                    <RecommendationCard
                                        key={rec.key}
                                        rec={rec}
                                        onAccept={acceptRecommendation}
                                        onDismiss={dismissRecommendation}
                                    />
                                ))}
                            </div>
                        </Collapsible>
                    )}

                    {/* ── Horizontal tab bar ── */}
                    <TabBar
                        tabs={tabs}
                        activeTab={activeTab}
                        onSelect={id => setActiveTab(id as SectionId | 'raw')}
                    />

                    {/* ── Active tab content ── */}
                    <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-4'}>
                        {renderTabContent()}
                    </div>

                    {/* ── Sticky bottom bar ── */}
                    <div className={'fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-700 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur-sm'}>
                        <div className={'mx-auto flex max-w-screen-xl items-center justify-between gap-3'}>
                            <div className={'min-w-0 flex-1'}>
                                <p className={'text-xs text-zinc-500'}>
                                    {fileExists ? 'Loaded from server.properties' : 'File not found — will be created on save'}
                                </p>
                                {isDirty && (
                                    <p className={'text-xs font-medium text-yellow-400'}>● Unsaved Changes</p>
                                )}
                            </div>
                            <div className={'flex flex-shrink-0 items-center gap-2'}>
                                {!canFileUpdate && (
                                    <p className={'text-xs text-zinc-500'}>
                                        Requires <span className={'font-mono text-zinc-400'}>file.update</span>
                                    </p>
                                )}
                                <button
                                    type={'button'}
                                    disabled={!isDirty || saving}
                                    onClick={handleDiscard}
                                    className={'rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'}
                                >
                                    Discard Changes
                                </button>
                                <button
                                    type={'button'}
                                    disabled={!canFileUpdate || saving || !isDirty}
                                    onClick={handleSave}
                                    className={'rounded-lg border border-blue-700 bg-blue-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'}
                                >
                                    {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </PageContentBlock>
    );
};
