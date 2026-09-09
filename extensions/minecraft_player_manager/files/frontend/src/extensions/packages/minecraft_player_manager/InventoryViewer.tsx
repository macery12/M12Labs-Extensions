import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, MapPin, Shield, Heart, Beef, Star, Gamepad2, Boxes } from 'lucide-react';
import { Modal, Button, Spinner } from '@/extensions-sdk';
import {
    getPlayerData,
    type InventoryItem,
    type PlayerArmor,
    type PlayerLocation,
    type PlayerStats,
} from './api';

// Chrome uses theme CSS vars. Minecraft-domain colours are intentionally
// literal: enchantment purple, dimension hues, and the red/amber/green
// durability gradient are canonical game colours, not theme surfaces.

interface ItemTooltipProps {
    item: InventoryItem;
    position: { x: number; y: number };
}

// Enchantments that only have one level (don't show roman numeral)
const SINGLE_LEVEL_ENCHANTS = [
    'Mending',
    'Aqua Affinity',
    'Curse of Binding',
    'Curse of Vanishing',
    'Multishot',
    'Silk Touch',
    'Flame',
    'Infinity',
    'Channeling',
];

const formatEnchant = (name: string, levelRoman: string): string =>
    SINGLE_LEVEL_ENCHANTS.includes(name) ? name : `${name} ${levelRoman}`;

// Colour for a durability percentage — a canonical green/amber/red gradient.
const durabilityColor = (pct: number): string => (pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444');

function ItemTooltip({ item, position }: ItemTooltipProps) {
    const isContainer = item.contents && item.contents.length > 0;
    const isEnchantedBook =
        item.id === 'minecraft:enchanted_book' && item.storedEnchantments && item.storedEnchantments.length > 0;

    const formatContainerItem = (contentItem: InventoryItem): string => {
        if (
            contentItem.id === 'minecraft:enchanted_book' &&
            contentItem.storedEnchantments &&
            contentItem.storedEnchantments.length > 0
        ) {
            return contentItem.storedEnchantments.map(e => formatEnchant(e.name, e.levelRoman)).join(', ');
        }
        if (contentItem.enchantments && contentItem.enchantments.length > 0) {
            const enchantStr = contentItem.enchantments.map(e => formatEnchant(e.name, e.levelRoman)).join(', ');
            return `${contentItem.customName || contentItem.name} (${enchantStr})`;
        }
        return contentItem.customName || contentItem.name;
    };

    const groupContainerItems = (
        contents: InventoryItem[],
    ): { name: string; count: number; isEnchantedBook: boolean }[] => {
        const groups: Record<string, { count: number; isEnchantedBook: boolean }> = {};
        contents.forEach(contentItem => {
            const displayName = formatContainerItem(contentItem);
            const isBook = contentItem.id === 'minecraft:enchanted_book';
            const existing = groups[displayName];
            if (existing) {
                existing.count += contentItem.count;
            } else {
                groups[displayName] = { count: contentItem.count, isEnchantedBook: isBook };
            }
        });
        return Object.entries(groups).map(([name, dataEntry]) => ({
            name,
            count: dataEntry.count,
            isEnchantedBook: dataEntry.isEnchantedBook,
        }));
    };

    const groupedContents = isContainer ? groupContainerItems(item.contents) : [];

    return (
        <div
            className="pointer-events-none fixed z-[100] max-w-xs rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-canvas)] p-3 shadow-xl"
            style={{ left: position.x + 10, top: position.y + 10 }}
        >
            <div className="font-semibold text-[var(--color-ink)]">
                {item.customName || item.name}
                {item.count > 1 && <span className="ml-1 text-[var(--color-ink-muted)]">x{item.count}</span>}
            </div>
            <div className="text-xs text-[var(--color-ink-faint)]">{item.id}</div>

            {item.enchantments && item.enchantments.length > 0 && (
                <div className="mt-2 space-y-0.5">
                    {item.enchantments.map((ench, idx) => (
                        <div key={idx} className="text-sm text-purple-400">
                            {formatEnchant(ench.name, ench.levelRoman)}
                        </div>
                    ))}
                </div>
            )}

            {isEnchantedBook && (
                <div className="mt-2 space-y-0.5">
                    {item.storedEnchantments.map((ench, idx) => (
                        <div key={idx} className="text-sm text-purple-400">
                            {formatEnchant(ench.name, ench.levelRoman)}
                        </div>
                    ))}
                </div>
            )}

            {item.durability && (
                <div className="mt-2">
                    <div className="text-xs text-[var(--color-ink-muted)]">
                        Durability: {item.durability.current}/{item.durability.max}
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded bg-[var(--color-surface-2)]">
                        <div
                            className="h-full rounded transition-all"
                            style={{
                                width: `${item.durability.percentage}%`,
                                backgroundColor: durabilityColor(item.durability.percentage),
                            }}
                        />
                    </div>
                </div>
            )}

            {item.lore.length > 0 && (
                <div className="mt-2 space-y-0.5 border-t border-[var(--color-border)] pt-2">
                    {item.lore.map((line, idx) => (
                        <div key={idx} className="text-xs italic text-[var(--color-ink-muted)]">
                            {line}
                        </div>
                    ))}
                </div>
            )}

            {isContainer && (
                <div className="mt-2 border-t border-[var(--color-border)] pt-2">
                    <div className="mb-1 text-xs font-medium text-[var(--color-ink-muted)]">
                        Contains {item.contents.length} item{item.contents.length !== 1 ? 's' : ''}:
                    </div>
                    <div className="max-h-40 space-y-0.5 overflow-y-auto">
                        {groupedContents.slice(0, 15).map((groupedItem, idx) => (
                            <div key={idx} className="flex items-center text-xs">
                                <span className={groupedItem.isEnchantedBook ? 'text-purple-400' : 'text-[var(--color-ink-muted)]'}>
                                    {groupedItem.name}
                                </span>
                                {groupedItem.count > 1 && (
                                    <span className="ml-1 text-[var(--color-ink-faint)]">x{groupedItem.count}</span>
                                )}
                            </div>
                        ))}
                        {groupedContents.length > 15 && (
                            <div className="text-xs italic text-[var(--color-ink-faint)]">
                                ...and {groupedContents.length - 15} more types
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface InventorySlotProps {
    item: InventoryItem | null;
    slotType?: 'normal' | 'armor' | 'offhand';
    label?: string;
}

function InventorySlot({ item, slotType = 'normal', label }: InventorySlotProps) {
    const [hovered, setHovered] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [imgError, setImgError] = useState(false);
    const [fallbackLevel, setFallbackLevel] = useState(0);

    const handleMouseMove = (e: React.MouseEvent) => setTooltipPos({ x: e.clientX, y: e.clientY });

    const getItemImageUrl = (target: InventoryItem, level = 0) => {
        const [rawNamespace, rawName] = target.id.split(':');
        const namespace = (rawName ? rawNamespace : 'minecraft')?.toLowerCase() ?? 'minecraft';
        const itemName = (rawName ? rawName : rawNamespace)?.toLowerCase() ?? '';

        const moddedBaseUrls: Record<string, string> = {
            create: 'https://mc.nerothe.com/img/1.20-mods-create',
            regions_unexplored: 'https://mc.nerothe.com/img/1.21-mods-regions-unexplored',
            biomesoplenty: 'https://mc.nerothe.com/img/1.21-mods-biomes-o-plenty',
            quark: 'https://mc.nerothe.com/img/1.20-mods-quark',
        };

        if (namespace !== 'minecraft') {
            const baseUrl = moddedBaseUrls[namespace];
            return baseUrl ? `${baseUrl}/${namespace}_${itemName}.png` : '';
        }

        const sources = [
            `https://mc.nerothe.com/img/1.21.11/minecraft_${itemName}.png`,
            `https://mc.nerothe.com/img/1.21.8/minecraft_${itemName}.png`,
            `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/item/${itemName}.png`,
            `https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21/assets/minecraft/textures/block/${itemName}.png`,
        ];
        return sources[Math.min(level, sources.length - 1)];
    };

    const slotClasses = { normal: 'w-10 h-10', armor: 'w-12 h-12', offhand: 'w-12 h-12' };

    return (
        <div className="relative">
            {label && <div className="mb-1 text-center text-xs text-[var(--color-ink-faint)]">{label}</div>}
            <div
                className={`${slotClasses[slotType]} relative flex cursor-pointer items-center justify-center rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] transition-all hover:border-[var(--color-ink-faint)]`}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onMouseMove={handleMouseMove}
                style={
                    item && item.enchantments.length > 0
                        ? { boxShadow: '0 0 8px color-mix(in srgb, var(--brand) 45%, transparent)' }
                        : {}
                }
            >
                {item && item.id !== 'minecraft:air' ? (
                    <>
                        {!imgError ? (
                            <img
                                key={`${item.id}-${fallbackLevel}`}
                                src={getItemImageUrl(item, fallbackLevel)}
                                alt={item.name}
                                className="pixelated h-8 w-8 object-contain"
                                onError={() => {
                                    const isModded = !item.id.toLowerCase().startsWith('minecraft:');
                                    if (isModded) {
                                        setImgError(true);
                                        return;
                                    }
                                    if (fallbackLevel < 3) {
                                        setFallbackLevel(fallbackLevel + 1);
                                    } else {
                                        setImgError(true);
                                    }
                                }}
                            />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center text-center text-xs leading-tight text-[var(--color-ink-muted)]">
                                {item.displayId.substring(0, 3)}
                            </div>
                        )}
                        {item.count > 1 && (
                            <span className="absolute bottom-0 right-0.5 text-xs font-bold text-[var(--color-ink)] drop-shadow-lg">
                                {item.count}
                            </span>
                        )}
                        {item.durability && item.durability.percentage < 100 && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--color-canvas)]">
                                <div
                                    className="h-full"
                                    style={{
                                        width: `${item.durability.percentage}%`,
                                        backgroundColor: durabilityColor(item.durability.percentage),
                                    }}
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <div className="h-full w-full" />
                )}
            </div>
            {hovered && item && item.id !== 'minecraft:air' && <ItemTooltip item={item} position={tooltipPos} />}
        </div>
    );
}

interface InventoryGridProps {
    items: InventoryItem[];
    rows?: number;
    cols?: number;
    startSlot?: number;
}

function InventoryGrid({ items, rows = 4, cols = 9, startSlot = 0 }: InventoryGridProps) {
    const slots: (InventoryItem | null)[] = Array(rows * cols).fill(null);
    items.forEach(item => {
        const adjustedSlot = item.slot - startSlot;
        if (adjustedSlot >= 0 && adjustedSlot < slots.length) {
            slots[adjustedSlot] = item;
        }
    });

    return (
        <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 40px)` }}>
            {slots.map((item, idx) => (
                <InventorySlot key={idx} item={item} />
            ))}
        </div>
    );
}

function ArmorDisplay({ armor, offhand }: { armor: PlayerArmor; offhand: InventoryItem | null }) {
    return (
        <div className="flex flex-col items-center gap-1">
            <InventorySlot item={armor.helmet} slotType="armor" label="Helmet" />
            <InventorySlot item={armor.chestplate} slotType="armor" label="Chest" />
            <InventorySlot item={armor.leggings} slotType="armor" label="Legs" />
            <InventorySlot item={armor.boots} slotType="armor" label="Boots" />
            <div className="mt-2">
                <InventorySlot item={offhand} slotType="offhand" label="Offhand" />
            </div>
        </div>
    );
}

function LocationDisplay({ location }: { location: PlayerLocation }) {
    // Dimension hue is a Minecraft-domain colour (nether=red, end=purple, overworld=green).
    const getDimensionColor = (dim: string) => {
        if (dim.includes('nether')) return 'text-red-400';
        if (dim.includes('end')) return 'text-purple-400';
        return 'text-green-400';
    };

    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                <MapPin className="h-4 w-4 text-[var(--brand)]" />
                Location
            </h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
                {(['x', 'y', 'z'] as const).map(axis => (
                    <div key={axis}>
                        <div className="text-[var(--color-ink-faint)]">{axis.toUpperCase()}</div>
                        <div className="font-mono text-[var(--color-ink)]">{location[axis].toFixed(1)}</div>
                    </div>
                ))}
            </div>
            <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                <div className="mb-1 text-xs text-[var(--color-ink-faint)]">Dimension</div>
                <div className={`font-medium ${getDimensionColor(location.dimension)}`}>{location.world}</div>
            </div>
        </div>
    );
}

function StatsDisplay({ stats }: { stats: PlayerStats }) {
    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <h4 className="mb-3 flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                <Gamepad2 className="h-4 w-4 text-[var(--brand)]" />
                Stats
            </h4>
            <div className="space-y-3">
                {/* Health */}
                <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-[var(--color-danger)]">
                            <Heart className="h-3.5 w-3.5" /> Health
                        </span>
                        <span className="text-[var(--color-ink)]">
                            {stats.health.toFixed(1)}/{stats.maxHealth}
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-[var(--color-canvas)]">
                        <div
                            className="h-full rounded bg-[var(--color-danger)] transition-all"
                            style={{ width: `${Math.min(100, (stats.health / stats.maxHealth) * 100)}%` }}
                        />
                    </div>
                </div>

                {/* Food */}
                <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-[var(--color-warning)]">
                            <Beef className="h-3.5 w-3.5" /> Food
                        </span>
                        <span className="text-[var(--color-ink)]">{stats.food}/20</span>
                    </div>
                    <div className="h-2 rounded bg-[var(--color-canvas)]">
                        <div
                            className="h-full rounded bg-[var(--color-warning)] transition-all"
                            style={{ width: `${(stats.food / 20) * 100}%` }}
                        />
                    </div>
                </div>

                {/* XP */}
                <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1 text-[var(--color-accent)]">
                            <Star className="h-3.5 w-3.5" /> XP Level
                        </span>
                        <span className="text-[var(--color-ink)]">{stats.xpLevel}</span>
                    </div>
                    <div className="h-2 rounded bg-[var(--color-canvas)]">
                        <div
                            className="h-full rounded bg-[var(--color-accent)] transition-all"
                            style={{ width: `${stats.xpProgress}%` }}
                        />
                    </div>
                </div>

                {/* Gamemode */}
                <div className="border-t border-[var(--color-border)] pt-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--color-ink-muted)]">Gamemode</span>
                        <span className="text-[var(--color-ink)]">{stats.gamemode}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface InventoryViewerProps {
    onClose: () => void;
    onBack?: () => void;
    serverUuid: string;
    playerName: string;
}

export default function InventoryViewer({ onClose, onBack, serverUuid, playerName }: InventoryViewerProps) {
    const [activeTab, setActiveTab] = useState<'inventory' | 'enderchest'>('inventory');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['ext', 'minecraft_player_manager', serverUuid, 'player-data', playerName],
        queryFn: async () => {
            const response = await getPlayerData(serverUuid, playerName);
            if (!response.success) throw new Error(response.error || 'Failed to load player data');
            return response;
        },
    });

    return (
        <Modal
            open
            onClose={onClose}
            size="lg"
            title={`${playerName}'s Data`}
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
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Spinner className="h-7 w-7" />
                </div>
            ) : isError ? (
                <div className="py-8 text-center">
                    <p className="text-[var(--color-danger)]">
                        {error instanceof Error ? error.message : 'Failed to load player data'}
                    </p>
                </div>
            ) : data ? (
                <div className="space-y-6">
                    {data.location && data.stats && (
                        <div className="grid gap-4 md:grid-cols-2">
                            <LocationDisplay location={data.location} />
                            <StatsDisplay stats={data.stats} />
                        </div>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-2 border-b border-[var(--color-border)] pb-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('inventory')}
                            className={`rounded-t-lg px-4 py-2 transition-colors ${
                                activeTab === 'inventory'
                                    ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                            }`}
                        >
                            <Box className="mr-2 inline h-4 w-4" />
                            Inventory
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('enderchest')}
                            className={`rounded-t-lg px-4 py-2 transition-colors ${
                                activeTab === 'enderchest'
                                    ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
                            }`}
                        >
                            <Boxes className="mr-2 inline h-4 w-4" />
                            Ender Chest
                        </button>
                    </div>

                    {activeTab === 'inventory' ? (
                        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                            <div className="flex gap-6">
                                {data.armor && (
                                    <div className="flex-shrink-0">
                                        <h4 className="mb-3 flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                                            <Shield className="h-4 w-4 text-[var(--brand)]" />
                                            Armor
                                        </h4>
                                        <ArmorDisplay armor={data.armor} offhand={data.offhand || null} />
                                    </div>
                                )}
                                <div className="flex-1">
                                    <h4 className="mb-3 flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                                        <Box className="h-4 w-4 text-[var(--brand)]" />
                                        Inventory
                                    </h4>
                                    <div className="mb-4">
                                        <div className="mb-1 text-xs text-[var(--color-ink-faint)]">Hotbar</div>
                                        <InventoryGrid
                                            items={data.inventory?.filter(i => i.slot >= 0 && i.slot < 9) || []}
                                            rows={1}
                                            cols={9}
                                            startSlot={0}
                                        />
                                    </div>
                                    <div>
                                        <div className="mb-1 text-xs text-[var(--color-ink-faint)]">Main Inventory</div>
                                        <InventoryGrid
                                            items={data.inventory?.filter(i => i.slot >= 9 && i.slot < 36) || []}
                                            rows={3}
                                            cols={9}
                                            startSlot={9}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
                            <h4 className="mb-3 flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                                <Boxes className="h-4 w-4 text-purple-400" />
                                Ender Chest
                            </h4>
                            <InventoryGrid items={data.enderChest || []} rows={3} cols={9} startSlot={0} />
                        </div>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}
