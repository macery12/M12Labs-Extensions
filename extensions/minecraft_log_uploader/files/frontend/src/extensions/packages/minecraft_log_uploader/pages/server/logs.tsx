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
import {
    Button,
    ConfirmDialog,
    Spinner,
    createTranslator,
    extensionErrorMessage,
    useExtensionQueryKey,
    useExtensionServerContext,
} from '@/extensions-sdk';
import { listLogs, getLog, uploadLog, type LogFile } from '../../api';

/*
 * The log viewer, mounted by the panel as this package's server page.
 * Everything it can reach comes from '@/extensions-sdk', and every colour is a
 * theme variable so the page tracks the active panel theme.
 *
 * Upload is deliberately a two-step action. It publishes server logs to
 * mclo.gs — a third party, outside the panel, readable by anyone holding the
 * link — so the confirmation states that plainly rather than treating "Upload"
 * as a button whose consequences the operator is assumed to know.
 */

const t = createTranslator('minecraft_log_uploader');

/** Cache namespace for this release; an upgrade must not serve an old shape. */
const VERSION = '3.0.0';

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
    const { server } = useExtensionServerContext();
    const uuid = server.uuid;

    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [confirmingUpload, setConfirmingUpload] = useState(false);
    const [uploadTruncated, setUploadTruncated] = useState(false);
    const [uploadUrl, setUploadUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [query, setQuery] = useState('');
    const [levelFilter, setLevelFilter] = useState<'all' | 'warn' | 'error'>('all');
    const [wrap, setWrap] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);

    // Keys are namespaced by extension and version, so an upgrade never serves
    // a previous release's cached shape; the signal cancels an in-flight read
    // when the page unmounts or the selection changes.
    const { data: list, isLoading: loadingList } = useQuery({
        queryKey: useExtensionQueryKey('minecraft_log_uploader', VERSION, 'logs', uuid),
        queryFn: ({ signal }) => listLogs(uuid, signal),
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
        queryKey: useExtensionQueryKey('minecraft_log_uploader', VERSION, 'content', uuid, selectedFile ?? ''),
        queryFn: ({ signal }) => getLog(uuid, selectedFile as string, signal),
        enabled: selectedFile !== null,
    });

    const upload = useMutation({
        mutationFn: () => uploadLog(uuid, selectedFile as string),
        onSuccess: res => {
            setUploadUrl(res.url);
            setUploadTruncated(res.truncated);
            setCopied(false);
            setConfirmingUpload(false);
        },
        onError: () => setConfirmingUpload(false),
    });

    // Reset transient state whenever the selection changes.
    useEffect(() => {
        setUploadUrl(null);
        setUploadTruncated(false);
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
                    <h1 className="text-xl font-semibold text-[var(--color-ink)]">
                        {t('page.title', 'Minecraft Log Uploader')}
                    </h1>
                    <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                        {t(
                            'page.subtitle',
                            'Inspect server logs, and publish one to mclo.gs when you need to share it.',
                        )}
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
                        aria-label={t('picker.aria', 'Select log file')}
                    >
                        {logs.length === 0 && <option value="">{t('picker.empty', 'No log files')}</option>}
                        {logs.map(log => (
                            <option key={log.name} value={log.name}>
                                {t('picker.option', '{name} ({size})', {
                                    name: log.name,
                                    size: formatBytes(log.size),
                                })}
                            </option>
                        ))}
                    </select>
                </div>

                {selectedMeta && (
                    <span className="hidden text-xs text-[var(--color-ink-faint)] sm:inline">
                        {t('meta.summary', '{size} · {modified} · {lines} lines', {
                            size: formatBytes(selectedMeta.size),
                            modified: formatDate(selectedMeta.modified_at),
                            lines: parsed.length.toLocaleString(),
                        })}
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
                            placeholder={t('search.placeholder', 'Search log…')}
                            disabled={!selectedFile}
                            className="w-40 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-7 text-sm text-[var(--color-ink)] focus:border-[var(--brand)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)] disabled:opacity-50"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
                                aria-label={t('search.clear', 'Clear search')}
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Level filter */}
                    <div className="flex overflow-hidden rounded-lg border border-[var(--color-border-strong)]">
                        {(['all', 'warn', 'error'] as const).map(lvl => {
                            const active = levelFilter === lvl;
                            const label =
                                lvl === 'all'
                                    ? t('filter.all', 'All')
                                    : lvl === 'warn'
                                      ? t('filter.warn', 'Warn+')
                                      : t('filter.error', 'Errors');
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
                        title={t('toolbar.wrap', 'Toggle line wrapping')}
                        className={[
                            'rounded-lg border p-1.5 transition-colors disabled:opacity-50',
                            wrap
                                ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-bright)]'
                                : 'border-[var(--color-border-strong)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
                        ].join(' ')}
                        aria-label={t('toolbar.wrap', 'Toggle line wrapping')}
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
                            title={t('toolbar.scrollTop', 'Scroll to top')}
                            className="bg-[var(--color-surface-2)] p-1.5 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
                            aria-label={t('toolbar.scrollTop', 'Scroll to top')}
                        >
                            <ArrowUpToLine className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => scrollTo('bottom')}
                            disabled={!selectedFile}
                            title={t('toolbar.scrollBottom', 'Scroll to bottom')}
                            className="border-l border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-1.5 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-50"
                            aria-label={t('toolbar.scrollBottom', 'Scroll to bottom')}
                        >
                            <ArrowDownToLine className="h-4 w-4" />
                        </button>
                    </div>

                    <Button
                        size="sm"
                        onClick={() => setConfirmingUpload(true)}
                        disabled={!selectedFile || upload.isPending || loadingContent}
                    >
                        <Upload className="h-4 w-4" />
                        {upload.isPending
                            ? t('upload.pending', 'Uploading…')
                            : t('upload.action', 'Upload to mclo.gs')}
                    </Button>
                </div>
            </div>

            {/* ── Upload result / error ── */}
            <ConfirmDialog
                open={confirmingUpload}
                onClose={() => setConfirmingUpload(false)}
                title={t('upload.confirmTitle', 'Publish this log to mclo.gs?')}
                body={t(
                    'upload.confirmBody',
                    'This sends the contents of {file} to mclo.gs, a third-party paste service outside this panel. Anyone with the returned link can read it. Logs often contain IP addresses, usernames and occasionally credentials — obvious tokens are stripped first, but that is best-effort, not a guarantee. Only the last 10 MiB is sent if the file is larger.',
                    { file: selectedFile ?? '' },
                )}
                confirmLabel={t('upload.confirmAction', 'Publish log')}
                cancelLabel={t('upload.cancel', 'Cancel')}
                busy={upload.isPending}
                onConfirm={() => upload.mutate()}
            />

            {upload.isError && (
                <p className="rounded-[var(--radius-card)] border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-danger)]">
                    {extensionErrorMessage(upload.error, t('upload.failed', 'Upload failed. Please try again.'))}
                </p>
            )}
            {uploadUrl && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--color-accent)] bg-[var(--color-surface)] px-4 py-3">
                    {uploadTruncated && (
                        <p className="flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            {t(
                                'upload.truncatedNotice',
                                'The file was larger than 10 MiB, so only its last 10 MiB was published.',
                            )}
                        </p>
                    )}
                    <div className="flex items-center gap-3">
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
                        {copied ? t('upload.copied', 'Copied') : t('upload.copy', 'Copy')}
                    </Button>
                    </div>
                </div>
            )}

            {/* ── Log pane (the focus) ── */}
            <div className="flex h-[calc(100vh-18rem)] min-h-[24rem] flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-canvas)]">
                {logContent?.truncated && (
                    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-warning)]">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        {t(
                            'pane.truncated',
                            'File is large — showing the last 512 KB. Upload publishes the last 10 MiB.',
                        )}
                    </div>
                )}
                {filtering && selectedFile && (
                    <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-1.5 text-xs text-[var(--color-ink-faint)]">
                        <span>
                            {t('pane.filterCount', '{visible} of {total} lines', {
                                visible: visible.length.toLocaleString(),
                                total: parsed.length.toLocaleString(),
                            })}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setQuery('');
                                setLevelFilter('all');
                            }}
                            className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                        >
                            {t('pane.clearFilters', 'Clear filters')}
                        </button>
                    </div>
                )}

                <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
                    {!selectedFile ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                            {loadingList ? <Spinner className="h-6 w-6" /> : t('pane.noSelection', 'No log selected')}
                        </div>
                    ) : loadingContent ? (
                        <div className="flex h-full items-center justify-center">
                            <Spinner className="h-6 w-6" />
                        </div>
                    ) : contentError ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-danger)]">
                            {t('pane.loadFailed', 'Could not load this log file.')}
                        </div>
                    ) : parsed.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                            {t('pane.empty', '(empty file)')}
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-[var(--color-ink-faint)]">
                            {t('pane.noMatches', 'No lines match the current filter.')}
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
