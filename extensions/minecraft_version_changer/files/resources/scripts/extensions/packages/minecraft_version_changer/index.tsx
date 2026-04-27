import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ServerContext } from '@/state/server';
import PageContentBlock from '@/elements/PageContentBlock';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import Spinner from '@/elements/Spinner';
import { Button } from '@/elements/button';
import { usePermissions } from '@/plugins/usePermissions';
import {
    getVersionChangerStatus,
    getVersions,
    getBuilds,
    createBackup,
    switchVersion,
    ServerStatus,
    VersionEntry,
    BuildInfo,
    BuildEntry,
    SwitchPayload,
    SwitchResult,
    BackupResult,
} from './api';

const FLASH_KEY = 'server:extensions:minecraft_version_changer';

const LOADER_LABELS: Record<string, string> = {
    vanilla:  'Vanilla',
    paper:    'Paper',
    fabric:   'Fabric',
    forge:    'Forge',
    neoforge: 'NeoForge',
    quilt:    'Quilt',
    purpur:   'Purpur',
    folia:    'Folia',
    spigot:   'Spigot',
    bukkit:   'Bukkit',
};

const SUPPORTED_LOADERS = ['vanilla', 'paper', 'fabric', 'forge'] as const;

type SupportedLoader = typeof SUPPORTED_LOADERS[number];

// ─── Utility ──────────────────────────────────────────────────────────────────

function compareMcVersions(a: string, b: string): number {
    const parse = (v: string) => v.split('.').map(Number);
    const pa = parse(a);
    const pb = parse(b);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

function isDowngrade(from: string | null | undefined, to: string | null | undefined): boolean {
    if (!from || !to) return false;
    return compareMcVersions(to, from) < 0;
}

// ─── Small presentational components ─────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className={'mb-3'}>
            <h2 className={'text-xs font-semibold uppercase tracking-wider text-zinc-400'}>{title}</h2>
            {subtitle && <p className={'mt-0.5 text-xs text-zinc-500'}>{subtitle}</p>}
        </div>
    );
}

function Badge({ children, color = 'zinc' }: { children: ReactNode; color?: 'zinc' | 'blue' | 'yellow' | 'green' | 'red' | 'orange' }) {
    const classes: Record<string, string> = {
        zinc:   'border-zinc-600 bg-zinc-800 text-zinc-300',
        blue:   'border-blue-800 bg-blue-900/40 text-blue-300',
        yellow: 'bg-yellow-600/80 text-yellow-100',
        green:  'border-green-700 bg-green-900/40 text-green-300',
        red:    'border-red-800 bg-red-900/40 text-red-300',
        orange: 'border-orange-700 bg-orange-900/40 text-orange-300',
    };
    return (
        <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${classes[color]}`}>
            {children}
        </span>
    );
}

function InfoBox({ type, children }: { type: 'info' | 'warning' | 'error'; children: ReactNode }) {
    const styles: Record<string, string> = {
        info:    'border-blue-800/60 bg-blue-900/20 text-blue-200',
        warning: 'border-yellow-700/60 bg-yellow-900/20 text-yellow-200',
        error:   'border-red-700/60 bg-red-900/20 text-red-200',
    };
    const icons: Record<string, string> = { info: 'ℹ', warning: '⚠', error: '✕' };
    return (
        <div className={`flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${styles[type]}`}>
            <span className={'flex-shrink-0 font-bold'}>{icons[type]}</span>
            <span>{children}</span>
        </div>
    );
}

// ─── Loader picker card ───────────────────────────────────────────────────────

function LoaderCard({
    loader,
    selected,
    onClick,
}: {
    loader: SupportedLoader;
    selected: boolean;
    onClick: () => void;
}) {
    const icons: Record<SupportedLoader, string> = {
        vanilla: '🟩',
        paper:   '📄',
        fabric:  '🧵',
        forge:   '⚒',
    };
    const descs: Record<SupportedLoader, string> = {
        vanilla: 'Official Mojang release',
        paper:   'High-performance fork',
        fabric:  'Lightweight mod loader',
        forge:   'Full-featured mod loader',
    };
    return (
        <button
            type={'button'}
            onClick={onClick}
            className={[
                'flex w-full flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-center transition-all',
                selected
                    ? 'border-blue-500 bg-blue-900/20 ring-1 ring-blue-500'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:bg-zinc-800/60',
            ].join(' ')}
        >
            <span className={'text-2xl'}>{icons[loader]}</span>
            <span className={'text-sm font-semibold text-white'}>{LOADER_LABELS[loader]}</span>
            <span className={'text-[10px] text-zinc-400'}>{descs[loader]}</span>
        </button>
    );
}

// ─── Build list item ──────────────────────────────────────────────────────────

function BuildRow({
    build,
    selected,
    onClick,
}: {
    build: BuildEntry;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <div
            role={'radio'}
            aria-checked={selected}
            tabIndex={0}
            onClick={onClick}
            onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') onClick(); }}
            className={[
                'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-all',
                selected
                    ? 'border-zinc-600 bg-zinc-700/40 border-l-2 border-l-blue-500'
                    : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50',
            ].join(' ')}
        >
            <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border-2 ${selected ? 'border-blue-500 bg-blue-500' : 'border-zinc-500'}`}>
                {selected && <span className={'h-1.5 w-1.5 rounded-full bg-white'} />}
            </span>
            <div className={'min-w-0 flex-1'}>
                <div className={'flex flex-wrap items-center gap-1.5'}>
                    <span className={'text-sm font-medium text-white'}>{build.label}</span>
                    {build.promoted && <Badge color={'yellow'}>Stable</Badge>}
                    {build.stable && <Badge color={'green'}>Stable</Badge>}
                    {build.type === 'recommended' && <Badge color={'yellow'}>Recommended</Badge>}
                    {build.type === 'latest' && <Badge color={'zinc'}>Latest</Badge>}
                </div>
                {build.time && (
                    <p className={'text-[10px] text-zinc-500'}>
                        {new Date(build.time).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Changelog section ────────────────────────────────────────────────────────

function ChangelogPreview({
    loader,
    builds,
    selectedBuild,
}: {
    loader: SupportedLoader;
    builds: BuildInfo | null;
    selectedBuild: string | number | null;
}) {
    if (!builds) return null;

    const build = builds.builds.find(b => String(b.id) === String(selectedBuild));
    const changes = build?.changes ?? [];

    return (
        <div className={'space-y-2'}>
            {loader === 'vanilla' && (
                <div className={'text-xs text-zinc-400'}>
                    <p>
                        Release type: <span className={'font-medium text-zinc-200'}>{builds.type ?? 'release'}</span>
                    </p>
                    {builds.releaseTime && (
                        <p className={'mt-0.5'}>
                            Released:{' '}
                            <span className={'font-medium text-zinc-200'}>
                                {new Date(builds.releaseTime).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </span>
                        </p>
                    )}
                    <p className={'mt-2'}>
                        <a
                            href={`https://www.minecraft.net/en-us/article/minecraft-java-edition-${String(builds.mcVersion).replace(/\./g, '-')}`}
                            target={'_blank'}
                            rel={'noopener noreferrer'}
                            className={'text-blue-400 underline hover:text-blue-300'}
                        >
                            View release notes on minecraft.net ↗
                        </a>
                    </p>
                </div>
            )}

            {loader === 'paper' && changes.length > 0 && (
                <ul className={'space-y-1'}>
                    {changes.map((c, i) => (
                        <li key={i} className={'flex gap-2 text-xs text-zinc-300'}>
                            <span className={'mt-0.5 flex-shrink-0 text-zinc-500'}>•</span>
                            <span>{c}</span>
                        </li>
                    ))}
                </ul>
            )}

            {loader === 'paper' && changes.length === 0 && (
                <p className={'text-xs text-zinc-500'}>No change notes for this build.</p>
            )}

            {loader === 'fabric' && (
                <div className={'text-xs text-zinc-400'}>
                    <p>
                        Fabric Loader:{' '}
                        <span className={'font-medium text-zinc-200'}>{builds.loaderVersion ?? '—'}</span>
                    </p>
                    <p className={'mt-0.5'}>
                        Installer:{' '}
                        <span className={'font-medium text-zinc-200'}>{builds.installerVersion ?? '—'}</span>
                    </p>
                    <p className={'mt-2'}>
                        <a
                            href={'https://fabricmc.net/use/server/'}
                            target={'_blank'}
                            rel={'noopener noreferrer'}
                            className={'text-blue-400 underline hover:text-blue-300'}
                        >
                            Fabric release notes ↗
                        </a>
                    </p>
                </div>
            )}

            {loader === 'forge' && (
                <div className={'text-xs text-zinc-400'}>
                    <p>
                        Forge version:{' '}
                        <span className={'font-medium text-zinc-200'}>{selectedBuild ?? '—'}</span>
                    </p>
                    {builds.recommended && (
                        <p className={'mt-0.5'}>Recommended: <span className={'font-medium text-zinc-200'}>{builds.recommended}</span></p>
                    )}
                    {builds.latest && (
                        <p className={'mt-0.5'}>Latest: <span className={'font-medium text-zinc-200'}>{builds.latest}</span></p>
                    )}
                    <p className={'mt-2'}>
                        <a
                            href={`https://files.minecraftforge.net/net/minecraftforge/forge/index_${builds.mcVersion}.html`}
                            target={'_blank'}
                            rel={'noopener noreferrer'}
                            className={'text-blue-400 underline hover:text-blue-300'}
                        >
                            Forge changelog page ↗
                        </a>
                    </p>
                    <InfoBox type={'info'}>
                        <strong>Forge note:</strong> This downloads the Forge installer jar. Your server startup variable will be updated to point to it. Forge will finish its server setup on the next start.
                    </InfoBox>
                </div>
            )}
        </div>
    );
}

// ─── Compatibility warnings ───────────────────────────────────────────────────

function CompatibilityWarnings({
    status,
    targetLoader,
    targetVersion,
}: {
    status: ServerStatus;
    targetLoader: SupportedLoader;
    targetVersion: string | null;
}) {
    const warnings: ReactNode[] = [];

    // Downgrade warning
    if (status.currentVersion && targetVersion && isDowngrade(status.currentVersion, targetVersion)) {
        warnings.push(
            <InfoBox key={'downgrade'} type={'warning'}>
                <strong>Downgrade detected:</strong> Switching from {status.currentVersion} to {targetVersion} may cause world corruption. Minecraft worlds cannot reliably be downgraded. Create a backup first.
            </InfoBox>,
        );
    }

    // Loader switch warnings
    const currentLoader = status.detectedLoader;
    if (currentLoader && currentLoader !== targetLoader) {
        if ((currentLoader === 'paper' || currentLoader === 'purpur' || currentLoader === 'spigot') && targetLoader === 'vanilla') {
            warnings.push(
                <InfoBox key={'loader-switch'} type={'warning'}>
                    <strong>Loader change:</strong> Switching from {LOADER_LABELS[currentLoader] ?? currentLoader} to Vanilla will disable all plugins. Plugin data in your plugins/ folder will remain but won't load.
                </InfoBox>,
            );
        }
        if ((currentLoader === 'paper' || currentLoader === 'vanilla') && (targetLoader === 'fabric' || targetLoader === 'forge')) {
            warnings.push(
                <InfoBox key={'to-modded'} type={'warning'}>
                    <strong>Switching to modded:</strong> Switching to {LOADER_LABELS[targetLoader]} requires adding mods separately. Your existing world and server.properties will carry over.
                </InfoBox>,
            );
        }
        if ((currentLoader === 'fabric' || currentLoader === 'forge') && (targetLoader === 'paper' || targetLoader === 'vanilla')) {
            warnings.push(
                <InfoBox key={'from-modded'} type={'warning'}>
                    <strong>Switching from modded:</strong> Mod-specific blocks or entities in your world may become corrupted or disappear when switching to {LOADER_LABELS[targetLoader]}.
                </InfoBox>,
            );
        }
    }

    // Data safety reminder
    warnings.push(
        <InfoBox key={'safety'} type={'info'}>
            The new jar will be downloaded to your server directory and the startup variable updated. Your existing world data and configuration files will not be deleted.
        </InfoBox>,
    );

    return <div className={'space-y-2'}>{warnings}</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MinecraftVersionChanger() {
    const uuid = ServerContext.useStoreState(s => s.server.data?.uuid);

    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();

    const [canRead]   = usePermissions('startup.read');
    const [canUpdate] = usePermissions('startup.update');
    const [canBackup] = usePermissions('backup.create');

    // ── Data state ────────────────────────────────────────────────────────────
    const [loading, setLoading]           = useState(true);
    const [status, setStatus]             = useState<ServerStatus | null>(null);

    const [selectedLoader, setSelectedLoader]         = useState<SupportedLoader | null>(null);
    const [showSnapshots, setShowSnapshots]           = useState(false);

    const [versionsLoading, setVersionsLoading]       = useState(false);
    const [versions, setVersions]                     = useState<VersionEntry[]>([]);
    const [selectedMcVersion, setSelectedMcVersion]   = useState<string | null>(null);

    const [buildsLoading, setBuildsLoading]           = useState(false);
    const [builds, setBuilds]                         = useState<BuildInfo | null>(null);
    const [selectedBuild, setSelectedBuild]           = useState<string | number | null>(null);

    const [backupLoading, setBackupLoading]           = useState(false);
    const [backupResult, setBackupResult]             = useState<BackupResult | null>(null);

    const [switching, setSwitching]                   = useState(false);
    const [switchResult, setSwitchResult]             = useState<SwitchResult | null>(null);

    // ── Load server status ────────────────────────────────────────────────────
    useEffect(() => {
        if (!uuid) return;
        setLoading(true);
        clearFlashes(FLASH_KEY);
        getVersionChangerStatus(uuid)
            .then(s => {
                setStatus(s);
                // Pre-select the current loader if it's one of the 4 supported ones
                if (s.detectedLoader && (SUPPORTED_LOADERS as readonly string[]).includes(s.detectedLoader)) {
                    setSelectedLoader(s.detectedLoader as SupportedLoader);
                }
            })
            .catch(err => clearAndAddHttpError({ key: FLASH_KEY, error: err }))
            .finally(() => setLoading(false));
    }, [uuid]);

    // ── Load versions when loader changes ─────────────────────────────────────
    useEffect(() => {
        if (!uuid || !selectedLoader) return;
        setVersionsLoading(true);
        setVersions([]);
        setSelectedMcVersion(null);
        setBuilds(null);
        setSelectedBuild(null);
        setSwitchResult(null);
        clearFlashes(FLASH_KEY);

        getVersions(uuid, selectedLoader, showSnapshots)
            .then(setVersions)
            .catch(err => clearAndAddHttpError({ key: FLASH_KEY, error: err }))
            .finally(() => setVersionsLoading(false));
    }, [uuid, selectedLoader, showSnapshots]);

    // ── Load builds when version changes ──────────────────────────────────────
    useEffect(() => {
        if (!uuid || !selectedLoader || !selectedMcVersion) return;
        setBuildsLoading(true);
        setBuilds(null);
        setSelectedBuild(null);
        setSwitchResult(null);
        clearFlashes(FLASH_KEY);

        getBuilds(uuid, selectedLoader, selectedMcVersion)
            .then(b => {
                setBuilds(b);
                // Auto-select the first build
                if (b.builds.length > 0) {
                    setSelectedBuild(b.builds[0].id);
                } else if (selectedLoader === 'fabric' && b.loaderVersion) {
                    setSelectedBuild(b.loaderVersion);
                }
            })
            .catch(err => clearAndAddHttpError({ key: FLASH_KEY, error: err }))
            .finally(() => setBuildsLoading(false));
    }, [uuid, selectedLoader, selectedMcVersion]);

    // ── Permission guard ──────────────────────────────────────────────────────
    if (!canRead) {
        return (
            <PageContentBlock title={'Minecraft Version Changer'}>
                <div className={'rounded-xl border border-zinc-700 bg-zinc-800 p-6'}>
                    <p className={'text-zinc-200'}>You do not have permission to view startup configuration.</p>
                    <p className={'mt-2 text-sm text-zinc-400'}>Required: <span className={'font-mono text-zinc-300'}>startup.read</span></p>
                </div>
            </PageContentBlock>
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    const buildSwitchPayload = (): SwitchPayload | null => {
        if (!selectedLoader || !selectedMcVersion) return null;

        const base = { loader: selectedLoader, mc_version: selectedMcVersion };

        switch (selectedLoader) {
            case 'paper':
                if (!selectedBuild) return null;
                return { ...base, build: Number(selectedBuild) };
            case 'fabric':
                if (!builds?.loaderVersion || !builds?.installerVersion) return null;
                return { ...base, loader_version: builds.loaderVersion, installer_version: builds.installerVersion };
            case 'forge':
                if (!selectedBuild) return null;
                return { ...base, forge_version: String(selectedBuild) };
            case 'vanilla':
                return base;
            default:
                return null;
        }
    };

    const readyToSwitch = buildSwitchPayload() !== null;

    const handleBackup = async () => {
        if (!uuid) return;
        setBackupLoading(true);
        clearFlashes(FLASH_KEY);
        try {
            const result = await createBackup(uuid);
            setBackupResult(result);
            addFlash({ key: FLASH_KEY, type: 'success', message: `Backup "${result.name}" started successfully.` });
        } catch (err) {
            clearAndAddHttpError({ key: FLASH_KEY, error: err });
        } finally {
            setBackupLoading(false);
        }
    };

    const handleSwitch = async () => {
        if (!uuid) return;
        const payload = buildSwitchPayload();
        if (!payload) return;

        setSwitching(true);
        clearFlashes(FLASH_KEY);
        try {
            const result = await switchVersion(uuid, payload);
            setSwitchResult(result);
            // Refresh status to reflect the change
            getVersionChangerStatus(uuid).then(setStatus).catch(() => null);
            addFlash({ key: FLASH_KEY, type: 'success', message: `Switched to ${LOADER_LABELS[result.loader] ?? result.loader} ${result.mcVersion}. Restart your server to apply the change.` });
        } catch (err) {
            clearAndAddHttpError({ key: FLASH_KEY, error: err });
        } finally {
            setSwitching(false);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <PageContentBlock title={'Minecraft Version Changer'}>
            <FlashMessageRender byKey={FLASH_KEY} className={'mb-4'} />

            {loading && (
                <div className={'flex items-center justify-center py-12'}>
                    <Spinner size={'large'} />
                </div>
            )}

            {!loading && (
                <div className={'space-y-4'}>

                    {/* ── Current Status ───────────────────────────────────────── */}
                    {status && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader title={'Current Server'} />
                            </div>
                            <div className={'flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3'}>
                                <div>
                                    <p className={'text-[10px] font-semibold uppercase tracking-wider text-zinc-500'}>Egg</p>
                                    <p className={'mt-0.5 text-sm text-zinc-200'}>{status.eggName}</p>
                                </div>
                                <div>
                                    <p className={'text-[10px] font-semibold uppercase tracking-wider text-zinc-500'}>Loader</p>
                                    <p className={'mt-0.5 text-sm text-zinc-200'}>
                                        {status.detectedLoader ? (LOADER_LABELS[status.detectedLoader] ?? status.detectedLoader) : '—'}
                                    </p>
                                </div>
                                <div>
                                    <p className={'text-[10px] font-semibold uppercase tracking-wider text-zinc-500'}>Version</p>
                                    <p className={'mt-0.5 text-sm text-zinc-200'}>{status.currentVersion ?? '—'}</p>
                                </div>
                                <div>
                                    <p className={'text-[10px] font-semibold uppercase tracking-wider text-zinc-500'}>Jar file</p>
                                    <p className={'mt-0.5 font-mono text-xs text-zinc-300'}>{status.currentJar ?? '—'}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Loader picker ─────────────────────────────────────────── */}
                    <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                        <div className={'border-b border-zinc-700 px-4 py-3'}>
                            <SectionHeader
                                title={'Step 1 — Choose Loader'}
                                subtitle={'Select the server software you want to switch to.'}
                            />
                        </div>
                        <div className={'grid grid-cols-2 gap-3 p-4 sm:grid-cols-4'}>
                            {SUPPORTED_LOADERS.map(l => (
                                <LoaderCard
                                    key={l}
                                    loader={l}
                                    selected={selectedLoader === l}
                                    onClick={() => setSelectedLoader(l)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* ── Version picker ────────────────────────────────────────── */}
                    {selectedLoader && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'flex items-center justify-between border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader
                                    title={'Step 2 — Choose Minecraft Version'}
                                    subtitle={`Available versions for ${LOADER_LABELS[selectedLoader]}`}
                                />
                                {(selectedLoader === 'vanilla') && (
                                    <label className={'flex cursor-pointer items-center gap-2 text-xs text-zinc-400'}>
                                        <input
                                            type={'checkbox'}
                                            checked={showSnapshots}
                                            onChange={e => setShowSnapshots(e.target.checked)}
                                            className={'accent-blue-500'}
                                        />
                                        Show snapshots
                                    </label>
                                )}
                            </div>
                            <div className={'p-4'}>
                                {versionsLoading && (
                                    <div className={'flex items-center gap-2 text-xs text-zinc-400'}>
                                        <Spinner size={'small'} />
                                        <span>Loading versions…</span>
                                    </div>
                                )}
                                {!versionsLoading && versions.length === 0 && (
                                    <p className={'text-xs text-zinc-500'}>No versions found.</p>
                                )}
                                {!versionsLoading && versions.length > 0 && (
                                    <div className={'flex items-center gap-3'}>
                                        <select
                                            value={selectedMcVersion ?? ''}
                                            onChange={e => setSelectedMcVersion(e.target.value || null)}
                                            className={[
                                                'w-full max-w-xs rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white',
                                                'focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                                            ].join(' ')}
                                        >
                                            <option value={''}>— Select a version —</option>
                                            {versions.map(v => (
                                                <option key={v.id} value={v.id}>
                                                    {v.id}{v.type && v.type !== 'release' ? ` (${v.type})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedMcVersion && (
                                            <span className={'text-xs text-zinc-400'}>
                                                {versions.find(v => v.id === selectedMcVersion)?.releaseTime
                                                    ? new Date(versions.find(v => v.id === selectedMcVersion)!.releaseTime!).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                                                    : null}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Build / variant picker ────────────────────────────────── */}
                    {selectedLoader && selectedMcVersion && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader
                                    title={'Step 3 — Choose Build'}
                                    subtitle={
                                        selectedLoader === 'fabric'
                                            ? 'The latest stable Fabric loader is auto-selected.'
                                            : selectedLoader === 'vanilla'
                                            ? 'Vanilla has a single official release per version.'
                                            : 'Select the build you want to install.'
                                    }
                                />
                            </div>
                            <div className={'p-4'}>
                                {buildsLoading && (
                                    <div className={'flex items-center gap-2 text-xs text-zinc-400'}>
                                        <Spinner size={'small'} />
                                        <span>Loading builds…</span>
                                    </div>
                                )}
                                {!buildsLoading && builds && builds.builds.length === 0 && (
                                    <InfoBox type={'warning'}>No builds found for {LOADER_LABELS[selectedLoader]} {selectedMcVersion}.</InfoBox>
                                )}
                                {!buildsLoading && builds && builds.builds.length > 0 && (
                                    <div className={'space-y-2'}>
                                        {selectedLoader === 'fabric' && builds.loaderVersion && (
                                            <div className={'mb-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-400'}>
                                                <p>Fabric Loader: <span className={'font-medium text-zinc-200'}>{builds.loaderVersion}</span></p>
                                                <p className={'mt-0.5'}>Installer: <span className={'font-medium text-zinc-200'}>{builds.installerVersion}</span></p>
                                                <p className={'mt-0.5'}>Output jar: <span className={'font-mono text-zinc-300'}>{builds.jarFilename}</span></p>
                                            </div>
                                        )}
                                        {selectedLoader !== 'fabric' && builds.builds.map(b => (
                                            <BuildRow
                                                key={String(b.id)}
                                                build={b}
                                                selected={String(selectedBuild) === String(b.id)}
                                                onClick={() => setSelectedBuild(b.id)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Changelog preview ─────────────────────────────────────── */}
                    {selectedLoader && selectedMcVersion && builds && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader title={'Release Notes'} />
                            </div>
                            <div className={'p-4'}>
                                <ChangelogPreview
                                    loader={selectedLoader}
                                    builds={builds}
                                    selectedBuild={selectedBuild}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Compatibility warnings ────────────────────────────────── */}
                    {status && selectedLoader && selectedMcVersion && readyToSwitch && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader title={'Compatibility Notes'} />
                            </div>
                            <div className={'space-y-2 p-4'}>
                                <CompatibilityWarnings
                                    status={status}
                                    targetLoader={selectedLoader}
                                    targetVersion={selectedMcVersion}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Backup ────────────────────────────────────────────────── */}
                    {readyToSwitch && canBackup && !switchResult && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader
                                    title={'Step 4 — Create Backup (Recommended)'}
                                    subtitle={'Back up your server before switching versions. Strongly recommended before any major change.'}
                                />
                            </div>
                            <div className={'flex items-center gap-4 p-4'}>
                                {backupResult ? (
                                    <div className={'flex items-center gap-2 text-sm text-green-300'}>
                                        <span>✓</span>
                                        <span>Backup <span className={'font-medium'}>{backupResult.name}</span> started.</span>
                                    </div>
                                ) : (
                                    <Button
                                        onClick={handleBackup}
                                        disabled={backupLoading}
                                        className={'border-zinc-500 bg-zinc-700 text-white hover:bg-zinc-600'}
                                    >
                                        {backupLoading ? 'Creating backup…' : 'Create backup now'}
                                    </Button>
                                )}
                                <p className={'text-xs text-zinc-500'}>
                                    {backupResult ? 'You can now safely proceed.' : 'You can skip this step, but a backup is strongly recommended.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── Switch confirmation ───────────────────────────────────── */}
                    {readyToSwitch && !switchResult && (
                        <div className={'rounded-xl border border-zinc-700 bg-zinc-800'}>
                            <div className={'border-b border-zinc-700 px-4 py-3'}>
                                <SectionHeader
                                    title={'Step 5 — Apply Version Switch'}
                                    subtitle={'Download the selected jar and update your server startup variable.'}
                                />
                            </div>
                            <div className={'p-4'}>
                                <div className={'mb-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs'}>
                                    <p className={'text-zinc-400'}>
                                        Target:{' '}
                                        <span className={'font-medium text-zinc-200'}>
                                            {LOADER_LABELS[selectedLoader!]} {selectedMcVersion}
                                            {selectedLoader === 'paper' && selectedBuild ? ` build #${selectedBuild}` : ''}
                                            {selectedLoader === 'forge' && selectedBuild ? ` — Forge ${selectedBuild}` : ''}
                                            {selectedLoader === 'fabric' && builds?.loaderVersion ? ` — Loader ${builds.loaderVersion}` : ''}
                                        </span>
                                    </p>
                                    {!canUpdate && (
                                        <p className={'mt-1 text-red-400'}>
                                            You do not have permission to update the startup variable (<span className={'font-mono'}>startup.update</span> required).
                                        </p>
                                    )}
                                </div>
                                <Button
                                    onClick={handleSwitch}
                                    disabled={switching || !canUpdate}
                                    className={'bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50'}
                                >
                                    {switching
                                        ? 'Downloading & switching… (this may take a minute)'
                                        : `Switch to ${LOADER_LABELS[selectedLoader!] ?? selectedLoader} ${selectedMcVersion}`}
                                </Button>
                                {switching && (
                                    <p className={'mt-2 text-xs text-zinc-400'}>
                                        Downloading the server jar in the background. Please wait — large jars may take up to a minute.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Success result ────────────────────────────────────────── */}
                    {switchResult && (
                        <div className={'rounded-xl border border-green-700/50 bg-green-900/10 p-4'}>
                            <div className={'flex items-start gap-3'}>
                                <span className={'mt-0.5 flex-shrink-0 text-lg text-green-400'}>✓</span>
                                <div>
                                    <p className={'text-sm font-semibold text-green-300'}>Version switch complete!</p>
                                    <p className={'mt-1 text-xs text-green-400/80'}>
                                        {LOADER_LABELS[switchResult.loader] ?? switchResult.loader} {switchResult.mcVersion} — <span className={'font-mono'}>{switchResult.jar}</span>
                                    </p>
                                    <p className={'mt-2 text-xs text-zinc-400'}>
                                        Restart your server to apply the change. The new jar is in your server&apos;s root directory and the startup variable has been updated.
                                    </p>
                                    <button
                                        type={'button'}
                                        onClick={() => setSwitchResult(null)}
                                        className={'mt-3 text-xs text-zinc-400 underline hover:text-zinc-200'}
                                    >
                                        Switch again
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            )}
        </PageContentBlock>
    );
}
