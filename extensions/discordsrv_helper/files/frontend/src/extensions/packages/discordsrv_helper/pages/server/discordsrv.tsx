import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    MessagesSquare,
    Download,
    KeyRound,
    Hash,
    ExternalLink,
    History,
    Users,
    CheckCircle2,
    XCircle,
} from 'lucide-react';
import {
    Button,
    Field,
    Input,
    Spinner,
    createTranslator,
    extensionErrorMessage,
    notify,
    useExtensionQueryKey,
    useExtensionServerContext,
} from '@/extensions-sdk';
import {
    getDiscordSrvHelperStatus,
    installDiscordSrv,
    setDiscordSrvToken,
    setDiscordSrvGlobalChannel,
    getDiscordSrvHistory,
    revertDiscordSrvHistory,
    getDiscordSrvSubusers,
    setDiscordSrvSubuserAccess,
} from '../../api';

/*
 * The DiscordSRV helper, mounted by the panel as this package's server page.
 * Everything it can reach comes from '@/extensions-sdk', and every colour is a
 * theme variable.
 */

const t = createTranslator('discordsrv_helper');

/** Cache namespace for this release; an upgrade must not serve an old shape. */
const VERSION = '3.0.0';

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6">
            <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-ink)]">
                <span className="text-[var(--color-ink-faint)]">{icon}</span>
                {title}
            </h3>
            {children}
        </section>
    );
}

function StatusRow({ label, ok, text }: { label: string; ok?: boolean; text?: string }) {
    return (
        <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--color-ink-muted)]">{label}</span>
            {text !== undefined ? (
                <span className="truncate font-mono text-[var(--color-ink)]">{text}</span>
            ) : ok ? (
                <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
                    <CheckCircle2 className="h-4 w-4" /> Yes
                </span>
            ) : (
                <span className="flex items-center gap-1.5 text-[var(--color-ink-faint)]">
                    <XCircle className="h-4 w-4" /> No
                </span>
            )}
        </div>
    );
}

export default function DiscordSrvHelperPage() {
    const { server, can } = useExtensionServerContext();
    const uuid = server.uuid;
    const isOwner = server.isOwner;
    const qc = useQueryClient();

    const canReadExtensions = can('extension.read');
    const canFileRead = can('file.read');
    const canManage = can('extension.manage');
    const canInstall = canManage && can('file.create') && can('file.update');
    const canSetToken = canInstall && can('file.read-content');
    const canSetChannel = canManage && can('file.update') && can('file.read-content');

    const [botToken, setBotToken] = useState('');
    const [globalChannelId, setGlobalChannelId] = useState('');
    const [clientId, setClientId] = useState('');

    // Keys are namespaced by extension and version, so an upgrade never serves
    // a previous release's cached shape; the signal cancels in-flight reads on
    // unmount.
    const statusKey = useExtensionQueryKey('discordsrv_helper', VERSION, 'status', uuid);
    const historyKey = useExtensionQueryKey('discordsrv_helper', VERSION, 'history', uuid);
    const subusersKey = useExtensionQueryKey('discordsrv_helper', VERSION, 'subusers', uuid);

    const statusQuery = useQuery({
        queryKey: statusKey,
        queryFn: ({ signal }) => getDiscordSrvHelperStatus(uuid, signal),
        enabled: canReadExtensions && canFileRead,
    });

    const historyQuery = useQuery({
        queryKey: historyKey,
        queryFn: ({ signal }) => getDiscordSrvHistory(uuid, signal),
        enabled: isOwner,
    });

    const subusersQuery = useQuery({
        queryKey: subusersKey,
        queryFn: ({ signal }) => getDiscordSrvSubusers(uuid, signal),
        enabled: isOwner,
    });

    const status = statusQuery.data;

    const inviteUrl = useMemo(() => {
        const id = clientId.trim();
        if (!id) return null;
        const scope = encodeURIComponent('bot applications.commands');
        return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(id)}&permissions=0&scope=${scope}`;
    }, [clientId]);

    const refetchStatus = () => qc.invalidateQueries({ queryKey: statusKey });
    const refetchOwner = () => {
        qc.invalidateQueries({ queryKey: historyKey });
        qc.invalidateQueries({ queryKey: subusersKey });
    };
    // The backend answers a refused install with a specific reason (unexpected
    // host, bad archive, oversized download); surfacing it beats a generic
    // failure the operator cannot act on.
    const onError = (err: unknown) =>
        notify('error', extensionErrorMessage(err, t('common.genericError', 'Something went wrong. Please try again.')));

    const install = useMutation({
        mutationFn: () => installDiscordSrv(uuid),
        onSuccess: result => {
            notify('success', t('install.done', 'DiscordSRV {release} installed.', { release: result.release }));
            refetchStatus();
        },
        onError,
    });

    const saveToken = useMutation({
        mutationFn: () => setDiscordSrvToken(uuid, botToken),
        onSuccess: () => {
            notify('success', t('token.saved', 'Token saved.'));
            setBotToken('');
            refetchStatus();
            refetchOwner();
        },
        onError,
    });

    const saveChannel = useMutation({
        mutationFn: () => setDiscordSrvGlobalChannel(uuid, globalChannelId.trim()),
        onSuccess: () => {
            notify('success', t('channel.saved', 'Global channel saved.'));
            refetchStatus();
            refetchOwner();
        },
        onError,
    });

    const revert = useMutation({
        mutationFn: (snapshotId: number) => revertDiscordSrvHistory(uuid, snapshotId),
        onSuccess: () => {
            notify('success', t('history.reverted', 'Snapshot reverted.'));
            refetchStatus();
            refetchOwner();
        },
        onError,
    });

    const toggleSubuser = useMutation({
        mutationFn: ({ subuserUuid, enabled }: { subuserUuid: string; enabled: boolean }) =>
            setDiscordSrvSubuserAccess(uuid, subuserUuid, enabled),
        onSuccess: () => refetchOwner(),
        onError,
    });

    const title = (
        <div>
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">{t('page.title', 'DiscordSRV Helper')}</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                {t(
                    'page.subtitle',
                    'Install and configure DiscordSRV — token, global channel, history and per-subuser access.',
                )}
            </p>
        </div>
    );

    if (!canReadExtensions) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    {t('page.deniedExtensions', 'You do not have permission to view extensions.')}
                </div>
            </div>
        );
    }

    if (!canFileRead) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    <p>
                        {t(
                            'page.deniedFiles',
                            'This extension requires file read permission to check plugin status.',
                        )}
                    </p>
                    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                        {t('page.required', 'Requires: {permissions}', { permissions: 'file.read' })}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6">
            {title}

            {statusQuery.isLoading ? (
                <div className="flex justify-center py-16">
                    <Spinner className="h-7 w-7" />
                </div>
            ) : (
                <>
                    <Card title={t('status.title', 'Status')} icon={<MessagesSquare className="h-4 w-4" />}>
                        <div className="mt-4 grid gap-2">
                            <StatusRow label={t('status.installed', 'Installed')} ok={!!status?.installed} />
                            <StatusRow label={t('status.pluginJar', 'Plugin Jar')} text={status?.plugin_jar || '—'} />
                            <StatusRow
                                label={t('status.pluginFolder', 'Plugin Folder')}
                                ok={!!status?.plugin_folder_present}
                            />
                            <StatusRow label={t('status.tokenFile', 'Token File')} ok={!!status?.token_file_present} />
                            <StatusRow label={t('status.config', 'Config')} ok={!!status?.config_present} />
                        </div>
                    </Card>

                    <Card title={t('install.title', 'Install')} icon={<Download className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            {t('install.description', 'Installs DiscordSRV to {path}.', {
                                path: '/plugins/DiscordSRV.jar',
                            })}
                        </p>
                        {/*
                         * No URL field. The source is pinned in the panel, which
                         * verifies the download before it reaches the server —
                         * saying so here is what stops the missing input reading
                         * as a regression.
                         */}
                        <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                            {t(
                                'install.source',
                                'The jar is fetched from the official DiscordSRV release feed and verified by the panel before it is written to your server. There is no custom URL option: allowing one would let this page point the panel and the daemon at any host.',
                            )}
                        </p>
                        <div className="mt-4">
                            <Button disabled={!canInstall || install.isPending} onClick={() => install.mutate()}>
                                <Download className="h-4 w-4" />
                                {install.isPending
                                    ? t('install.pending', 'Installing…')
                                    : t('install.action', 'Install DiscordSRV')}
                            </Button>
                            {!canInstall && (
                                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                                    {t('page.required', 'Requires: {permissions}', {
                                        permissions: 'extension.manage + file.create + file.update',
                                    })}
                                </p>
                            )}
                            {install.data && (
                                <p className="mt-3 break-all font-mono text-xs text-[var(--color-ink-faint)]">
                                    {t('install.digest', 'Installed {asset} ({release}) · SHA-256 {sha256}', {
                                        asset: install.data.asset,
                                        release: install.data.release,
                                        sha256: install.data.sha256,
                                    })}
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card title={t('token.title', 'Bot Token')} icon={<KeyRound className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            {t('token.description', 'Saves the token to {path}.', {
                                path: '/plugins/DiscordSRV/.token',
                            })}
                        </p>
                        <div className="mt-4">
                            <Field label={t('token.label', 'Bot Token')}>
                                <Input
                                    type="password"
                                    value={botToken}
                                    onChange={e => setBotToken(e.target.value)}
                                    placeholder={t('token.placeholder', 'Paste bot token')}
                                />
                            </Field>
                        </div>
                        <div className="mt-4">
                            <Button
                                disabled={!canSetToken || saveToken.isPending || botToken.trim().length === 0}
                                onClick={() => saveToken.mutate()}
                            >
                                <KeyRound className="h-4 w-4" />
                                {saveToken.isPending
                                    ? t('common.saving', 'Saving…')
                                    : t('token.action', 'Save Token')}
                            </Button>
                            {!canSetToken && (
                                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                                    {t('page.required', 'Requires: {permissions}', {
                                        permissions:
                                            'extension.manage + file.create + file.update + file.read-content',
                                    })}
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card title={t('channel.title', 'Link Global Chat')} icon={<Hash className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            {t('channel.description', 'Sets {key} in DiscordSRV config.yml.', {
                                key: 'Channels.global',
                            })}
                        </p>
                        <div className="mt-4">
                            <Field label={t('channel.label', 'Discord Channel ID')}>
                                <Input
                                    value={globalChannelId}
                                    onChange={e => setGlobalChannelId(e.target.value)}
                                    placeholder="123456789012345678"
                                />
                            </Field>
                        </div>
                        <div className="mt-4">
                            <Button
                                disabled={
                                    !canSetChannel || saveChannel.isPending || globalChannelId.trim().length === 0
                                }
                                onClick={() => saveChannel.mutate()}
                            >
                                <Hash className="h-4 w-4" />
                                {saveChannel.isPending
                                    ? t('common.saving', 'Saving…')
                                    : t('channel.action', 'Save Channel')}
                            </Button>
                            {!canSetChannel && (
                                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                                    {t('page.required', 'Requires: {permissions}', {
                                        permissions: 'extension.manage + file.update + file.read-content',
                                    })}
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card title={t('invite.title', 'Invite Link')} icon={<ExternalLink className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            {t(
                                'invite.description',
                                'Discord invite links require the Application Client ID (not the token).',
                            )}
                        </p>
                        <div className="mt-4">
                            <Field label={t('invite.label', 'Application Client ID')}>
                                <Input
                                    value={clientId}
                                    onChange={e => setClientId(e.target.value)}
                                    placeholder="123456789012345678"
                                />
                            </Field>
                        </div>
                        <div className="mt-4">
                            <Button
                                variant="outline"
                                disabled={!inviteUrl}
                                onClick={() => inviteUrl && window.open(inviteUrl, '_blank', 'noopener,noreferrer')}
                            >
                                <ExternalLink className="h-4 w-4" />
                                {t('invite.action', 'Open Invite Link')}
                            </Button>
                        </div>
                    </Card>

                    {isOwner && (
                        <Card
                            title={t('history.title', 'Revert Changes (Owner Only)')}
                            icon={<History className="h-4 w-4" />}
                        >
                            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                                {t('history.description', 'Recent config/token changes made through this extension.')}
                            </p>
                            {historyQuery.isLoading ? (
                                <div className="flex justify-center py-6">
                                    <Spinner className="h-5 w-5" />
                                </div>
                            ) : (historyQuery.data?.length ?? 0) === 0 ? (
                                <p className="mt-4 text-sm text-[var(--color-ink-faint)]">
                                    {t('history.empty', 'No snapshots available.')}
                                </p>
                            ) : (
                                <div className="mt-4 space-y-2">
                                    {historyQuery.data!.map(h => (
                                        <div
                                            key={h.id}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
                                        >
                                            <div className="min-w-0 text-sm">
                                                <div className="truncate font-medium text-[var(--color-ink)]">
                                                    {h.action}
                                                </div>
                                                <div className="text-xs text-[var(--color-ink-faint)]">
                                                    {new Date(h.created_at).toLocaleString()}
                                                    {h.actor ? ` • ${h.actor.email}` : ''}
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={revert.isPending}
                                                onClick={() => revert.mutate(h.id)}
                                            >
                                                {t('history.action', 'Revert')}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}

                    {isOwner && (
                        <Card
                            title={t('subusers.title', 'Subuser Access (Owner Only)')}
                            icon={<Users className="h-4 w-4" />}
                        >
                            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                                {t('subusers.description', 'Enable or disable this extension per subuser.')}
                            </p>
                            {subusersQuery.isLoading ? (
                                <div className="flex justify-center py-6">
                                    <Spinner className="h-5 w-5" />
                                </div>
                            ) : (subusersQuery.data?.length ?? 0) === 0 ? (
                                <p className="mt-4 text-sm text-[var(--color-ink-faint)]">
                                    {t('subusers.empty', 'No subusers.')}
                                </p>
                            ) : (
                                <div className="mt-4 space-y-2">
                                    {subusersQuery.data!.map(s => (
                                        <div
                                            key={s.uuid}
                                            className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3"
                                        >
                                            <div className="min-w-0 text-sm">
                                                <div className="truncate font-medium text-[var(--color-ink)]">
                                                    {s.email}
                                                </div>
                                                <div className="text-xs text-[var(--color-ink-faint)]">
                                                    {s.username}
                                                </div>
                                            </div>
                                            <Button
                                                variant={s.disabled ? 'primary' : 'outline'}
                                                size="sm"
                                                disabled={toggleSubuser.isPending}
                                                onClick={() =>
                                                    toggleSubuser.mutate({
                                                        subuserUuid: s.uuid,
                                                        enabled: s.disabled,
                                                    })
                                                }
                                            >
                                                {s.disabled
                                                    ? t('subusers.enable', 'Enable')
                                                    : t('subusers.disable', 'Disable')}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
