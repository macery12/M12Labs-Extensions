import { Ban, Check, LoaderCircle, Pause, X, Zap } from 'lucide-react';
import { DataTable, type DataTableColumn, cn, createTranslator } from '@/extensions-sdk';
import type { AiLogEntry } from '../../adminApi';
import { sourceChip, sourceLabel, sourceTone } from '../sources';

const t = createTranslator('ai');

// Shared request-log table used by the overview (recent 10) and the Logs tab
// (filtered, up to 500). Cached responses carry a lightning badge — they cost
// no tokens and return near-instantly.
export function LogTable({ logs, loading }: { logs: AiLogEntry[]; loading: boolean }) {
    const columns: DataTableColumn<AiLogEntry>[] = [
        {
            id: 'time',
            header: t('admin.logs.time', 'Time'),
            cellClassName: 'whitespace-nowrap font-mono text-[var(--color-ink-faint)]',
            cell: log => (
                <>
                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    <span className="ml-1.5 opacity-60">
                        {new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                </>
            ),
        },
        {
            id: 'user',
            header: t('admin.logs.user', 'User'),
            cellClassName: 'text-[var(--color-ink)]',
            cell: log => log.username,
        },
        {
            id: 'server',
            header: t('admin.logs.server', 'Server'),
            cellClassName: 'max-w-[10rem] truncate text-[var(--color-ink-muted)]',
            cell: log => log.server_name ?? '—',
        },
        {
            id: 'model',
            header: t('admin.logs.model', 'Model'),
            cellClassName: 'font-mono text-[var(--color-ink-muted)]',
            cell: log => log.model,
        },
        {
            id: 'source',
            header: t('admin.logs.source', 'Source'),
            cell: log => (
                <span
                    className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        sourceChip[sourceTone(log.source)],
                    )}
                >
                    {sourceLabel(log.source)}
                </span>
            ),
        },
        {
            id: 'tokens',
            header: t('admin.logs.tokens', 'Tokens'),
            cellClassName: 'font-mono tabular-nums text-[var(--color-ink-muted)]',
            cell: log => log.total_tokens ?? '—',
        },
        {
            id: 'latency',
            header: t('admin.logs.latency', 'Latency'),
            cellClassName: 'whitespace-nowrap font-mono tabular-nums text-[var(--color-ink-muted)]',
            cell: log => (
                <>
                    {log.latency_ms != null ? `${log.latency_ms}ms` : '—'}
                    {log.cached && (
                        <span
                            title={t('admin.logs.cachedHint', 'Served from the response cache — no tokens used.')}
                            className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-[var(--color-accent)]/15 px-1 py-0.5 text-[10px] font-semibold text-[var(--color-accent)]"
                        >
                            <Zap className="h-2.5 w-2.5" />
                            {t('admin.logs.cached', 'cached')}
                        </span>
                    )}
                </>
            ),
        },
        {
            id: 'status',
            header: t('admin.logs.status', 'Status'),
            cell: log => <StatusIcon log={log} />,
        },
    ];

    return (
        <DataTable
            columns={columns}
            rows={logs}
            rowKey={log => log.id}
            loading={loading}
            loadingLabel={t('admin.logs.title', 'Request log')}
            empty={t('admin.logs.empty', 'No records match your filters.')}
            virtualize={logs.length > 50}
            maxHeight={logs.length > 50 ? 520 : undefined}
        />
    );
}

function StatusIcon({ log }: { log: AiLogEntry }) {
    const labels = {
        success: t('admin.logs.statusSuccess', 'Success'),
        error: t('admin.logs.statusError', 'Error'),
        running: t('admin.logs.statusRunning', 'Running'),
        suspended: t('admin.logs.statusSuspended', 'Suspended'),
        cancelled: t('admin.logs.statusCancelled', 'Cancelled'),
    };
    const label = log.status === 'error' && log.error_message
        ? `${labels.error}: ${log.error_message}`
        : labels[log.status];

    return (
        <span title={label} aria-label={label}>
            {log.status === 'success' && <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" />}
            {log.status === 'error' && <X className="h-3.5 w-3.5 text-[var(--color-danger)]" />}
            {log.status === 'running' && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[var(--brand)]" />}
            {log.status === 'suspended' && <Pause className="h-3.5 w-3.5 text-[var(--color-warning)]" />}
            {log.status === 'cancelled' && <Ban className="h-3.5 w-3.5 text-[var(--color-ink-faint)]" />}
        </span>
    );
}
