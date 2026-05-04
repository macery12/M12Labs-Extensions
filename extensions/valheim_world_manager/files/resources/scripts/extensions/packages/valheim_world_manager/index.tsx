import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ServerContext } from '@/state/server';
import {
    getOverview,
    listWorlds,
    deleteWorld,
    getConfig,
    saveConfig,
    listMods,
    toggleMod,
    deleteMod,
    ValheimOverview,
    ValheimWorld,
    ValheimConfig,
    ValheimMod,
} from './api';
import Spinner from '@/elements/Spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faSync,
    faGlobe,
    faCubes,
    faServer,
    faCheckCircle,
    faTimesCircle,
    faTrash,
    faToggleOn,
    faToggleOff,
    faFolder,
    faPuzzlePiece,
} from '@fortawesome/free-solid-svg-icons';
import { useStoreState } from '@/state/hooks';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import PageContentBlock from '@/elements/PageContentBlock';
import { Button } from '@/elements/button';
import Modal from '@/elements/Modal';
import { Form, Formik } from 'formik';
import { object, string, boolean, mixed } from 'yup';
import Field from '@/elements/Field';
import { usePermissions } from '@/plugins/usePermissions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// ─── ConfirmDeleteModal ───────────────────────────────────────────────────────

interface ConfirmDeleteModalProps {
    visible: boolean;
    onDismissed: () => void;
    onConfirm: () => Promise<void>;
    title: string;
    message: string;
    confirmLabel?: string;
}

const ConfirmDeleteModal = ({ visible, onDismissed, onConfirm, title, message, confirmLabel = 'Delete' }: ConfirmDeleteModalProps) => {
    const [confirming, setConfirming] = useState(false);
    const { clearAndAddHttpError, clearFlashes } = useFlash();

    const handleConfirm = async () => {
        setConfirming(true);
        clearFlashes('server:valheim-manager:modal');
        try {
            await onConfirm();
            onDismissed();
        } catch (error) {
            clearAndAddHttpError({ key: 'server:valheim-manager:modal', error });
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Modal visible={visible} onDismissed={onDismissed} closeOnBackground showSpinnerOverlay={confirming}>
            <FlashMessageRender byKey={'server:valheim-manager:modal'} className={'mb-4'} />
            <h2 className={'mb-2 text-xl font-semibold text-white'}>{title}</h2>
            <p className={'mb-6 text-sm text-neutral-300'}>{message}</p>
            <div className={'flex justify-end gap-3'}>
                <Button.Text onClick={onDismissed} disabled={confirming}>
                    Cancel
                </Button.Text>
                <Button onClick={handleConfirm} disabled={confirming} className={'bg-red-600 hover:bg-red-700'}>
                    {confirmLabel}
                </Button>
            </div>
        </Modal>
    );
};

// ─── Tab type ────────────────────────────────────────────────────────────────

type ActiveTab = 'worlds' | 'config' | 'mods';

// ─── Modifier option maps ─────────────────────────────────────────────────────

const COMBAT_OPTIONS: { value: string; label: string }[] = [
    { value: 'veryeasy', label: 'Very Easy' },
    { value: 'easy', label: 'Easy' },
    { value: 'standard', label: 'Standard' },
    { value: 'hard', label: 'Hard' },
    { value: 'veryhard', label: 'Very Hard' },
];

const DEATHPENALTY_OPTIONS: { value: string; label: string }[] = [
    { value: 'casual', label: 'Casual' },
    { value: 'easy', label: 'Easy' },
    { value: 'standard', label: 'Standard' },
    { value: 'hard', label: 'Hard' },
    { value: 'hardcore', label: 'Hardcore' },
];

const RESOURCES_OPTIONS: { value: string; label: string }[] = [
    { value: 'muchless', label: 'Much Less' },
    { value: 'less', label: 'Less' },
    { value: 'standard', label: 'Standard' },
    { value: 'more', label: 'More' },
    { value: 'muchmore', label: 'Much More' },
    { value: 'most', label: 'Most' },
];

const RAIDS_OPTIONS: { value: string; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'less', label: 'Less' },
    { value: 'standard', label: 'Standard' },
    { value: 'more', label: 'More' },
];

const PORTALS_OPTIONS: { value: string; label: string }[] = [
    { value: 'casual', label: 'Casual' },
    { value: 'standard', label: 'Standard' },
    { value: 'hard', label: 'Hard' },
    { value: 'veryhard', label: 'Very Hard' },
];

const SELECT_CLASS = 'w-full rounded bg-zinc-700 border border-zinc-600 px-3 py-2 text-white text-sm';

// ─── Main component ───────────────────────────────────────────────────────────

export default () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);
    const primary = useStoreState(state => state.theme.data!.colors.primary);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();
    const [canManage] = usePermissions(['extension.manage']);

    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<ActiveTab>('worlds');

    const [overview, setOverview] = useState<ValheimOverview | null>(null);
    const [worlds, setWorlds] = useState<ValheimWorld[]>([]);
    const [worldsDirExists, setWorldsDirExists] = useState(true);
    const [config, setConfig] = useState<ValheimConfig | null>(null);
    const [configFileExists, setConfigFileExists] = useState(false);
    const [mods, setMods] = useState<ValheimMod[]>([]);
    const [bepinexInstalled, setBepinexInstalled] = useState(false);

    const [deleteWorldTarget, setDeleteWorldTarget] = useState<string | null>(null);
    const [deleteModTarget, setDeleteModTarget] = useState<string | null>(null);
    const [modToggles, setModToggles] = useState<Record<string, boolean>>({});

    const refresh = useCallback(async () => {
        if (!uuid) return;
        setLoading(true);
        clearFlashes('server:valheim-manager');

        try {
            const [overviewData, worldsData, configData, modsData] = await Promise.all([
                getOverview(uuid),
                listWorlds(uuid),
                getConfig(uuid),
                listMods(uuid),
            ]);

            setOverview(overviewData);
            setWorlds(worldsData.worlds);
            setWorldsDirExists(worldsData.dir_exists);
            setConfig(configData.config);
            setConfigFileExists(configData.file_exists);
            setMods(modsData.mods);
            setBepinexInstalled(modsData.bepinex_installed);
        } catch (error) {
            clearAndAddHttpError({ key: 'server:valheim-manager', error });
        } finally {
            setLoading(false);
        }
    }, [uuid]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const handleDeleteWorld = async (world: string) => {
        if (!uuid) return;
        clearFlashes('server:valheim-manager');
        await deleteWorld(uuid, world);
        addFlash({ key: 'server:valheim-manager', type: 'success', message: `World "${world}" deleted.` });
        await refresh();
    };

    const handleToggleMod = async (mod: ValheimMod) => {
        if (!uuid) return;
        setModToggles(prev => ({ ...prev, [mod.name]: true }));
        clearFlashes('server:valheim-manager');

        try {
            const result = await toggleMod(uuid, mod.name);
            addFlash({
                key: 'server:valheim-manager',
                type: 'success',
                message: `"${mod.display_name}" ${result.enabled ? 'enabled' : 'disabled'}.`,
            });
            await refresh();
        } catch (error) {
            clearAndAddHttpError({ key: 'server:valheim-manager', error });
        } finally {
            setModToggles(prev => ({ ...prev, [mod.name]: false }));
        }
    };

    const handleDeleteMod = async (mod: string) => {
        if (!uuid) return;
        clearFlashes('server:valheim-manager');
        await deleteMod(uuid, mod);
        addFlash({ key: 'server:valheim-manager', type: 'success', message: `Mod "${mod}" deleted.` });
        await refresh();
    };

    if (loading && !overview) {
        return (
            <PageContentBlock title={'Valheim World Manager'}>
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            </PageContentBlock>
        );
    }

    const tabClass = (tab: ActiveTab) =>
        `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
            activeTab === tab
                ? 'bg-zinc-800 text-white border-b-2'
                : 'text-neutral-400 hover:text-white hover:bg-zinc-800/50'
        }`;

    return (
        <PageContentBlock title={'Valheim World Manager'}>
            <FlashMessageRender byKey={'server:valheim-manager'} className={'mb-4'} />

            {/* Header */}
            <div className={'mb-6 flex items-center justify-between'}>
                <button
                    onClick={() => navigate(`/server/${id}/extensions`)}
                    className={'flex items-center gap-2 text-neutral-400 transition-colors hover:text-white'}
                >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Back to Extensions
                </button>
                <Button onClick={refresh} disabled={loading}>
                    <FontAwesomeIcon icon={faSync} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Stat Cards */}
            <div className={'mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4'}>
                <div className={'rounded-lg bg-zinc-800 p-4 text-center'}>
                    <div className={'mb-1 text-2xl font-bold text-white'}>{overview?.world_count ?? 0}</div>
                    <div className={'flex items-center justify-center gap-1 text-xs text-neutral-400'}>
                        <FontAwesomeIcon icon={faGlobe} />
                        Worlds
                    </div>
                </div>
                <div className={'rounded-lg bg-zinc-800 p-4 text-center'}>
                    <div className={'mb-1 truncate text-sm font-bold text-white'} title={overview?.active_world ?? 'None'}>
                        {overview?.active_world ?? <span className={'text-neutral-500'}>None</span>}
                    </div>
                    <div className={'flex items-center justify-center gap-1 text-xs text-neutral-400'}>
                        <FontAwesomeIcon icon={faServer} />
                        Active World
                    </div>
                </div>
                <div className={'rounded-lg bg-zinc-800 p-4 text-center'}>
                    <div className={'mb-1 text-2xl font-bold text-white'}>{overview?.mod_count ?? 0}</div>
                    <div className={'flex items-center justify-center gap-1 text-xs text-neutral-400'}>
                        <FontAwesomeIcon icon={faCubes} />
                        Mods
                    </div>
                </div>
                <div className={'rounded-lg bg-zinc-800 p-4 text-center'}>
                    {overview?.bepinex_installed ? (
                        <>
                            <div className={'mb-1 text-sm font-bold text-green-400'}>Installed</div>
                            <div className={'flex items-center justify-center gap-1 text-xs text-neutral-400'}>
                                <FontAwesomeIcon icon={faCheckCircle} className={'text-green-400'} />
                                BepInEx
                            </div>
                        </>
                    ) : (
                        <>
                            <div className={'mb-1 text-sm font-bold text-red-400'}>Not Found</div>
                            <div className={'flex items-center justify-center gap-1 text-xs text-neutral-400'}>
                                <FontAwesomeIcon icon={faTimesCircle} className={'text-red-400'} />
                                BepInEx
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className={'mb-0 flex gap-1 border-b border-zinc-700'}>
                <button className={tabClass('worlds')} onClick={() => setActiveTab('worlds')} style={activeTab === 'worlds' ? { borderColor: primary } : {}}>
                    Worlds
                </button>
                <button className={tabClass('config')} onClick={() => setActiveTab('config')} style={activeTab === 'config' ? { borderColor: primary } : {}}>
                    Server Config
                </button>
                <button className={tabClass('mods')} onClick={() => setActiveTab('mods')} style={activeTab === 'mods' ? { borderColor: primary } : {}}>
                    Mods
                </button>
            </div>

            <div className={'rounded-b-lg rounded-tr-lg bg-zinc-800 p-6'}>
                {/* ── Tab 1: Worlds ── */}
                {activeTab === 'worlds' && (
                    <>
                        {!worldsDirExists && (
                            <div className={'mb-4 rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-300'}>
                                Worlds directory not found. Start the server at least once to generate world files.
                            </div>
                        )}
                        {worlds.length === 0 ? (
                            <p className={'py-8 text-center text-sm text-neutral-500'}>
                                {worldsDirExists ? 'No worlds found.' : 'No worlds available.'}
                            </p>
                        ) : (
                            <div className={'space-y-3'}>
                                {worlds.map(world => (
                                    <div key={world.name} className={'flex items-center justify-between rounded-lg bg-zinc-700/60 p-4'}>
                                        <div className={'flex-1'}>
                                            <div className={'flex items-center gap-2'}>
                                                <span className={'font-medium text-white'}>{world.name}</span>
                                                {world.is_active && (
                                                    <span
                                                        className={'rounded px-2 py-0.5 text-xs font-medium'}
                                                        style={{ backgroundColor: `${primary}30`, color: primary }}
                                                    >
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                            <div className={'mt-1 flex flex-wrap gap-3 text-xs text-neutral-400'}>
                                                {world.has_db && <span>DB: {formatBytes(world.db_size)}</span>}
                                                {world.has_fwl && <span>FWL: {formatBytes(world.fwl_size)}</span>}
                                                <span>
                                                    Backup:{' '}
                                                    {world.has_db_backup || world.has_fwl_backup ? (
                                                        <span className={'text-green-400'}>Yes</span>
                                                    ) : (
                                                        <span className={'text-neutral-500'}>No</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <Button
                                            onClick={() => setDeleteWorldTarget(world.name)}
                                            disabled={world.is_active || !canManage}
                                            title={world.is_active ? 'Cannot delete the active world' : !canManage ? 'Read-only access' : undefined}
                                            className={'ml-4 bg-red-600/80 hover:bg-red-600 disabled:opacity-40'}
                                        >
                                            <FontAwesomeIcon icon={faTrash} />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ── Tab 2: Server Config ── */}
                {activeTab === 'config' && config && (
                    <>
                        {!configFileExists && (
                            <div className={'mb-4 rounded-lg border border-blue-600/40 bg-blue-500/10 p-4 text-sm text-blue-300'}>
                                Config file not found — saving will create it with these settings.
                            </div>
                        )}
                        <Formik
                            initialValues={config}
                            enableReinitialize
                            validationSchema={object().shape({
                                server_name: string().required('Server name is required').max(64, 'Max 64 characters'),
                                world_name: string()
                                    .required('World name is required')
                                    .max(64, 'Max 64 characters')
                                    .matches(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, underscores, and hyphens'),
                                password: string().nullable().test('min-if-set', 'Password must be at least 5 characters', val => !val || val.length === 0 || val.length >= 5),
                                public: boolean().required(),
                                crossplay: boolean().required(),
                                modifier_combat: mixed<string>().required(),
                                modifier_deathpenalty: mixed<string>().required(),
                                modifier_resources: mixed<string>().required(),
                                modifier_raids: mixed<string>().required(),
                                modifier_portals: mixed<string>().required(),
                            })}
                            onSubmit={async (values, { setSubmitting }) => {
                                if (!uuid) return;
                                clearFlashes('server:valheim-manager');
                                try {
                                    const result = await saveConfig(uuid, values);
                                    setConfig(result.config);
                                    setConfigFileExists(true);
                                    addFlash({ key: 'server:valheim-manager', type: 'success', message: 'Server config saved.' });
                                } catch (error) {
                                    clearAndAddHttpError({ key: 'server:valheim-manager', error });
                                } finally {
                                    setSubmitting(false);
                                }
                            }}
                        >
                            {({ values, setFieldValue, isSubmitting, errors, touched }) => (
                                <Form className={'space-y-6'}>
                                    {/* Server Settings */}
                                    <div>
                                        <h3 className={'mb-4 text-base font-semibold text-white'}>Server Settings</h3>
                                        <div className={'space-y-4'}>
                                            <Field
                                                name={'server_name'}
                                                label={'Server Name'}
                                                placeholder={'My Valheim Server'}
                                            />
                                            <Field
                                                name={'world_name'}
                                                label={'World Name'}
                                                placeholder={'MyWorld'}
                                                description={'Letters, numbers, underscores, and hyphens only.'}
                                            />
                                            <Field
                                                name={'password'}
                                                label={'Password (optional)'}
                                                type={'password'}
                                                placeholder={'Leave blank for no password'}
                                            />
                                            {/* Public toggle */}
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Public Server
                                                </label>
                                                <button
                                                    type={'button'}
                                                    onClick={() => setFieldValue('public', !values.public)}
                                                    className={'flex items-center gap-2 text-sm text-neutral-300 hover:text-white'}
                                                >
                                                    <FontAwesomeIcon
                                                        icon={values.public ? faToggleOn : faToggleOff}
                                                        className={'text-xl'}
                                                        style={{ color: values.public ? primary : '#6b7280' }}
                                                    />
                                                    {values.public ? 'Visible in server browser' : 'Hidden from server browser'}
                                                </button>
                                                {errors.public && touched.public && (
                                                    <p className={'mt-1 text-xs text-red-400'}>{errors.public}</p>
                                                )}
                                            </div>
                                            {/* Crossplay toggle */}
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Crossplay
                                                </label>
                                                <button
                                                    type={'button'}
                                                    onClick={() => setFieldValue('crossplay', !values.crossplay)}
                                                    className={'flex items-center gap-2 text-sm text-neutral-300 hover:text-white'}
                                                >
                                                    <FontAwesomeIcon
                                                        icon={values.crossplay ? faToggleOn : faToggleOff}
                                                        className={'text-xl'}
                                                        style={{ color: values.crossplay ? primary : '#6b7280' }}
                                                    />
                                                    {values.crossplay ? 'Crossplay enabled' : 'Crossplay disabled'}
                                                </button>
                                                {errors.crossplay && touched.crossplay && (
                                                    <p className={'mt-1 text-xs text-red-400'}>{errors.crossplay}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* World Modifiers */}
                                    <div>
                                        <h3 className={'mb-4 text-base font-semibold text-white'}>World Modifiers</h3>
                                        <div className={'grid gap-4 sm:grid-cols-2'}>
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Combat
                                                </label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={values.modifier_combat}
                                                    onChange={e => setFieldValue('modifier_combat', e.target.value)}
                                                >
                                                    {COMBAT_OPTIONS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Death Penalty
                                                </label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={values.modifier_deathpenalty}
                                                    onChange={e => setFieldValue('modifier_deathpenalty', e.target.value)}
                                                >
                                                    {DEATHPENALTY_OPTIONS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Resources
                                                </label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={values.modifier_resources}
                                                    onChange={e => setFieldValue('modifier_resources', e.target.value)}
                                                >
                                                    {RESOURCES_OPTIONS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Raids
                                                </label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={values.modifier_raids}
                                                    onChange={e => setFieldValue('modifier_raids', e.target.value)}
                                                >
                                                    {RAIDS_OPTIONS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={'mb-1 block text-xs font-medium uppercase text-neutral-400'}>
                                                    Portals
                                                </label>
                                                <select
                                                    className={SELECT_CLASS}
                                                    value={values.modifier_portals}
                                                    onChange={e => setFieldValue('modifier_portals', e.target.value)}
                                                >
                                                    {PORTALS_OPTIONS.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={'flex justify-end'}>
                                        <Button
                                            type={'submit'}
                                            disabled={!canManage || isSubmitting}
                                            title={!canManage ? 'Read-only access' : undefined}
                                        >
                                            {isSubmitting ? (
                                                <Spinner size={'small'} className={'mr-2'} />
                                            ) : null}
                                            Save Config
                                        </Button>
                                    </div>
                                </Form>
                            )}
                        </Formik>
                    </>
                )}

                {/* ── Tab 3: Mods ── */}
                {activeTab === 'mods' && (
                    <>
                        {!bepinexInstalled && (
                            <div className={'mb-4 rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-300'}>
                                BepInEx is not installed. Install BepInEx to the server to manage mods.
                            </div>
                        )}
                        {mods.length === 0 ? (
                            <p className={'py-8 text-center text-sm text-neutral-500'}>
                                {bepinexInstalled ? 'No mods found in the plugins directory.' : 'BepInEx not detected.'}
                            </p>
                        ) : (
                            <div className={'space-y-2'}>
                                {mods.map(mod => (
                                    <div key={mod.name} className={'flex items-center justify-between rounded-lg bg-zinc-700/60 p-3'}>
                                        <div className={'flex-1'}>
                                            <div className={'flex flex-wrap items-center gap-2'}>
                                                <FontAwesomeIcon
                                                    icon={mod.is_directory ? faFolder : faPuzzlePiece}
                                                    className={'text-neutral-400'}
                                                />
                                                <span className={'text-sm font-medium text-white'}>{mod.display_name}</span>
                                                <span className={'rounded bg-zinc-600 px-1.5 py-0.5 text-xs text-neutral-400'}>
                                                    {mod.is_directory ? 'Folder' : 'Plugin'}
                                                </span>
                                                <span
                                                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                                                        mod.enabled
                                                            ? 'bg-green-500/20 text-green-400'
                                                            : 'bg-red-500/20 text-red-400'
                                                    }`}
                                                >
                                                    {mod.enabled ? 'Enabled' : 'Disabled'}
                                                </span>
                                                {mod.size > 0 && (
                                                    <span className={'text-xs text-neutral-500'}>{formatBytes(mod.size)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={'ml-4 flex items-center gap-2'}>
                                            <button
                                                onClick={() => handleToggleMod(mod)}
                                                disabled={!!modToggles[mod.name] || !canManage}
                                                title={!canManage ? 'Read-only access' : mod.enabled ? 'Disable mod' : 'Enable mod'}
                                                className={'p-1 transition-colors disabled:opacity-40'}
                                            >
                                                {modToggles[mod.name] ? (
                                                    <Spinner size={'small'} />
                                                ) : (
                                                    <FontAwesomeIcon
                                                        icon={mod.enabled ? faToggleOn : faToggleOff}
                                                        className={'text-xl'}
                                                        style={{ color: mod.enabled ? primary : '#6b7280' }}
                                                    />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setDeleteModTarget(mod.name)}
                                                disabled={!canManage}
                                                title={!canManage ? 'Read-only access' : 'Delete mod'}
                                                className={'p-1 text-neutral-400 transition-colors hover:text-red-400 disabled:opacity-40'}
                                            >
                                                <FontAwesomeIcon icon={faTrash} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Delete World Modal */}
            {deleteWorldTarget !== null && (
                <ConfirmDeleteModal
                    visible={deleteWorldTarget !== null}
                    onDismissed={() => setDeleteWorldTarget(null)}
                    onConfirm={() => handleDeleteWorld(deleteWorldTarget)}
                    title={'Delete World'}
                    message={`Are you sure you want to delete the world "${deleteWorldTarget}"? This will remove all associated world files and cannot be undone.`}
                    confirmLabel={'Delete World'}
                />
            )}

            {/* Delete Mod Modal */}
            {deleteModTarget !== null && (
                <ConfirmDeleteModal
                    visible={deleteModTarget !== null}
                    onDismissed={() => setDeleteModTarget(null)}
                    onConfirm={() => handleDeleteMod(deleteModTarget)}
                    title={'Delete Mod'}
                    message={`Are you sure you want to delete "${deleteModTarget}"? This action cannot be undone.`}
                    confirmLabel={'Delete Mod'}
                />
            )}
        </PageContentBlock>
    );
};
