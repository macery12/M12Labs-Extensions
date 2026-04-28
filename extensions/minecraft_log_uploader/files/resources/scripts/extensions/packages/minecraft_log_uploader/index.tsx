import { useEffect, useState } from 'react';
import { ServerContext } from '@/state/server';
import PageContentBlock from '@/elements/PageContentBlock';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import Spinner from '@/elements/Spinner';
import { Button } from '@/elements/button';
import { listLogs, getLog, uploadLog, LogFile } from './api';

const FLASH_KEY = 'server:extensions:minecraft_log_uploader';

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
        return new Date(iso).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
        });
    } catch {
        return iso;
    }
}

export default function MinecraftLogUploaderPage() {
    const uuid = ServerContext.useStoreState((s) => s.server.data?.uuid ?? '');
    const { clearFlashes, clearAndAddHttpError, addFlash } = useFlash();

    const [loadingList, setLoadingList] = useState(true);
    const [logs, setLogs] = useState<LogFile[]>([]);

    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [loadingContent, setLoadingContent] = useState(false);
    const [content, setContent] = useState<string | null>(null);
    const [truncated, setTruncated] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [uploadUrl, setUploadUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // ── Load log file list ──────────────────────────────────────────────────────
    useEffect(() => {
        clearFlashes(FLASH_KEY);
        setLoadingList(true);
        listLogs(uuid)
            .then((res) => setLogs(res.logs))
            .catch((err) => clearAndAddHttpError({ key: FLASH_KEY, error: err }))
            .finally(() => setLoadingList(false));
    }, [uuid]);

    // ── Load log content when a file is selected ────────────────────────────────
    useEffect(() => {
        if (!selectedFile) {
            setContent(null);
            setTruncated(false);
            setUploadUrl(null);
            return;
        }

        clearFlashes(FLASH_KEY);
        setLoadingContent(true);
        setContent(null);
        setTruncated(false);
        setUploadUrl(null);
        setCopied(false);

        getLog(uuid, selectedFile)
            .then((res) => {
                setContent(res.content);
                setTruncated(res.truncated);
            })
            .catch((err) => clearAndAddHttpError({ key: FLASH_KEY, error: err }))
            .finally(() => setLoadingContent(false));
    }, [selectedFile]);

    // ── Upload handler ──────────────────────────────────────────────────────────
    const handleUpload = () => {
        if (!selectedFile) return;
        clearFlashes(FLASH_KEY);
        setUploading(true);
        setUploadUrl(null);
        setCopied(false);

        uploadLog(uuid, selectedFile)
            .then((res) => {
                setUploadUrl(res.url);
                addFlash({ key: FLASH_KEY, type: 'success', message: 'Log uploaded to mclo.gs successfully.' });
            })
            .catch((err) => clearAndAddHttpError({ key: FLASH_KEY, error: err }))
            .finally(() => setUploading(false));
    };

    // ── Copy URL handler ────────────────────────────────────────────────────────
    const handleCopy = () => {
        if (!uploadUrl) return;
        navigator.clipboard.writeText(uploadUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    return (
        <PageContentBlock title={'Minecraft Log Uploader'}>
            <FlashMessageRender byKey={FLASH_KEY} className={'mb-4'} />

            <div className={'grid gap-4 lg:grid-cols-3'}>
                {/* ── Log file list ─────────────────────────────────────────── */}
                <div className={'rounded-lg border border-zinc-700 bg-zinc-800 p-4 lg:col-span-1'}>
                    <h2 className={'mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400'}>
                        Log Files
                    </h2>

                    {loadingList ? (
                        <div className={'flex justify-center py-8'}>
                            <Spinner size={'large'} />
                        </div>
                    ) : logs.length === 0 ? (
                        <p className={'text-sm text-zinc-500'}>No log files found in <code>/logs</code>.</p>
                    ) : (
                        <ul className={'space-y-1'}>
                            {logs.map((log) => (
                                <li key={log.name}>
                                    <button
                                        className={[
                                            'w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                            selectedFile === log.name
                                                ? 'bg-blue-600 text-white'
                                                : 'text-zinc-300 hover:bg-zinc-700',
                                        ].join(' ')}
                                        onClick={() => setSelectedFile(log.name)}
                                    >
                                        <span className={'block truncate font-medium'}>{log.name}</span>
                                        <span className={'mt-0.5 block text-xs opacity-70'}>
                                            {formatBytes(log.size)} &middot; {formatDate(log.modified_at)}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* ── Preview + upload ──────────────────────────────────────── */}
                <div className={'flex flex-col gap-4 lg:col-span-2'}>
                    {/* Header bar */}
                    <div className={'flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3'}>
                        <div>
                            {selectedFile ? (
                                <span className={'text-sm font-medium text-zinc-200'}>{selectedFile}</span>
                            ) : (
                                <span className={'text-sm text-zinc-500'}>Select a log file on the left to preview it.</span>
                            )}
                        </div>

                        {selectedFile && (
                            <Button
                                onClick={handleUpload}
                                disabled={uploading || loadingContent}
                                className={'ml-4 shrink-0'}
                            >
                                {uploading ? 'Uploading…' : 'Upload to mclo.gs'}
                            </Button>
                        )}
                    </div>

                    {/* Upload result */}
                    {uploadUrl && (
                        <div className={'flex items-center gap-3 rounded-lg border border-green-700 bg-green-900/30 px-4 py-3'}>
                            <a
                                href={uploadUrl}
                                target={'_blank'}
                                rel={'noopener noreferrer'}
                                className={'flex-1 truncate text-sm text-green-300 underline hover:text-green-200'}
                            >
                                {uploadUrl}
                            </a>
                            <button
                                onClick={handleCopy}
                                className={'shrink-0 rounded border border-green-600 px-2 py-1 text-xs text-green-300 transition hover:bg-green-700 hover:text-white'}
                            >
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    )}

                    {/* Log content preview */}
                    <div className={'relative flex-1 rounded-lg border border-zinc-700 bg-zinc-900'}>
                        {!selectedFile && (
                            <div className={'flex h-64 items-center justify-center text-sm text-zinc-600'}>
                                No file selected
                            </div>
                        )}

                        {selectedFile && loadingContent && (
                            <div className={'flex h-64 items-center justify-center'}>
                                <Spinner size={'large'} />
                            </div>
                        )}

                        {selectedFile && !loadingContent && content !== null && (
                            <>
                                {truncated && (
                                    <div className={'border-b border-zinc-700 px-4 py-2 text-xs text-amber-400'}>
                                        File is large — showing the last 512 KB. Upload sends the full file.
                                    </div>
                                )}
                                <pre
                                    className={[
                                        'overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300',
                                        truncated ? 'max-h-[32rem]' : 'max-h-[40rem]',
                                    ].join(' ')}
                                >
                                    {content || <span className={'text-zinc-600'}>{'(empty file)'}</span>}
                                </pre>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </PageContentBlock>
    );
}
