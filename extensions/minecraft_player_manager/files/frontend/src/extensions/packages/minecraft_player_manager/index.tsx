import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Circle,
    ShieldCheck,
    ListChecks,
    Ban,
    RefreshCw,
    Crown,
    MessageCircle,
    Skull,
    DoorOpen,
    ArrowLeft,
    ToggleRight,
    ToggleLeft,
    Plus,
    Trash2,
    Network,
    Box,
    SlidersHorizontal,
    type LucideProps,
} from 'lucide-react';
import { useServer } from '@/components/server/ServerContext';
import { useFlashes } from '@/state/flashes';
import { can } from '@/lib/can';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { Input, Field } from '@/components/ui/Input';
import {
    getPlayerManagerStatus,
    setWhitelistEnabled,
    addToWhitelist,
    removeFromWhitelist,
    opPlayer,
    deopPlayer,
    banPlayer,
    unbanPlayer,
    banIp,
    unbanIp,
    kickPlayer,
    whisperPlayer,
    killPlayer,
    getServerVersion,
    type PlayerManagerStatus,
    type ServerVersion,
} from './api';
import InventoryViewer from './InventoryViewer';
import AttributeEditor from './AttributeEditor';

// Extension UI: strings are literal English (extensions cannot contribute
// Paraglide messages) and every UI colour comes from a theme CSS variable.
// (Minecraft-domain colours — enchantment purple, dimension hues, durability
// gradient — stay literal in the inventory view; see InventoryViewer.tsx.)

type IconType = ComponentType<LucideProps>;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

// ─── Player Actions Modal ─────────────────────────────────────────────────────

interface PlayerActionsModalProps {
    onClose: () => void;
    player: string;
    serverUuid: string;
    onAction: () => void;
    supportsAttributes: boolean;
    onViewInventory: () => void;
    onEditAttributes: () => void;
    isOperator: boolean;
    isOnline: boolean;
    canManage: boolean;
}

function PlayerActionsModal({
    onClose,
    player,
    serverUuid,
    onAction,
    supportsAttributes,
    onViewInventory,
    onEditAttributes,
    isOperator,
    isOnline,
    canManage,
}: PlayerActionsModalProps) {
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const push = useFlashes(s => s.push);

    const handleAction = async (action: () => Promise<void>, actionName: string) => {
        setLoading(true);
        try {
            await action();
            push({ type: 'success', message: `Action completed: ${actionName}` });
            onAction();
            onClose();
        } catch {
            push({ type: 'error', message: `Could not complete: ${actionName}` });
        } finally {
            setLoading(false);
        }
    };

    const offlineTitle = !isOnline ? 'Player is offline' : !canManage ? 'Read-only access' : undefined;

    return (
        <Modal open onClose={onClose} title={`Actions for ${player}`}>
            {!isOnline && (
                <div className="mb-4 rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-warning)]">
                    This player is offline. Kick, Kill, and Attribute editing are unavailable.
                </div>
            )}
            {!canManage && (
                <div className="mb-4 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-ink-muted)]">
                    You have read-only access. Management actions are disabled.
                </div>
            )}

            {/* View data buttons */}
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => {
                        onClose();
                        onViewInventory();
                    }}
                >
                    <Box className="h-4 w-4" />
                    View Inventory
                </Button>
                {supportsAttributes && (
                    <Button
                        variant="secondary"
                        className="w-full justify-center"
                        disabled={!isOnline || !canManage}
                        title={offlineTitle}
                        onClick={() => {
                            onClose();
                            onEditAttributes();
                        }}
                    >
                        <SlidersHorizontal className="h-4 w-4" />
                        Edit Attributes
                    </Button>
                )}
            </div>

            <div className="mb-3 border-t border-[var(--color-border)] pt-4">
                <h3 className="text-sm text-[var(--color-ink-muted)]">Quick Actions</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !isOnline || !canManage}
                    title={offlineTitle}
                    onClick={() => handleAction(() => kickPlayer(serverUuid, player), 'Kick')}
                >
                    <DoorOpen className="h-4 w-4" />
                    Kick Player
                </Button>
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !isOnline || !canManage}
                    title={offlineTitle}
                    onClick={() => handleAction(() => killPlayer(serverUuid, player), 'Kill')}
                >
                    <Skull className="h-4 w-4" />
                    Kill Player
                </Button>
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !canManage}
                    title={!canManage ? 'Read-only access' : undefined}
                    onClick={() =>
                        handleAction(
                            isOperator ? () => deopPlayer(serverUuid, player) : () => opPlayer(serverUuid, player),
                            isOperator ? 'Deop' : 'Op',
                        )
                    }
                >
                    <Crown className="h-4 w-4" />
                    {isOperator ? 'Remove Operator' : 'Make Operator'}
                </Button>
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !canManage}
                    title={!canManage ? 'Read-only access' : undefined}
                    onClick={() => handleAction(() => banPlayer(serverUuid, player, ''), 'Ban')}
                >
                    <Ban className="h-4 w-4" />
                    Ban Player
                </Button>
            </div>

            {/* Whisper */}
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--color-ink)]">Send Private Message</h3>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Input
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Enter message..."
                            disabled={!canManage}
                        />
                    </div>
                    <Button
                        disabled={loading || !canManage || message.trim().length === 0}
                        onClick={() =>
                            handleAction(async () => {
                                await whisperPlayer(serverUuid, player, message.trim());
                                setMessage('');
                            }, 'Whisper')
                        }
                    >
                        <MessageCircle className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// ─── Add Player Modal ─────────────────────────────────────────────────────────

interface AddPlayerModalProps {
    onClose: () => void;
    type: 'whitelist' | 'op' | 'ban' | 'ban-ip';
    serverUuid: string;
    onAction: () => void;
}

const ADD_TITLES: Record<AddPlayerModalProps['type'], string> = {
    whitelist: 'Add to Whitelist',
    op: 'Add Operator',
    ban: 'Ban Player',
    'ban-ip': 'Ban IP Address',
};

function AddPlayerModal({ onClose, type, serverUuid, onAction }: AddPlayerModalProps) {
    const [target, setTarget] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const push = useFlashes(s => s.push);

    const isIp = type === 'ban-ip';

    const validate = (): string | null => {
        if (target.trim().length === 0) return isIp ? 'IP address is required' : 'Player name is required';
        if (isIp && !/^[\d.]+$/.test(target.trim())) return 'Invalid IP format';
        return null;
    };

    const submit = async () => {
        const v = validate();
        if (v) {
            setError(v);
            return;
        }
        setError(null);
        setLoading(true);
        try {
            const name = target.trim();
            switch (type) {
                case 'whitelist':
                    await addToWhitelist(serverUuid, name);
                    break;
                case 'op':
                    await opPlayer(serverUuid, name);
                    break;
                case 'ban':
                    await banPlayer(serverUuid, name, reason);
                    break;
                case 'ban-ip':
                    await banIp(serverUuid, name, reason);
                    break;
            }
            push({ type: 'success', message: `${ADD_TITLES[type]} successful` });
            onAction();
            onClose();
        } catch {
            push({ type: 'error', message: GENERIC_ERROR });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={ADD_TITLES[type]}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={loading}>
                        {loading ? 'Working…' : ADD_TITLES[type]}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field label={isIp ? 'IP Address' : 'Player Name'} error={error ?? undefined}>
                    <Input
                        value={target}
                        onChange={e => setTarget(e.target.value)}
                        placeholder={isIp ? '192.168.1.1' : 'Enter player name...'}
                        invalid={!!error}
                        onKeyDown={e => e.key === 'Enter' && submit()}
                    />
                </Field>
                {(type === 'ban' || type === 'ban-ip') && (
                    <Field label="Reason (optional)">
                        <Input
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Enter ban reason..."
                        />
                    </Field>
                )}
            </div>
        </Modal>
    );
}

// ─── Player list card ─────────────────────────────────────────────────────────

interface PlayerListProps {
    title: string;
    icon: IconType;
    players: { name: string; uuid?: string; level?: number; reason?: string; source?: string }[];
    emptyMessage: string;
    onRemove?: (name: string) => void;
    onPlayerClick?: (name: string) => void;
    loading: boolean;
    badge?: (player: { name: string; level?: number }) => string | null;
}

function PlayerList({ title, icon: Icon, players, emptyMessage, onRemove, onPlayerClick, loading, badge }: PlayerListProps) {
    return (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                    <Icon className="h-4 w-4 text-[var(--brand)]" />
                    {title}
                    <span className="ml-1 rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)]">
                        {players.length}
                    </span>
                </h3>
            </div>
            {players.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--color-ink-faint)]">{emptyMessage}</p>
            ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto">
                    {players.map((player, index) => (
                        <div
                            key={`${player.name}-${index}`}
                            className={[
                                'flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] p-2',
                                onPlayerClick ? 'cursor-pointer transition-colors hover:bg-[var(--color-border-strong)]' : '',
                            ].join(' ')}
                            onClick={() => onPlayerClick?.(player.name)}
                        >
                            <div className="flex items-center gap-2">
                                <img
                                    src={`https://mc-heads.net/avatar/${player.uuid || player.name}/32`}
                                    alt={player.name}
                                    className="h-8 w-8 rounded"
                                />
                                <div>
                                    <span className="text-sm font-medium text-[var(--color-ink)]">{player.name}</span>
                                    {badge && badge(player) && (
                                        <span className="ml-2 rounded bg-[var(--brand-soft)] px-1.5 py-0.5 text-xs text-[var(--brand-bright)]">
                                            {badge(player)}
                                        </span>
                                    )}
                                    {player.reason && (
                                        <p className="text-xs text-[var(--color-ink-muted)]">Reason: {player.reason}</p>
                                    )}
                                </div>
                            </div>
                            {onRemove && (
                                <button
                                    type="button"
                                    onClick={e => {
                                        e.stopPropagation();
                                        onRemove(player.name);
                                    }}
                                    disabled={loading}
                                    className="p-1 text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-danger)] disabled:opacity-50"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MinecraftPlayerManagerPage() {
    const server = useServer();
    const uuid = server.uuid;
    const navigate = useNavigate();
    const push = useFlashes(s => s.push);
    const qc = useQueryClient();
    const canManage = can(server.permissions, 'extension.manage');

    const [actionLoading, setActionLoading] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [addModalType, setAddModalType] = useState<AddPlayerModalProps['type'] | null>(null);
    const [inventoryPlayer, setInventoryPlayer] = useState<string | null>(null);
    const [attributePlayer, setAttributePlayer] = useState<string | null>(null);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['ext', 'minecraft_player_manager', uuid],
        queryFn: async (): Promise<{ status: PlayerManagerStatus; version: ServerVersion | null }> => {
            const [status, versionData] = await Promise.all([
                getPlayerManagerStatus(uuid),
                getServerVersion(uuid).catch(() => ({ success: false as const, version: undefined })),
            ]);
            return { status, version: versionData.success && versionData.version ? versionData.version : null };
        },
        refetchInterval: 30_000,
    });

    const status = data?.status ?? null;
    const serverVersion = data?.version ?? null;

    const isPlayerOnline = (playerName: string): boolean =>
        status?.server.players.list?.some(p => p.name.toLowerCase() === playerName.toLowerCase()) ?? false;

    const refresh = () => qc.invalidateQueries({ queryKey: ['ext', 'minecraft_player_manager', uuid] });

    const runAction = async (action: () => Promise<void>, successMessage: string) => {
        if (!canManage) return;
        setActionLoading(true);
        try {
            await action();
            push({ type: 'success', message: successMessage });
            refresh();
        } catch {
            push({ type: 'error', message: GENERIC_ERROR });
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleWhitelist = () => {
        if (!status) return;
        runAction(
            () => setWhitelistEnabled(uuid, !status.whitelistEnabled),
            `Whitelist ${status.whitelistEnabled ? 'disabled' : 'enabled'} successfully`,
        );
    };

    const handleRemoveFromList = (type: 'whitelist' | 'op' | 'ban' | 'ban-ip', target: string) =>
        runAction(async () => {
            switch (type) {
                case 'whitelist':
                    await removeFromWhitelist(uuid, target);
                    break;
                case 'op':
                    await deopPlayer(uuid, target);
                    break;
                case 'ban':
                    await unbanPlayer(uuid, target);
                    break;
                case 'ban-ip':
                    await unbanIp(uuid, target);
                    break;
            }
        }, 'Removed successfully');

    const title = (
        <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">Player Manager</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Whitelist, operators, bans, and live player actions for your Minecraft server.
            </p>
        </div>
    );

    if (isLoading && !status) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="flex items-center justify-center py-16">
                    <Spinner className="h-7 w-7" />
                </div>
            </div>
        );
    }

    if (!status) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-8 text-center">
                    <p className="text-[var(--color-ink-muted)]">Failed to load player manager data.</p>
                    <Button className="mt-4" onClick={() => refetch()}>
                        Try Again
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => navigate(`/server/${server.id}/extensions`)}
                    className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Extensions
                </button>
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Server status card */}
            <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
                <div className="flex items-center gap-4">
                    <div
                        className="flex h-16 w-16 items-center justify-center rounded-lg"
                        style={{
                            backgroundColor: status.server.online
                                ? 'color-mix(in srgb, var(--color-accent) 18%, transparent)'
                                : 'color-mix(in srgb, var(--color-danger) 18%, transparent)',
                        }}
                    >
                        <Circle
                            className="h-6 w-6"
                            style={{
                                color: status.server.online ? 'var(--color-accent)' : 'var(--color-danger)',
                                fill: 'currentColor',
                            }}
                        />
                    </div>
                    <div>
                        <h2 className="text-xl font-semibold text-[var(--color-ink)]">
                            Server {status.server.online ? 'Online' : 'Offline'}
                        </h2>
                        {status.server.online && (
                            <>
                                <p className="text-sm text-[var(--color-ink-muted)]">
                                    {status.server.players.online}/{status.server.players.max} Players
                                </p>
                                {serverVersion && (
                                    <p className="text-xs text-[var(--color-ink-faint)]">
                                        {serverVersion.raw}
                                        {serverVersion.supportsAttributes && (
                                            <span className="ml-2 text-[var(--color-accent)]">
                                                • Attributes supported
                                            </span>
                                        )}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {status.server.online && status.server.players.list.length > 0 && (
                    <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                        <h3 className="mb-2 text-sm font-medium text-[var(--color-ink-muted)]">Online Players</h3>
                        <div className="flex flex-wrap gap-2">
                            {status.server.players.list.map(player => (
                                <button
                                    key={player.name}
                                    type="button"
                                    onClick={() => setSelectedPlayer(player.name)}
                                    className="flex items-center gap-2 rounded-lg bg-[var(--color-surface-2)] px-3 py-2 transition-colors hover:bg-[var(--color-border-strong)]"
                                >
                                    <img
                                        src={`https://mc-heads.net/avatar/${player.uuid || player.name}/24`}
                                        alt={player.name}
                                        className="h-6 w-6 rounded"
                                    />
                                    <span className="text-sm text-[var(--color-ink)]">{player.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Management sections */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Whitelist */}
                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={handleToggleWhitelist}
                            disabled={actionLoading || !canManage}
                            className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-50"
                            title={!canManage ? 'Read-only access' : undefined}
                        >
                            {status.whitelistEnabled ? (
                                <ToggleRight className="h-5 w-5 text-[var(--brand)]" />
                            ) : (
                                <ToggleLeft className="h-5 w-5 text-[var(--color-ink-faint)]" />
                            )}
                            Whitelist {status.whitelistEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddModalType('whitelist')}
                            disabled={!canManage}
                            title={!canManage ? 'Read-only access' : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </Button>
                    </div>
                    <PlayerList
                        title="Whitelist"
                        icon={ListChecks}
                        players={status.whitelist.map(p => ({ name: p.name, uuid: p.uuid }))}
                        emptyMessage="No players whitelisted"
                        onRemove={canManage ? name => handleRemoveFromList('whitelist', name) : undefined}
                        onPlayerClick={name => setSelectedPlayer(name)}
                        loading={actionLoading}
                    />
                </div>

                {/* Operators */}
                <div>
                    <div className="mb-3 flex items-center justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddModalType('op')}
                            disabled={!canManage}
                            title={!canManage ? 'Read-only access' : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </Button>
                    </div>
                    <PlayerList
                        title="Operators"
                        icon={ShieldCheck}
                        players={status.operators.map(p => ({ name: p.name, uuid: p.uuid, level: p.level }))}
                        emptyMessage="No operators configured"
                        onRemove={canManage ? name => handleRemoveFromList('op', name) : undefined}
                        onPlayerClick={name => setSelectedPlayer(name)}
                        loading={actionLoading}
                        badge={() => 'op'}
                    />
                </div>

                {/* Banned players */}
                <div>
                    <div className="mb-3 flex items-center justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddModalType('ban')}
                            disabled={!canManage}
                            title={!canManage ? 'Read-only access' : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </Button>
                    </div>
                    <PlayerList
                        title="Banned Players"
                        icon={Ban}
                        players={status.bannedPlayers.map(p => ({
                            name: p.name,
                            uuid: p.uuid,
                            reason: p.reason,
                            source: p.source,
                        }))}
                        emptyMessage="No players banned"
                        onRemove={canManage ? name => handleRemoveFromList('ban', name) : undefined}
                        loading={actionLoading}
                    />
                </div>

                {/* Banned IPs */}
                <div>
                    <div className="mb-3 flex items-center justify-end">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddModalType('ban-ip')}
                            disabled={!canManage}
                            title={!canManage ? 'Read-only access' : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </Button>
                    </div>
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                                <Network className="h-4 w-4 text-[var(--brand)]" />
                                Banned IPs
                                <span className="ml-1 rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)]">
                                    {status.bannedIps.length}
                                </span>
                            </h3>
                        </div>
                        {status.bannedIps.length === 0 ? (
                            <p className="py-4 text-center text-sm text-[var(--color-ink-faint)]">No IPs banned</p>
                        ) : (
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                                {status.bannedIps.map((ip, index) => (
                                    <div
                                        key={`${ip.ip}-${index}`}
                                        className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] p-2"
                                    >
                                        <div>
                                            <span className="font-mono text-sm text-[var(--color-ink)]">{ip.ip}</span>
                                            {ip.reason && (
                                                <p className="text-xs text-[var(--color-ink-muted)]">
                                                    Reason: {ip.reason}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFromList('ban-ip', ip.ip)}
                                            disabled={actionLoading || !canManage}
                                            title={!canManage ? 'Read-only access' : undefined}
                                            className="p-1 text-[var(--color-ink-faint)] transition-colors hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {selectedPlayer && (
                <PlayerActionsModal
                    onClose={() => setSelectedPlayer(null)}
                    player={selectedPlayer}
                    serverUuid={uuid}
                    onAction={refresh}
                    supportsAttributes={serverVersion?.supportsAttributes || false}
                    onViewInventory={() => setInventoryPlayer(selectedPlayer)}
                    onEditAttributes={() => setAttributePlayer(selectedPlayer)}
                    isOperator={status.operators.some(op => op.name.toLowerCase() === selectedPlayer.toLowerCase())}
                    isOnline={isPlayerOnline(selectedPlayer)}
                    canManage={canManage}
                />
            )}

            {inventoryPlayer && (
                <InventoryViewer
                    onClose={() => setInventoryPlayer(null)}
                    onBack={() => setSelectedPlayer(inventoryPlayer)}
                    serverUuid={uuid}
                    playerName={inventoryPlayer}
                />
            )}

            {attributePlayer && (
                <AttributeEditor
                    onClose={() => setAttributePlayer(null)}
                    onBack={() => setSelectedPlayer(attributePlayer)}
                    serverUuid={uuid}
                    playerName={attributePlayer}
                    isOnline={isPlayerOnline(attributePlayer)}
                    canManage={canManage}
                />
            )}

            {addModalType && canManage && (
                <AddPlayerModal
                    onClose={() => setAddModalType(null)}
                    type={addModalType}
                    serverUuid={uuid}
                    onAction={refresh}
                />
            )}
        </div>
    );
}
