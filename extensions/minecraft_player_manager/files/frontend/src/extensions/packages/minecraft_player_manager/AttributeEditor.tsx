import { useState, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    ChevronDown,
    ChevronRight,
    Search,
    Plus,
    Minus,
    RotateCcw,
    AlertTriangle,
    Heart,
    Footprints,
    Cog,
    Move,
    Shield,
    Swords,
    X,
    type LucideProps,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { useFlashes } from '@/state/flashes';
import {
    getServerVersion,
    getAttributes,
    setAttribute,
    resetAttribute,
    type ServerVersion,
    type AttributeCategory,
    type AttributeInfo,
} from './api';

// Chrome uses theme CSS vars; strings are literal English.

type IconType = ComponentType<LucideProps>;

// Persist collapsed categories across sessions.
const STORAGE_KEY = 'playerManager:collapsedCategories';

const getPersistedCollapsed = (): string[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
};

const setPersistedCollapsed = (categories: string[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
    } catch {
        // Ignore storage errors
    }
};

const getCategoryIcon = (category: string): IconType => {
    const lower = category.toLowerCase();
    if (lower.includes('health') || lower.includes('defense')) return Heart;
    if (lower.includes('combat')) return Swords;
    if (lower.includes('movement')) return Footprints;
    if (lower.includes('reach')) return Move;
    if (lower.includes('physics')) return Cog;
    return Shield;
};

interface AttributeRowProps {
    attribute: AttributeInfo;
    serverUuid: string;
    playerName: string;
    disabled: boolean;
}

function AttributeRow({ attribute, serverUuid, playerName, disabled }: AttributeRowProps) {
    const [value, setValue] = useState(attribute.default);
    const [loading, setLoading] = useState(false);
    const push = useFlashes(s => s.push);

    const handleSetValue = async (newValue: number) => {
        if (disabled) return;
        const clampedValue = Math.max(attribute.min, Math.min(attribute.max, newValue));
        setValue(clampedValue);
        setLoading(true);
        try {
            const response = await setAttribute(serverUuid, playerName, attribute.id, clampedValue);
            if (!response.success) throw new Error(response.error);
            push({ type: 'success', message: `Set ${attribute.name} to ${clampedValue}` });
        } catch {
            push({ type: 'error', message: `Could not set ${attribute.name}` });
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        if (disabled) return;
        setLoading(true);
        try {
            const response = await resetAttribute(serverUuid, playerName, attribute.id);
            if (!response.success) throw new Error(response.error);
            setValue(response.defaultValue || attribute.default);
            push({ type: 'success', message: `Reset ${attribute.name} to default` });
        } catch {
            push({ type: 'error', message: `Could not reset ${attribute.name}` });
        } finally {
            setLoading(false);
        }
    };

    const getIncrement = () => {
        const range = attribute.max - attribute.min;
        if (range <= 2) return 0.1;
        if (range <= 20) return 1;
        if (range <= 100) return 5;
        return 10;
    };

    const increment = getIncrement();

    const stepButton =
        'flex h-8 w-8 items-center justify-center rounded bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50';

    return (
        <div className="flex items-center gap-4 rounded-lg bg-[var(--color-surface)] p-3 transition-colors hover:bg-[var(--color-surface-2)]">
            <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[var(--color-ink)]">{attribute.name}</div>
                <div className="truncate text-xs text-[var(--color-ink-faint)]" title={attribute.description}>
                    {attribute.description}
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => handleSetValue(value - increment)}
                    disabled={disabled || loading || value <= attribute.min}
                    className={stepButton}
                    title={`-${increment}`}
                >
                    <Minus className="h-3.5 w-3.5" />
                </button>

                <input
                    type="number"
                    value={value}
                    onChange={e => setValue(parseFloat(e.target.value) || 0)}
                    onBlur={() => handleSetValue(value)}
                    onKeyDown={e => e.key === 'Enter' && handleSetValue(value)}
                    disabled={disabled || loading}
                    min={attribute.min}
                    max={attribute.max}
                    step={increment}
                    className="w-20 rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 py-1 text-center text-sm text-[var(--color-ink)] focus:border-[var(--brand)] focus:outline-none disabled:opacity-50"
                />

                <button
                    type="button"
                    onClick={() => handleSetValue(value + increment)}
                    disabled={disabled || loading || value >= attribute.max}
                    className={stepButton}
                    title={`+${increment}`}
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>

                <button
                    type="button"
                    onClick={handleReset}
                    disabled={disabled || loading}
                    className={stepButton}
                    title={`Reset to ${attribute.default}`}
                >
                    {loading ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
            </div>

            <div className="hidden w-24 text-right text-xs text-[var(--color-ink-faint)] sm:block">
                {attribute.min} - {attribute.max}
            </div>
        </div>
    );
}

interface CategorySectionProps {
    category: AttributeCategory;
    collapsed: boolean;
    onToggle: () => void;
    searchQuery: string;
    serverUuid: string;
    playerName: string;
    disabled: boolean;
}

function CategorySection({ category, collapsed, onToggle, searchQuery, serverUuid, playerName, disabled }: CategorySectionProps) {
    const Icon = getCategoryIcon(category.category);

    const filteredAttributes = searchQuery
        ? category.attributes.filter(
              attr =>
                  attr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  attr.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  attr.description.toLowerCase().includes(searchQuery.toLowerCase()),
          )
        : category.attributes;

    if (filteredAttributes.length === 0) return null;

    return (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between bg-[var(--color-surface-2)] px-4 py-3 transition-colors hover:bg-[var(--color-border-strong)]"
            >
                <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-[var(--brand)]" />
                    <span className="font-semibold text-[var(--color-ink)]">{category.category}</span>
                    <span className="rounded bg-[var(--color-canvas)] px-2 py-0.5 text-xs text-[var(--color-ink-faint)]">
                        {filteredAttributes.length}
                    </span>
                </div>
                {collapsed ? (
                    <ChevronRight className="h-4 w-4 text-[var(--color-ink-muted)]" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--color-ink-muted)]" />
                )}
            </button>

            {!collapsed && (
                <div className="space-y-2 p-2">
                    {filteredAttributes.map(attr => (
                        <AttributeRow
                            key={attr.id}
                            attribute={attr}
                            serverUuid={serverUuid}
                            playerName={playerName}
                            disabled={disabled}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

interface AttributeEditorProps {
    onClose: () => void;
    onBack?: () => void;
    serverUuid: string;
    playerName: string;
    isOnline: boolean;
    canManage: boolean;
}

export default function AttributeEditor({ onClose, onBack, serverUuid, playerName, isOnline, canManage }: AttributeEditorProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState<string[]>(getPersistedCollapsed);

    const { data, isLoading, error } = useQuery({
        queryKey: ['ext', 'minecraft_player_manager', serverUuid, 'attributes', playerName],
        queryFn: async (): Promise<{ version: ServerVersion; categories: AttributeCategory[] }> => {
            const versionResponse = await getServerVersion(serverUuid);
            if (!versionResponse.success || !versionResponse.version) {
                throw new Error(versionResponse.error || 'Failed to detect server version');
            }
            if (!versionResponse.version.supportsAttributes) {
                throw new Error(
                    `Attributes require Minecraft 1.16 or higher. Detected version: ${versionResponse.version.raw}`,
                );
            }
            const attributesResponse = await getAttributes(serverUuid);
            if (!attributesResponse.success || !attributesResponse.attributes) {
                throw new Error(attributesResponse.error || 'Failed to load attributes');
            }
            return { version: versionResponse.version, categories: attributesResponse.attributes };
        },
    });

    const version = data?.version ?? null;
    const categories = data?.categories ?? [];

    const toggleCategory = (categoryName: string) => {
        setCollapsedCategories(prev => {
            const next = prev.includes(categoryName)
                ? prev.filter(c => c !== categoryName)
                : [...prev, categoryName];
            setPersistedCollapsed(next);
            return next;
        });
    };

    const matchesSearch = (cat: AttributeCategory) =>
        cat.attributes.some(
            attr =>
                attr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                attr.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                attr.description.toLowerCase().includes(searchQuery.toLowerCase()),
        );

    const visibleCategories = searchQuery ? categories.filter(matchesSearch) : categories;

    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            title="Attribute Editor"
            description={`Editing ${playerName}${version ? ` · ${version.raw}` : ''}`}
            footer={
                onBack && (
                    <Button
                        variant="ghost"
                        onClick={() => {
                            onClose();
                            onBack();
                        }}
                    >
                        Back
                    </Button>
                )
            }
        >
            {!isOnline && (
                <div className="mb-4 rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-warning)]">
                    This player is offline. Attribute changes are unavailable until they are online.
                </div>
            )}
            {!canManage && (
                <div className="mb-4 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-ink-muted)]">
                    You have read-only access. Attribute changes are disabled.
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner className="h-7 w-7" />
                </div>
            ) : error ? (
                <div className="py-8 text-center">
                    <AlertTriangle className="mx-auto mb-4 h-9 w-9 text-[var(--color-warning)]" />
                    <p className="text-[var(--color-danger)]">
                        {error instanceof Error ? error.message : 'Failed to load attribute editor'}
                    </p>
                </div>
            ) : (
                <>
                    {/* Search */}
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                        <input
                            type="text"
                            placeholder="Search attributes..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-2 pl-10 pr-10 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--brand)] focus:outline-none"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    {/* Collapse / expand all */}
                    <div className="mb-4 flex gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                const all = categories.map(c => c.category);
                                setCollapsedCategories(all);
                                setPersistedCollapsed(all);
                            }}
                            className="text-xs text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                        >
                            Collapse All
                        </button>
                        <span className="text-[var(--color-ink-faint)]">|</span>
                        <button
                            type="button"
                            onClick={() => {
                                setCollapsedCategories([]);
                                setPersistedCollapsed([]);
                            }}
                            className="text-xs text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                        >
                            Expand All
                        </button>
                    </div>

                    {/* Categories */}
                    <div className="space-y-3">
                        {visibleCategories.length === 0 ? (
                            <div className="py-8 text-center text-[var(--color-ink-faint)]">
                                No attributes match your search
                            </div>
                        ) : (
                            visibleCategories.map(category => (
                                <CategorySection
                                    key={category.category}
                                    category={category}
                                    collapsed={collapsedCategories.includes(category.category)}
                                    onToggle={() => toggleCategory(category.category)}
                                    searchQuery={searchQuery}
                                    serverUuid={serverUuid}
                                    playerName={playerName}
                                    disabled={!isOnline || !canManage}
                                />
                            ))
                        )}
                    </div>
                </>
            )}
        </Modal>
    );
}
