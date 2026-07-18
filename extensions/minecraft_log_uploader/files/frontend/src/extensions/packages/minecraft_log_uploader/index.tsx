import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
    Upload,
    ExternalLink,
    Copy,
    Check,
    AlertTriangle,
    Search,
    WrapText,
    ArrowDownToLine,
    ArrowUpToLine,
    X,
} from 'lucide-react';
import { useServer } from '@/components/server/ServerContext';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { listLogs, getLog, uploadLog, type LogFile } from './api';

// Extension UI: strings are literal English (extensions cannot contribute
// Paraglide messages) and every colour comes from a theme CSS variable so the
// page tracks the active panel theme.

/** Format a file size in bytes to a human-readable string. */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Format an ISO timestamp to a short local date/time string. */
function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
}

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'other';

interface ParsedLine {
    n: number;
    text: string;
    level: LogLevel;
}

// Log levels are conventionally upper-case tokens near the start of a line
// (e.g. `[main/ERROR]`, `[12:00:00] [Server/WARN]`). Only inspect the head of
// the line so message bodies mentioning "error" don't get mis-coloured.
function detectLevel(line: string): LogLevel {
    const head = line.slice(0, 96);
    if (/\b(ERROR|FATAL|SEVERE)\b/.test(head)) return 'error';
    if (/\bWARN(?:ING)?\b/.test(head)) return 'warn';
    if (/\bDEBUG|TRACE\b/.test(head)) return 'debug';
    if (/\bINFO\b/.test(head)) return 'info';
    return 'other';
}

const LEVEL_TEXT: Record<LogLevel, string> = {
    error: 'text-[var(--color-danger)]',
    warn: 'text-[var(--color-warning)]',
    info: 'text-[var(--color-ink-muted)]',
    debug: 'text-[var(--color-ink-faint)]',
    other: 'text-[var(--color-ink-muted)]',
};

const LEVEL_ACCENT: Record<LogLevel, string> = {
    error: 'border-l-[var(--color-danger)]',
    warn: 'border-l-[var(--color-warning)]',
    info: 'border-l-transparent',
    debug: 'border-l-transparent',
    other: 'border-l-transparent',
};

/** Split a line around case-insensitive matches of `query`, wrapping hits in <mark>. */
function highlight(text: string, query: string) {
    if (!query) return text;
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const out: ReactNode[] = [];
    let from = 0;
    let idx = lower.indexOf(q, from);
    let key = 0;
    while (idx !== -1) {
        if (idx > from) out.push(text.slice(from, idx));
        out.push(
            <mark
                key={key++}
                className="rounded-sm bg-[var(--brand-soft)] px-0.5 text-[var(--brand-bright)]"
            >
                {text.slice(idx, idx + q.length)}
            </mark>,
        );
        from = idx + q.length;
        idx = lower.indexOf(q, from);
    }
    if (from < text.length) out.push(text.slice(from));
    return out;
}

export default function MinecraftLogUploaderPage() {
    const server = useServer();
    const uuid = server.uuid;

    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [uploadUrl, setUploadUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [query, setQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<'all' | 'warn' | 'error'>('all');
    const [wrap, setWrap] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    const { data: list, isLoading: loadingList } = useQuery({
        queryKey: ['ext', 'minecraft_log_uploader', uuid, 'logs'],
        queryFn: () => listLogs(uuid),
    });

    const logs: LogFile[] = list?.logs ?? [];

    // Auto-select the first log (usually latest.log) once the list arrives.
    useEffect(() => {
        if (selectedFile === null && logs.length > 0) {
            setSelectedFile(logs[0]!.name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logs.length]);

    const {
        data: logContent,
        isLoading: loadingContent,
        isError: contentError,
    } = useQuery({
        queryKey: ['ext', 'minecraft_log_uploader', uuid, 'content', selectedFile],
        queryFn: () => getLog(uuid, selectedFile as string),
        enabled: selectedFile !== null,
    });

    const upload = useMutation({
        mutationFn: () => uploadLog(uuid, selectedFile as string),
        onSuccess: res => {
            setUploadUrl(res.url);
            setCopied(false);
        },
    });

    // Reset transient state whenever the selection changes.
    useEffect(() => {
        setUploadUrl(null);
        setCopied(false);
        setQuery('');
        setLevelFilter('all');
        upload.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile]);

    const selectedMeta = logs.find(l => l.name === selectedFile) ?? null;

    // Parse once per file into numbered, level-tagged lines.
    const parsed: ParsedLine[] = useMemo(() => {
        const content = logContent?.content ?? '';
        if (!content) return [];
        return content.split(/\r?\n/).map((text, i) => ({ n: i + 1, text, level: detectLevel(text) }));
    }, [logContent?.content]);

    const visible: ParsedLine[] = useMemo(() => {
        const q = query.trim().toLowerCase();
        return parsed.filter(line => {
            if (levelFilter === 'error' && line.level !== 'error') return false;
            if (levelFilter === 'warn' && line.level !== 'error' && line.level !== 'warn') return false;
            if (q && !line.text.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [parsed, query, levelFilter]);

    const gutterWidth = `${Math.max(3, String(parsed.length).length + 1)}ch`;

    const handleCopy = () => {
        if (!uploadUrl) return;
        navigator.clipboard?.writeText(uploadUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const scrollTo = (pos: 'top' | 'bottom') => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: pos === 'top' ? 0 : el.scrollHeight, behavior: 'smooth' });
    };

    const filtering = query.trim() !== '' || levelFilter !== 'all';

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold text-[var(--color-ink)]">Minecraft Log Uploader</h1>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                        Inspect server logs and share them to mclo.gs with one click.
                    </p>
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2">
                {/* File picker */}
                <div className="relative">
                    <select
                        value={selectedFile ?? ''}
                        onChange={e => setSelectedFile(e.target.value || null)}
                        disabled={loadingList || logs.length === 0}
                        className="max-w-[16rem] rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-1.5 pl-3 pr-8 text-sm font-medium text-[var(--color-ink)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50"
                        aria-label="Select log file"
                    >
                        {logs.length === 0 && <option value="">No log files</option>}
                        {logs.map(log => (
                            <option key={log.name} value={log.name}>
                                {log.name} ({formatBytes(log.size)})
                            </option>
                        ))}
                    </select>
                </div>

                {selectedMeta && (
                    <span className="hidden text-xs text-[var(--color-ink-faint)] sm:inline">
                        {formatBytes(selectedMeta.size)} &middot; {formatDate(selectedMeta.modified_at)} &middot;{' '}
                        {parsed.length.toLocaleString()} lines
                    </span>
                )}

                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-ink-faint)]" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search log…"
                            disabled={!selectedFile}
                            className="w-40 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-7 text-sm text-[var(--color-ink)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                                aria-label="Clear search"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Level filter */}
                    <div className="flex overflow-hidden rounded-lg border border-[var(--color-border-strong)]">
                        {(['all', 'warn', 'error'] as const).map(lvl => {
                            const active = levelFilter === lvl;
                            const label = lvl === 'all' ? 'All' : lvl === 'warn' ? 'Warn+' : 'Errors';
                            return (
                                <button
                                    key={lvl}
                                    type="button"
                                    onClick={() => setLevelFilter(lvl)}
                                    disabled={!selectedFile}
                                    className={[
                                        'px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                                        active
                                            ? 'bg-[var(--brand)] text-[var(--color-brand-ink)]'
                                            : 'bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Wrap toggle */}
                    <button
                        type="button"
                        onClick={() => setWrap(w => !w)}
                        disabled={!selectedFile}
                        title="Toggle line wrapping"
                        className={[
                            'rounded-lg border p-1.5 transition-colors disabled:opacity-50',
                            wrap
                                ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-bright)]'
                                : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                        ].join(' ')}
                        aria-label="Toggle line wrapping"
                        aria-pressed={wrap}
                    >
                        <WrapText className="h-4 w-4" />
                    </button>

                    {/* Scroll controls */}
                    <div className="flex overflow-hidden rounded-lg border border-[var(--color-border-strong)]">
                        <button
                            type="button"
                            onClick={() => scrollTo('top')}
                            disabled={!selectedFile}
                            title="Scroll to top"
                            className="bg-[var(--color-surface-2)] p-1.5 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
                            aria-label="Scroll to top"
                        >
                            <ArrowUpToLine className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollTo('bottom')}
                            disabled={!selectedFile}
                            title="Scroll to bottom"
                            className="border-l border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-1.5 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
                            aria-label="Scroll to bottom"
                        >
                            <ArrowDownToLine className="h-4 w-4" />
                        </button>
                    </div>

                    <Button
                        size="sm"
                        onClick={() => upload.mutate()}
                        disabled={!selectedFile || upload.isPending || loadingContent}
                    >
                        <Upload className="h-4 w-4" />
                        {upload.isPending ? 'Uploading…' : 'Upload to mclo.gs'}
                    </Button>
                </div>
            </div>

            {/* ── Upload result / error ── */}
            {upload.isError && (
                <p className="rounded-[var(--radius-card)] border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-danger)]">
                    Upload failed. Please try again.
                </p>
            )}
            {uploadUrl && (
                <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-3">
                    <a
                        href={uploadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm text-[var(--color-accent)] underline hover:opacity-80"
                    >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        <span className="truncate">{uploadUrl}</span>
                    </a>
                    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? 'Copied' : 'Copy'}
                    </Button>
                </div>
            )}

            {/* ── Log pane (the focus) ── */}
            <div className="flex h-[calc(100vh-18rem)] min-h-[24rem] flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-canvas)]">
                {logContent?.truncated && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-warning)]">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        File is large — showing the last 512 KB. Upload sends the full file.
                    </div>
                )}
                {filtering && selectedFile && (
                    <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-1.5 text-xs text-[var(--color-ink-faint)]">
                        <span>
                            {visible.length.toLocaleString()} of {parsed.length.toLocaleString()} lines
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('');
                                setLevelFilter('all');
                            }}
                            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                        >
                            Clear filters
                        </button>
                    </div>
                )}

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
                    {!selectedFile ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                            {loadingList ? <Spinner className="h-6 w-6" /> : 'No log selected'}
                        </div>
                    ) : loadingContent ? (
                        <div className="flex h-full items-center justify-center">
                            <Spinner className="h-6 w-6" />
                        </div>
                    ) : contentError ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-danger)]">
                            Could not load this log file.
                        </div>
                    ) : parsed.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                            (empty file)
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                            No lines match the current filter.
                        </div>
                    ) : (
                        <div className={['py-2 font-mono text-xs leading-relaxed', wrap ? '' : 'w-max min-w-full'].join(' ')}>
                            {visible.map(line => (
                                <div
                                    key={line.n}
                                    className={[
                                        'flex border-l-2 hover:bg-[var(--color-surface)]',
                                        LEVEL_ACCENT[line.level],
                                    ].join(' ')}
                                >
                                    <span
                                        className="shrink-0 select-none border-r border-[var(--color-border)] px-2 text-right text-[var(--color-ink-faint)]"
                                        style={{ width: gutterWidth }}
                                    >
                                        {line.n}
                                    </span>
                                    <span
                                        className={[
                                            'px-3',
                                            wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
                                            LEVEL_TEXT[line.level],
                                        ].join(' ')}
                                    >
                                        {query.trim() ? highlight(line.text, query.trim()) : line.text || ' '}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
