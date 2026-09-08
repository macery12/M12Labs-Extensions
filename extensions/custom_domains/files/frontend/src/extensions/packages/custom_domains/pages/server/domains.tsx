import {
    Button,
    ConfirmDialog,
    Spinner,
    createTranslator,
    extensionErrorMessage,
    notify,
    useExtensionQueryKey,
    useExtensionServerContext,
} from '@/extensions-sdk';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, Copy, RefreshCw, AlertTriangle } from 'lucide-react';
import {
    getCustomDomains,
    syncCustomDomains,
    deleteCustomDomain,
    type CustomDomainMapping,
    type DomainStatus,
} from '../../api';
import { AddDomainModal } from '../../components/AddDomainModal';
import { CustomDomainsHelp } from '../../components/ServerDomainsHelp';

const t = createTranslator('custom_domains');

const VERSION = '1.0.0';

const STATUS_TOKEN: Record<DomainStatus, string> = {
    active: 'var(--color-accent)',
    pending: 'var(--color-warning)',
    failed: 'var(--color-danger)',
};

function StatusBadge({ status }: { status: DomainStatus }) {
    const token = STATUS_TOKEN[status];
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: `color-mix(in srgb, ${token} 15%, transparent)`, color: token }}
        >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: token }} />
            {t(`server.status.${status}`, status)}
        </span>
    );
}

export default function ServerCustomDomainsPage() {
    // The SDK hands a package its server plus the viewer's permissions on it.
    // Hiding a control is not authorization — the FormRequest behind each call
    // is — so this only avoids showing buttons that would 403.
    const { server, can } = useExtensionServerContext();
    const canManage = can('allocation.update');

    const qc = useQueryClient();
    // Namespaced by extension and version, so an upgrade never serves a
    // previous release's cached shape.
    const key = useExtensionQueryKey('custom_domains', VERSION, 'mappings', server.id);

    const { data, isLoading, isError } = useQuery({
        queryKey: key,
        queryFn: ({ signal }) => getCustomDomains(server.uuid, signal),
    });

    const [adding, setAdding] = useState(false);
    const [toDelete, setToDelete] = useState<CustomDomainMapping | null>(null);

    const mappings = data ?? [];
    const primaryPort = server.allocations.find(a => a.isDefault)?.port ?? server.allocations[0]?.port ?? 0;
    const invalidate = () => qc.invalidateQueries({ queryKey: key });

    const sync = useMutation({
        mutationFn: () => syncCustomDomains(server.uuid),
        onSuccess: () => {
            notify('success', t('server.syncQueued', 'Re-sync queued.'));
            invalidate();
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    const remove = useMutation({
        mutationFn: (id: number) => deleteCustomDomain(server.uuid, id),
        onSuccess: () => {
            notify('success', t('server.deleted', 'Custom domain removed.'));
            setToDelete(null);
            invalidate();
        },
        onError: err => notify('error', extensionErrorMessage(err, t('common.states.genericError', 'Something went wrong. Please try again.'))),
    });

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            notify('success', t('server.copied', 'Copied to clipboard.'));
        } catch {
            notify('error', t('common.states.genericError', 'Something went wrong. Please try again.'));
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-[var(--color-ink)]">{t('server.title', 'Custom Domains')}</h1>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t('server.subtitle', 'Point a friendly domain at this server so players don\'t need the IP and port.')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <CustomDomainsHelp />
                    {canManage && (
                        <>
                            <Button
                                variant="outline"
                                onClick={() => sync.mutate()}
                                disabled={sync.isPending || mappings.length === 0}
                            >
                                {sync.isPending ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                                {t('server.resync', 'Re-sync')}
                            </Button>
                            <Button onClick={() => setAdding(true)}>
                                <Plus className="h-4 w-4" />
                                {t('server.add.action', 'Add domain')}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]">
                {isLoading ? (
                    <div className="flex justify-center py-14">
                        <Spinner className="h-5 w-5" />
                    </div>
                ) : isError ? (
                    <p className="px-4 py-10 text-center text-sm text-[var(--color-danger)]">
                        {t('server.loadError', 'Couldn\'t load custom domains.')}
                    </p>
                ) : mappings.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
                        <Globe className="h-8 w-8 text-[var(--color-ink-faint)]" />
                        <p className="text-sm text-[var(--color-ink-muted)]">{t('server.empty', 'No custom domains yet. Add one to give players a friendly address.')}</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-[var(--color-border)]">
                        {mappings.map(row => (
                            <li key={row.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-mono text-sm text-[var(--color-ink)]">{row.fullDomain}</span>
                                        <StatusBadge status={row.status} />
                                        <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                                            {t(`server.recordType.${row.recordType}`, row.recordType)}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                                        {t('server.connectVia', 'Connect via {address}', { address: `${row.fullDomain}:${row.port}` })}
                                    </p>
                                    {row.status === 'failed' && row.lastError && (
                                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--color-danger)]">
                                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                            <span className="min-w-0">{row.lastError}</span>
                                        </p>
                                    )}
                                    {row.lastSyncedAt && (
                                        <p className="mt-1 text-[11px] text-[var(--color-ink-faint)]">
                                            {t('server.lastSynced', 'Last synced {time}', {
                                                time: new Date(row.lastSyncedAt).toLocaleString(),
                                            })}
                                        </p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('server.copy', 'Copy address')}
                                        onClick={() => copy(row.fullDomain)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    {canManage && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={t('common.actions.delete', 'Delete')}
                                            className="text-[var(--color-danger)]"
                                            onClick={() => setToDelete(row)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {adding && (
                <AddDomainModal
                    uuid={server.uuid}
                    port={primaryPort}
                    onClose={() => setAdding(false)}
                    onSaved={() => setAdding(false)}
                />
            )}

            <ConfirmDialog
                open={!!toDelete}
                onClose={() => setToDelete(null)}
                title={t('server.deleteTitle', 'Remove custom domain')}
                body={t('server.deleteBody', 'Remove {domain}? Its DNS records will be deleted.', { domain: toDelete?.fullDomain ?? '' })}
                confirmLabel={t('common.actions.delete', 'Delete')}
                cancelLabel={t('common.actions.cancel', 'Cancel')}
                busy={remove.isPending}
                onConfirm={() => toDelete && remove.mutate(toDelete.id)}
            />
        </div>
    );
}
