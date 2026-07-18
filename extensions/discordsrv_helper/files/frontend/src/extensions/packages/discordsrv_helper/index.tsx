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
import { useServer } from '@/components/server/ServerContext';
import { useFlashes } from '@/state/flashes';
import { can } from '@/lib/can';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import {
    getDiscordSrvHelperStatus,
    installDiscordSrv,
    setDiscordSrvToken,
    setDiscordSrvGlobalChannel,
    getDiscordSrvHistory,
    revertDiscordSrvHistory,
    getDiscordSrvSubusers,
    setDiscordSrvSubuserAccess,
} from './api';

// Extension UI: strings are literal English (extensions cannot contribute
// Paraglide messages) and every colour comes from a theme CSS variable.

const QK = ['ext', 'discordsrv_helper'] as const;

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
    const server = useServer();
    const uuid = server.uuid;
    const isOwner = server.isOwner;
    const push = useFlashes(s => s.push);
    const qc = useQueryClient();

    const held = server.permissions;
    const canReadExtensions = can(held, 'extension.read');
    const canFileRead = can(held, 'file.read');
    const canManage = can(held, 'extension.manage');
    const canInstall = canManage && can(held, 'file.create') && can(held, 'file.update');
    const canSetToken = canInstall && can(held, 'file.read-content');
    const canSetChannel = canManage && can(held, 'file.update') && can(held, 'file.read-content');

    const [jarUrl, setJarUrl] = useState('');
    const [botToken, setBotToken] = useState('');
    const [globalChannelId, setGlobalChannelId] = useState('');
    const [clientId, setClientId] = useState('');

    const statusQuery = useQuery({
        queryKey: [...QK, uuid, 'status'],
        queryFn: () => getDiscordSrvHelperStatus(uuid),
        enabled: canReadExtensions && canFileRead,
    });

    const historyQuery = useQuery({
        queryKey: [...QK, uuid, 'history'],
        queryFn: () => getDiscordSrvHistory(uuid),
        enabled: isOwner,
    });

    const subusersQuery = useQuery({
        queryKey: [...QK, uuid, 'subusers'],
        queryFn: () => getDiscordSrvSubusers(uuid),
        enabled: isOwner,
    });

    const status = statusQuery.data;

    const inviteUrl = useMemo(() => {
        const id = clientId.trim();
        if (!id) return null;
        const scope = encodeURIComponent('bot applications.commands');
        return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(id)}&permissions=0&scope=${scope}`;
    }, [clientId]);

    const refetchStatus = () => qc.invalidateQueries({ queryKey: [...QK, uuid, 'status'] });
    const refetchOwner = () => {
        qc.invalidateQueries({ queryKey: [...QK, uuid, 'history'] });
        qc.invalidateQueries({ queryKey: [...QK, uuid, 'subusers'] });
    };
    const onError = () => push({ type: 'error', message: 'Something went wrong. Please try again.' });

    const install = useMutation({
        mutationFn: () => installDiscordSrv(uuid, jarUrl.trim() || undefined),
        onSuccess: () => {
            push({ type: 'success', message: 'DiscordSRV install started.' });
            refetchStatus();
        },
        onError,
    });

    const saveToken = useMutation({
        mutationFn: () => setDiscordSrvToken(uuid, botToken),
        onSuccess: () => {
            push({ type: 'success', message: 'Token saved.' });
            setBotToken('');
            refetchStatus();
            refetchOwner();
        },
        onError,
    });

    const saveChannel = useMutation({
        mutationFn: () => setDiscordSrvGlobalChannel(uuid, globalChannelId.trim()),
        onSuccess: () => {
            push({ type: 'success', message: 'Global channel saved.' });
            refetchStatus();
            refetchOwner();
        },
        onError,
    });

    const revert = useMutation({
        mutationFn: (snapshotId: number) => revertDiscordSrvHistory(uuid, snapshotId),
        onSuccess: () => {
            push({ type: 'success', message: 'Snapshot reverted.' });
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
            <h1 className="text-xl font-semibold text-[var(--color-ink)]">DiscordSRV Helper</h1>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                Install and configure DiscordSRV — token, global channel, history and per-subuser access.
            </p>
        </div>
    );

    if (!canReadExtensions) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    You do not have permission to view extensions.
                </div>
            </div>
        );
    }

    if (!canFileRead) {
        return (
            <div className="flex flex-col gap-6">
                {title}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-ink-muted)]">
                    <p>This extension requires file read permission to check plugin status.</p>
                    <p className="mt-2 text-xs text-[var(--color-ink-faint)]">Required: file.read</p>
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
                    <Card title="Status" icon={<MessagesSquare className="h-4 w-4" />}>
                        <div className="mt-4 grid gap-2">
                            <StatusRow label="Installed" ok={!!status?.installed} />
                            <StatusRow label="Plugin Jar" text={status?.plugin_jar || '—'} />
                            <StatusRow label="Plugin Folder" ok={!!status?.plugin_folder_present} />
                            <StatusRow label="Token File" ok={!!status?.token_file_present} />
                            <StatusRow label="Config" ok={!!status?.config_present} />
                        </div>
                    </Card>

                    <Card title="Install" icon={<Download className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            Installs DiscordSRV to{' '}
                            <span className="font-mono text-[var(--color-ink)]">/plugins/DiscordSRV.jar</span>.
                        </p>
                        <div className="mt-4">
                            <Field label="Optional Jar URL">
                                <Input
                                    value={jarUrl}
                                    onChange={e => setJarUrl(e.target.value)}
                                    placeholder="https://.../DiscordSRV-....jar"
                                />
                            </Field>
                        </div>
                        <div className="mt-4">
                            <Button disabled={!canInstall || install.isPending} onClick={() => install.mutate()}>
                                <Download className="h-4 w-4" />
                                {install.isPending ? 'Installing…' : 'Install DiscordSRV'}
                            </Button>
                            {!canInstall && (
                                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                                    Requires: extension.manage + file.create + file.update
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card title="Bot Token" icon={<KeyRound className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            Saves the token to{' '}
                            <span className="font-mono text-[var(--color-ink)]">/plugins/DiscordSRV/.token</span>.
                        </p>
                        <div className="mt-4">
                            <Field label="Bot Token">
                                <Input
                                    type="password"
                                    value={botToken}
                                    onChange={e => setBotToken(e.target.value)}
                                    placeholder="Paste bot token"
                                />
                            </Field>
                        </div>
                        <div className="mt-4">
                            <Button
                                disabled={!canSetToken || saveToken.isPending || botToken.trim().length === 0}
                                onClick={() => saveToken.mutate()}
                            >
                                <KeyRound className="h-4 w-4" />
                                {saveToken.isPending ? 'Saving…' : 'Save Token'}
                            </Button>
                            {!canSetToken && (
                                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                                    Requires: extension.manage + file.create + file.update + file.read-content
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card title="Link Global Chat" icon={<Hash className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            Sets <span className="font-mono text-[var(--color-ink)]">Channels.global</span> in
                            DiscordSRV config.yml.
                        </p>
                        <div className="mt-4">
                            <Field label="Discord Channel ID">
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
                                {saveChannel.isPending ? 'Saving…' : 'Save Channel'}
                            </Button>
                            {!canSetChannel && (
                                <p className="mt-2 text-xs text-[var(--color-ink-faint)]">
                                    Requires: extension.manage + file.update + file.read-content
                                </p>
                            )}
                        </div>
                    </Card>

                    <Card title="Invite Link" icon={<ExternalLink className="h-4 w-4" />}>
                        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                            Discord invite links require the Application Client ID (not the token).
                        </p>
                        <div className="mt-4">
                            <Field label="Application Client ID">
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
                                Open Invite Link
                            </Button>
                        </div>
                    </Card>

                    {isOwner && (
                        <Card title="Revert Changes (Owner Only)" icon={<History className="h-4 w-4" />}>
                            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                                Recent config/token changes made through this extension.
                            </p>
                            {historyQuery.isLoading ? (
                                <div className="flex justify-center py-6">
                                    <Spinner className="h-5 w-5" />
                                </div>
                            ) : (historyQuery.data?.length ?? 0) === 0 ? (
                                <p className="mt-4 text-sm text-[var(--color-ink-faint)]">No snapshots available.</p>
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
                                                Revert
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}

                    {isOwner && (
                        <Card title="Subuser Access (Owner Only)" icon={<Users className="h-4 w-4" />}>
                            <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
                                Enable or disable this extension per subuser.
                            </p>
                            {subusersQuery.isLoading ? (
                                <div className="flex justify-center py-6">
                                    <Spinner className="h-5 w-5" />
                                </div>
                            ) : (subusersQuery.data?.length ?? 0) === 0 ? (
                                <p className="mt-4 text-sm text-[var(--color-ink-faint)]">No subusers.</p>
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
                                                {s.disabled ? 'Enable' : 'Disable'}
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
