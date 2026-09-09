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
import {
    Button,
    Field,
    Input,
    Modal,
    Spinner,
    createTranslator,
    notify,
    useExtensionQueryKey,
    useExtensionServerContext,
} from '@/extensions-sdk';
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
} from '../../api';
import InventoryViewer from '../../InventoryViewer';
import AttributeEditor from '../../AttributeEditor';

/*
 * The player manager, mounted by the panel as this package's server page.
 * Everything it can reach comes from '@/extensions-sdk', and every UI colour is
 * a theme variable. (Minecraft-domain colours — enchantment purple, dimension
 * hues, durability gradient — stay literal in the inventory view; see
 * InventoryViewer.tsx.)
 */

const t = createTranslator('minecraft_player_manager');

/** Cache namespace for this release; an upgrade must not serve an old shape. */
const VERSION = '3.0.0';

type IconType = ComponentType<LucideProps>;

const GENERIC_ERROR = () => t('common.genericError', 'Something went wrong. Please try again.');

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

    const handleAction = async (action: () => Promise<void>, actionName: string) => {
        setLoading(true);
        try {
            await action();
            notify('success', t('actions.completed', 'Action completed: {action}', { action: actionName }));
            onAction();
            onClose();
        } catch {
            notify('error', t('actions.failed', 'Could not complete: {action}', { action: actionName }));
        } finally {
            setLoading(false);
        }
    };

    const offlineTitle = !isOnline
        ? t('common.playerOffline', 'Player is offline')
        : !canManage
          ? t('common.readOnly', 'Read-only access')
          : undefined;

    return (
        <Modal open onClose={onClose} title={t('actions.title', 'Actions for {player}', { player })}>
            {!isOnline && (
                <div className="mb-4 rounded-lg border border-[var(--color-warning)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-warning)]">
                    {t(
                        'actions.offlineNotice',
                        'This player is offline. Kick, Kill, and Attribute editing are unavailable.',
                    )}
                </div>
            )}
            {!canManage && (
                <div className="mb-4 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-ink-muted)]">
                    {t('actions.readOnlyNotice', 'You have read-only access. Management actions are disabled.')}
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
                    {t('actions.viewInventory', 'View Inventory')}
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
                        {t('actions.editAttributes', 'Edit Attributes')}
                    </Button>
                )}
            </div>

            <div className="mb-3 border-t border-[var(--color-border)] pt-4">
                <h3 className="text-sm text-[var(--color-ink-muted)]">{t('actions.quick', 'Quick Actions')}</h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !isOnline || !canManage}
                    title={offlineTitle}
                    onClick={() => handleAction(() => kickPlayer(serverUuid, player), t('actionName.kick', 'Kick'))}
                >
                    <DoorOpen className="h-4 w-4" />
                    {t('actions.kick', 'Kick Player')}
                </Button>
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !isOnline || !canManage}
                    title={offlineTitle}
                    onClick={() => handleAction(() => killPlayer(serverUuid, player), t('actionName.kill', 'Kill'))}
                >
                    <Skull className="h-4 w-4" />
                    {t('actions.kill', 'Kill Player')}
                </Button>
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !canManage}
                    title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                    onClick={() =>
                        handleAction(
                            isOperator ? () => deopPlayer(serverUuid, player) : () => opPlayer(serverUuid, player),
                            isOperator ? t('actionName.deop', 'Deop') : t('actionName.op', 'Op'),
                        )
                    }
                >
                    <Crown className="h-4 w-4" />
                    {isOperator
                        ? t('actions.removeOperator', 'Remove Operator')
                        : t('actions.makeOperator', 'Make Operator')}
                </Button>
                <Button
                    variant="outline"
                    className="w-full justify-center"
                    disabled={loading || !canManage}
                    title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                    onClick={() => handleAction(() => banPlayer(serverUuid, player, ''), t('actionName.ban', 'Ban'))}
                >
                    <Ban className="h-4 w-4" />
                    {t('actions.ban', 'Ban Player')}
                </Button>
            </div>

            {/* Whisper */}
            <div className="mt-4 border-t border-[var(--color-border)] pt-4">
                <h3 className="mb-2 text-sm font-medium text-[var(--color-ink)]">
                    {t('actions.whisperTitle', 'Send Private Message')}
                </h3>
                <div className="flex gap-2">
                    <div className="flex-1">
                        <Input
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder={t('actions.whisperPlaceholder', 'Enter message…')}
                            disabled={!canManage}
                        />
                    </div>
                    <Button
                        disabled={loading || !canManage || message.trim().length === 0}
                        onClick={() =>
                            handleAction(async () => {
                                await whisperPlayer(serverUuid, player, message.trim());
                                setMessage('');
                            }, t('actionName.whisper', 'Whisper'))
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

// Resolved per call rather than at module load, so the label follows the
// viewer's locale.
const addTitle = (type: AddPlayerModalProps['type']): string =>
    ({
        whitelist: () => t('add.whitelist', 'Add to Whitelist'),
        op: () => t('add.op', 'Add Operator'),
        ban: () => t('add.ban', 'Ban Player'),
        'ban-ip': () => t('add.banIp', 'Ban IP Address'),
    })[type]();

function AddPlayerModal({ onClose, type, serverUuid, onAction }: AddPlayerModalProps) {
    const [target, setTarget] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isIp = type === 'ban-ip';

    const validate = (): string | null => {
        if (target.trim().length === 0) {
            return isIp
                ? t('add.ipRequired', 'IP address is required')
                : t('add.playerRequired', 'Player name is required');
        }
        if (isIp && !/^[\d.]+$/.test(target.trim())) return t('add.ipInvalid', 'Invalid IP format');
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
            notify('success', t('add.succeeded', '{action} successful', { action: addTitle(type) }));
            onAction();
            onClose();
        } catch {
            notify('error', GENERIC_ERROR());
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            open
            onClose={onClose}
            title={addTitle(type)}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={submit} disabled={loading}>
                        {loading ? t('common.working', 'Working…') : addTitle(type)}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Field
                    label={isIp ? t('add.ipLabel', 'IP Address') : t('add.playerLabel', 'Player Name')}
                    error={error ?? undefined}
                >
                    <Input
                        value={target}
                        onChange={e => setTarget(e.target.value)}
                        placeholder={isIp ? '192.168.1.1' : t('add.playerPlaceholder', 'Enter player name…')}
                        invalid={!!error}
                        onKeyDown={e => e.key === 'Enter' && submit()}
                    />
                </Field>
                {(type === 'ban' || type === 'ban-ip') && (
                    <Field label={t('add.reasonLabel', 'Reason (optional)')}>
                        <Input
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder={t('add.reasonPlaceholder', 'Enter ban reason…')}
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
                                        <p className="text-xs text-[var(--color-ink-muted)]">
                                            {t('common.reason', 'Reason: {reason}', { reason: player.reason })}
                                        </p>
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
    // The SDK hands a package its server plus the viewer's permissions on it.
    // Hiding a control is not authorization — the FormRequest behind each call
    // is — so this only avoids showing controls that would 403.
    const { server, can } = useExtensionServerContext();
    const uuid = server.uuid;
    const navigate = useNavigate();
    const qc = useQueryClient();
    // Mutating actions need the extension permission and the underlying core
    // permissions; the backend enforces all of them per operation.
    const canManage = can('extension.manage');

    const [actionLoading, setActionLoading] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
    const [addModalType, setAddModalType] = useState<AddPlayerModalProps['type'] | null>(null);
    const [inventoryPlayer, setInventoryPlayer] = useState<string | null>(null);
    const [attributePlayer, setAttributePlayer] = useState<string | null>(null);

    const statusKey = useExtensionQueryKey('minecraft_player_manager', VERSION, 'status', uuid);

    const { data, isLoading, isFetching, refetch } = useQuery({
        queryKey: statusKey,
        queryFn: async ({
            signal,
        }): Promise<{ status: PlayerManagerStatus; version: ServerVersion | null }> => {
            // The signal cancels both in-flight reads when the page unmounts or
            // the poll is superseded.
            const [status, versionData] = await Promise.all([
                getPlayerManagerStatus(uuid, signal),
                getServerVersion(uuid, signal).catch(() => ({ success: false as const, version: undefined })),
            ]);
            return { status, version: versionData.success && versionData.version ? versionData.version : null };
        },
        refetchInterval: 30_000,
    });

    const status = data?.status ?? null;
    const serverVersion = data?.version ?? null;

    const isPlayerOnline = (playerName: string): boolean =>
        status?.server.players.list?.some(p => p.name.toLowerCase() === playerName.toLowerCase()) ?? false;

    const refresh = () => qc.invalidateQueries({ queryKey: statusKey });

    const runAction = async (action: () => Promise<void>, successMessage: string) => {
        if (!canManage) return;
        setActionLoading(true);
        try {
            await action();
            notify('success', successMessage);
            refresh();
        } catch {
            notify('error', GENERIC_ERROR());
        } finally {
            setActionLoading(false);
        }
    };

    const handleToggleWhitelist = () => {
        if (!status) return;
        runAction(
            () => setWhitelistEnabled(uuid, !status.whitelistEnabled),
            t('list.whitelistToggled', 'Whitelist {state} successfully', {
                state: status.whitelistEnabled
                    ? t('list.stateDisabled', 'disabled')
                    : t('list.stateEnabled', 'enabled'),
            }),
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
        }, t('common.removed', 'Removed successfully'));

    const title = (
        <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">{t('page.title', 'Player Manager')}</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {t(
                    'page.subtitle',
                    'Whitelist, operators, bans, and live player actions for your Minecraft server.',
                )}
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
                    <p className="text-[var(--color-ink-muted)]">
                        {t('page.loadFailed', 'Failed to load player manager data.')}
                    </p>
                    <Button className="mt-4" onClick={() => refetch()}>
                        {t('page.tryAgain', 'Try Again')}
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
                    {t('common.back', 'Back to Extensions')}
                </button>
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    {t('common.refresh', 'Refresh')}
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
                            {status.server.online
                                ? t('status.online', 'Server Online')
                                : t('status.offline', 'Server Offline')}
                        </h2>
                        {status.server.online && (
                            <>
                                <p className="text-sm text-[var(--color-ink-muted)]">
                                    {t('status.playerCount', '{online}/{max} Players', {
                                        online: status.server.players.online,
                                        max: status.server.players.max,
                                    })}
                                </p>
                                {serverVersion && (
                                    <p className="text-xs text-[var(--color-ink-faint)]">
                                        {serverVersion.raw}
                                        {serverVersion.supportsAttributes && (
                                            <span className="ml-2 text-[var(--color-accent)]">
                                                {t('status.attributesSupported', '• Attributes supported')}
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
                        <h3 className="mb-2 text-sm font-medium text-[var(--color-ink-muted)]">
                            {t('status.onlinePlayers', 'Online Players')}
                        </h3>
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
                            title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                        >
                            {status.whitelistEnabled ? (
                                <ToggleRight className="h-5 w-5 text-[var(--brand)]" />
                            ) : (
                                <ToggleLeft className="h-5 w-5 text-[var(--color-ink-faint)]" />
                            )}
                            {status.whitelistEnabled
                                ? t('list.whitelistEnabled', 'Whitelist Enabled')
                                : t('list.whitelistDisabled', 'Whitelist Disabled')}
                        </button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAddModalType('whitelist')}
                            disabled={!canManage}
                            title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            {t('common.add', 'Add')}
                        </Button>
                    </div>
                    <PlayerList
                        title={t('list.whitelist', 'Whitelist')}
                        icon={ListChecks}
                        players={status.whitelist.map(p => ({ name: p.name, uuid: p.uuid }))}
                        emptyMessage={t('list.whitelistEmpty', 'No players whitelisted')}
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
                            title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            {t('common.add', 'Add')}
                        </Button>
                    </div>
                    <PlayerList
                        title={t('list.operators', 'Operators')}
                        icon={ShieldCheck}
                        players={status.operators.map(p => ({ name: p.name, uuid: p.uuid, level: p.level }))}
                        emptyMessage={t('list.operatorsEmpty', 'No operators configured')}
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
                            title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            {t('common.add', 'Add')}
                        </Button>
                    </div>
                    <PlayerList
                        title={t('list.bannedPlayers', 'Banned Players')}
                        icon={Ban}
                        players={status.bannedPlayers.map(p => ({
                            name: p.name,
                            uuid: p.uuid,
                            reason: p.reason,
                            source: p.source,
                        }))}
                        emptyMessage={t('list.bannedPlayersEmpty', 'No players banned')}
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
                            title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
                        >
                            <Plus className="h-4 w-4" />
                            {t('common.add', 'Add')}
                        </Button>
                    </div>
                    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 font-semibold text-[var(--color-ink)]">
                                <Network className="h-4 w-4 text-[var(--brand)]" />
                                {t('list.bannedIps', 'Banned IPs')}
                                <span className="ml-1 rounded bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-ink-muted)]">
                                    {status.bannedIps.length}
                                </span>
                            </h3>
                        </div>
                        {status.bannedIps.length === 0 ? (
                            <p className="py-4 text-center text-sm text-[var(--color-ink-faint)]">
                                {t('list.bannedIpsEmpty', 'No IPs banned')}
                            </p>
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
                                                    {t('common.reason', 'Reason: {reason}', { reason: ip.reason })}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFromList('ban-ip', ip.ip)}
                                            disabled={actionLoading || !canManage}
                                            title={!canManage ? t('common.readOnly', 'Read-only access') : undefined}
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
