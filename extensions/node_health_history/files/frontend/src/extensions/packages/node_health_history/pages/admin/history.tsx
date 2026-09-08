import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createTranslator, extensionQueryKey } from '@/extensions-sdk';
import { getNodeHealth, type NodeHealth } from '../../api';

// Extension UI: strings are localized through the panel's Paraglide catalog.
// This extension ships message fragments under ../../messages/<locale>.json
// (keys namespaced `ext.node_health_history.*`); the panel merges them into its
// compile input at build time. The SDK translator binds that prefix and takes
// an English fallback, which covers any locale that has not translated a key.
// Every colour is a theme CSS variable.
//
// Every '@/' import is from '@/extensions-sdk'. The installer rejects a package
// that reaches into panel internals, so this is the supported surface.

const t = createTranslator('node_health_history');

// Namespaces the query cache by package version, so an upgrade never serves
// a previous release's cached shape.
const VERSION = '2.0.0';

const RANGES = [
    { key: 'range.24h', fallback: '24 hours', hours: 24 },
    { key: 'range.3d', fallback: '3 days', hours: 72 },
    { key: 'range.7d', fallback: '7 days', hours: 168 },
];

export default function NodeHealthHistoryPage() {
    const [hours, setHours] = useState(24);
    const { data, isLoading, isError } = useQuery({
        queryKey: extensionQueryKey('node_health_history', VERSION, 'history', hours),
        queryFn: () => getNodeHealth(hours),
        refetchInterval: 60_000,
    });

    return (
        <div style={{ padding: '1.5rem', color: 'var(--color-ink)' }}>
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{t('title', 'Node Health History')}</h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--color-ink-muted)', marginTop: '0.25rem' }}>
                        {t('subtitle', 'Reachability and latency of each wings node, sampled on a schedule.')}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {RANGES.map(r => (
                        <button
                            key={r.hours}
                            type="button"
                            onClick={() => setHours(r.hours)}
                            style={{
                                borderRadius: 'var(--radius-card, 8px)',
                                border: '1px solid var(--color-border)',
                                padding: '0.35rem 0.75rem',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                background: hours === r.hours ? 'var(--brand)' : 'var(--color-surface-2)',
                                color: hours === r.hours ? 'var(--color-brand-ink)' : 'var(--color-ink-muted)',
                            }}
                        >
                            {t(r.key, r.fallback)}
                        </button>
                    ))}
                </div>
            </header>

            <div style={{ marginTop: '1.5rem' }}>
                {isLoading && <p style={{ color: 'var(--color-ink-muted)' }}>{t('loading', 'Loading node health…')}</p>}
                {isError && <p style={{ color: 'var(--color-danger)' }}>{t('error', 'Could not load node health. Is the extension enabled and has the poller run yet?')}</p>}
                {data && data.length === 0 && (
                    <p style={{ color: 'var(--color-ink-muted)' }}>
                        {t('empty.before', 'No snapshots recorded yet. The scheduler polls on the configured interval, or run')}
                        <code style={{ margin: '0 0.35rem', color: 'var(--color-ink)' }}>php artisan p:ext:node-health-history:poll</code>
                        {t('empty.after', 'to collect data now.')}
                    </p>
                )}
                {data && data.length > 0 && (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {data.map(node => (
                            <NodeCard key={node.nodeId} node={node} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function NodeCard({ node }: { node: NodeHealth }) {
    const statusColor = node.currentlyHealthy ? 'var(--color-accent)' : 'var(--color-danger)';

    return (
        <section
            style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card, 10px)',
                background: 'var(--color-surface)',
                padding: '1rem',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
                    <span style={{ fontWeight: 600 }}>{node.name}</span>
                    {node.wingsVersion && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-faint)', fontFamily: 'monospace' }}>
                            wings {node.wingsVersion}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
                    <Stat label={t('stat.uptime', 'Uptime')} value={`${node.uptimePercent}%`} />
                    <Stat label={t('stat.latency', 'Latency')} value={node.latestLatencyMs != null ? `${node.latestLatencyMs} ms` : '—'} />
                    <Stat label={t('stat.samples', 'Samples')} value={String(node.sampleCount)} />
                </div>
            </div>
            <LatencyChart node={node} />
        </section>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-ink-faint)' }}>{label}</div>
            <div style={{ color: 'var(--color-ink)', fontWeight: 600 }}>{value}</div>
        </div>
    );
}

// Hand-rolled SVG sparkline: latency line plus per-sample health ticks. No
// chart library is bundled in the panel, so extensions draw their own.
function LatencyChart({ node }: { node: NodeHealth }) {
    const width = 720;
    const height = 90;
    const pad = 6;

    const { linePath, ticks, maxLatency } = useMemo(() => {
        const points = node.series;
        const latencies = points.map(p => p.latencyMs ?? 0);
        const max = Math.max(1, ...latencies);
        const stepX = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

        const coords = points.map((p, i) => {
            const x = pad + i * stepX;
            const y = height - pad - ((p.latencyMs ?? 0) / max) * (height - pad * 2);
            return { x, y, healthy: p.healthy };
        });

        const path = coords
            .filter(c => c.healthy)
            .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
            .join(' ');

        return { linePath: path, ticks: coords, maxLatency: max };
    }, [node.series]);

    return (
        <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
            <svg width={width} height={height} role="img" aria-label={`${t('chartAria', 'Latency history')} — ${node.name}`} style={{ maxWidth: '100%' }}>
                <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="var(--color-border)" strokeWidth={1} />
                {linePath && <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth={1.5} />}
                {ticks.map((pt, i) => (
                    <circle
                        key={i}
                        cx={pt.x}
                        cy={pt.healthy ? pt.y : height - pad}
                        r={2}
                        fill={pt.healthy ? 'var(--color-accent)' : 'var(--color-danger)'}
                    />
                ))}
                <text x={pad} y={12} fontSize={10} fill="var(--color-ink-faint)">
                    {t('peak', 'peak')} {maxLatency} ms
                </text>
            </svg>
        </div>
    );
}
