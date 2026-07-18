import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText, Upload, ExternalLink, Copy, Check, AlertTriangle } from 'lucide-react';
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

export default function MinecraftLogUploaderPage() {
    const server = useServer();
    const uuid = server.uuid;

    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [uploadUrl, setUploadUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const {
        data: list,
        isLoading: loadingList,
        isError: listError,
    } = useQuery({
        queryKey: ['ext', 'minecraft_log_uploader', uuid, 'logs'],
        queryFn: () => listLogs(uuid),
    });

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

    // Reset the transient upload result whenever the selection changes.
    useEffect(() => {
        setUploadUrl(null);
        setCopied(false);
        upload.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFile]);

    const logs: LogFile[] = list?.logs ?? [];

    const handleCopy = () => {
        if (!uploadUrl) return;
        navigator.clipboard?.writeText(uploadUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <div>
                <h1 className="text-xl font-semibold text-[var(--color-ink)]">Minecraft Log Uploader</h1>
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                    Preview server logs and share them to mclo.gs with one click.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                {/* Log file list */}
                <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 lg:col-span-1">
                    <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-faint)]">
                        Log Files
                    </h2>

                    {loadingList ? (
                        <div className="flex justify-center py-8">
                            <Spinner className="h-6 w-6" />
                        </div>
                    ) : listError ? (
                        <p className="text-sm text-[var(--color-danger)]">Could not load log files.</p>
                    ) : logs.length === 0 ? (
                        <p className="text-sm text-[var(--color-ink-muted)]">
                            No log files found in <code className="font-mono text-[var(--color-ink)]">/logs</code>.
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {logs.map(log => {
                                const active = selectedFile === log.name;
                                return (
                                    <li key={log.name}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFile(log.name)}
                                            className={[
                                                'w-full rounded-lg px-3 py-2 text-left text-sm transition-colors',
                                                active
                                                    ? 'bg-[var(--brand)] text-[var(--color-brand-ink)]'
                                                    : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]',
                                            ].join(' ')}
                                        >
                                            <span className="block truncate font-medium">{log.name}</span>
                                            <span className="mt-0.5 block text-xs opacity-70">
                                                {formatBytes(log.size)} &middot; {formatDate(log.modified_at)}
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* Preview + upload */}
                <div className="flex flex-col gap-4 lg:col-span-2">
                    <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-4 py-3">
                        {selectedFile ? (
                            <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                                <FileText className="h-4 w-4 shrink-0 text-[var(--color-ink-faint)]" />
                                <span className="truncate">{selectedFile}</span>
                            </span>
                        ) : (
                            <span className="text-sm text-[var(--color-ink-muted)]">
                                Select a log file on the left to preview it.
                            </span>
                        )}

                        {selectedFile && (
                            <Button
                                size="sm"
                                onClick={() => upload.mutate()}
                                disabled={upload.isPending || loadingContent}
                                className="ml-4 shrink-0"
                            >
                                <Upload className="h-4 w-4" />
                                {upload.isPending ? 'Uploading…' : 'Upload to mclo.gs'}
                            </Button>
                        )}
                    </div>

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

                    <div className="relative flex-1 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-canvas)]">
                        {!selectedFile ? (
                            <div className="flex h-64 items-center justify-center text-sm text-[var(--color-ink-faint)]">
                                No file selected
                            </div>
                        ) : loadingContent ? (
                            <div className="flex h-64 items-center justify-center">
                                <Spinner className="h-6 w-6" />
                            </div>
                        ) : contentError ? (
                            <div className="flex h-64 items-center justify-center text-sm text-[var(--color-danger)]">
                                Could not load this log file.
                            </div>
                        ) : logContent ? (
                            <>
                                {logContent.truncated && (
                                    <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-warning)]">
                                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                        File is large — showing the last 512 KB. Upload sends the full file.
                                    </div>
                                )}
                                <pre
                                    className={[
                                        'overflow-auto p-4 font-mono text-xs leading-relaxed text-[var(--color-ink-muted)]',
                                        logContent.truncated ? 'max-h-[32rem]' : 'max-h-[40rem]',
                                    ].join(' ')}
                                >
                                    {logContent.content || (
                                        <span className="text-[var(--color-ink-faint)]">(empty file)</span>
                                    )}
                                </pre>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
