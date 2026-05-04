import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ServerContext } from '@/state/server';
import { useStoreState } from '@/state/hooks';
import {
    PalworldSettings,
    PalworldPreset,
    getSettings,
    saveSettings,
    getPresets,
    applyPreset,
} from './api';
import Spinner from '@/elements/Spinner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faArrowLeft,
    faSync,
    faToggleOn,
    faToggleOff,
    faSave,
    faGamepad,
} from '@fortawesome/free-solid-svg-icons';
import FlashMessageRender from '@/elements/FlashMessageRender';
import useFlash from '@/plugins/useFlash';
import PageContentBlock from '@/elements/PageContentBlock';
import { Button } from '@/elements/button';
import Field from '@/elements/Field';
import { Form, Formik, useField } from 'formik';
import { object, string, number, boolean, mixed } from 'yup';
import classNames from 'classnames';
import { usePermissions } from '@/plugins/usePermissions';

// ---------------------------------------------------------------------------
// Toggle component – styled the same as the whitelist toggle in player manager
// ---------------------------------------------------------------------------
interface ToggleFieldProps {
    name: string;
    label: string;
    disabled?: boolean;
}

const ToggleField = ({ name, label, disabled }: ToggleFieldProps) => {
    const [field, , helpers] = useField<boolean>(name);
    const primary = useStoreState(state => state.theme.data!.colors.primary);
    const value = field.value;

    return (
        <div className={'flex items-center justify-between rounded bg-zinc-700 px-4 py-3'}>
            <span className={'text-sm text-neutral-300'}>{label}</span>
            <button
                type={'button'}
                onClick={() => !disabled && helpers.setValue(!value)}
                disabled={disabled}
                className={'flex items-center gap-2 text-sm text-neutral-400 transition-colors hover:text-white disabled:opacity-50'}
            >
                <FontAwesomeIcon
                    icon={value ? faToggleOn : faToggleOff}
                    className={'text-2xl'}
                    style={{ color: value ? primary : '#6b7280' }}
                />
                <span style={{ color: value ? primary : '#6b7280' }}>{value ? 'On' : 'Off'}</span>
            </button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Select component – styled for the panel theme
// ---------------------------------------------------------------------------
interface SelectFieldProps {
    name: string;
    label: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
}

const SelectField = ({ name, label, options, disabled }: SelectFieldProps) => {
    const [field, meta] = useField(name);

    return (
        <div>
            <label className={'mb-1 block text-xs font-medium text-neutral-400'}>{label}</label>
            <select
                {...field}
                disabled={disabled}
                className={classNames(
                    'w-full rounded border bg-zinc-700 px-3 py-2 text-sm text-white transition-colors',
                    'focus:border-neutral-500 focus:outline-none',
                    meta.touched && meta.error ? 'border-red-500' : 'border-neutral-600',
                    disabled && 'opacity-50 cursor-not-allowed',
                )}
            >
                {options.map(opt => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
            {meta.touched && meta.error && (
                <p className={'mt-1 text-xs text-red-400'}>{meta.error}</p>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Tab-based section renderer
// ---------------------------------------------------------------------------
const TABS = ['Server', 'Gameplay', 'Rates', 'Survival', 'World'] as const;
type TabName = (typeof TABS)[number];

interface TabSectionProps {
    activeTab: TabName;
    canManage: boolean;
}

const ServerSection = ({ canManage }: { canManage: boolean }) => (
    <div className={'space-y-4'}>
        <Field name={'ServerName'} label={'Server Name'} disabled={!canManage} />
        <Field name={'ServerDescription'} label={'Server Description'} disabled={!canManage} />
        <Field name={'AdminPassword'} label={'Admin Password'} type={'password'} disabled={!canManage} />
        <Field name={'ServerPassword'} label={'Server Password'} type={'password'} disabled={!canManage} />
        <div className={'grid grid-cols-1 gap-4 sm:grid-cols-3'}>
            <Field name={'ServerPlayerMaxNum'} label={'Max Players'} type={'number'} min={1} max={32} disabled={!canManage} />
            <Field name={'CoopPlayerMaxNum'} label={'Coop Max Players'} type={'number'} min={1} max={32} disabled={!canManage} />
            <Field name={'PublicPort'} label={'Public Port'} type={'number'} min={1} max={65535} disabled={!canManage} />
        </div>
    </div>
);

const GameplaySection = ({ canManage }: { canManage: boolean }) => (
    <div className={'space-y-4'}>
        <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
            <SelectField
                name={'Difficulty'}
                label={'Difficulty'}
                disabled={!canManage}
                options={[
                    { value: 'None', label: 'None (Default)' },
                    { value: 'Normal', label: 'Normal' },
                    { value: 'Difficult', label: 'Difficult' },
                ]}
            />
            <SelectField
                name={'DeathPenalty'}
                label={'Death Penalty'}
                disabled={!canManage}
                options={[
                    { value: 'None', label: 'None' },
                    { value: 'Item', label: 'Drop Items' },
                    { value: 'ItemAndEquipment', label: 'Drop Items & Equipment' },
                    { value: 'All', label: 'Drop All' },
                ]}
            />
        </div>
        <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
            <ToggleField name={'bIsPvP'} label={'PvP Enabled'} disabled={!canManage} />
            <ToggleField name={'bEnablePlayerToPlayerDamage'} label={'Player-to-Player Damage'} disabled={!canManage} />
            <ToggleField name={'bEnableFriendlyFire'} label={'Friendly Fire'} disabled={!canManage} />
            <ToggleField name={'bEnableInvaderEnemy'} label={'Invader Enemies'} disabled={!canManage} />
            <ToggleField name={'bEnableNonLoginPenalty'} label={'Non-Login Penalty'} disabled={!canManage} />
            <ToggleField name={'bEnableFastTravel'} label={'Fast Travel'} disabled={!canManage} />
            <ToggleField name={'bIsStartLocationSelectByMap'} label={'Select Start Location by Map'} disabled={!canManage} />
            <ToggleField name={'bExistPlayerAfterLogout'} label={'Player Persists After Logout'} disabled={!canManage} />
            <ToggleField name={'bEnableDefenseOtherGuildPlayer'} label={'Defense Other Guild Player'} disabled={!canManage} />
        </div>
    </div>
);

const RatesSection = ({ canManage }: { canManage: boolean }) => (
    <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        <Field name={'ExpRate'} label={'Experience Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalCaptureRate'} label={'Pal Capture Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalSpawnNumRate'} label={'Pal Spawn Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalDamageRateAttack'} label={'Pal Attack Damage Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalDamageRateDefense'} label={'Pal Defense Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PlayerDamageRateAttack'} label={'Player Attack Damage Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PlayerDamageRateDefense'} label={'Player Defense Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'WorkSpeedRate'} label={'Work Speed Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'CollectionDropRate'} label={'Collection Drop Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'CollectionObjectHpRate'} label={'Collection Object HP Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'CollectionObjectRespawnSpeedRate'} label={'Collection Respawn Speed'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'EnemyDropItemRate'} label={'Enemy Drop Item Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'DayTimeSpeedRate'} label={'Day Time Speed Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'NightTimeSpeedRate'} label={'Night Time Speed Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
    </div>
);

const SurvivalSection = ({ canManage }: { canManage: boolean }) => (
    <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
        <Field name={'PlayerStomachDecreaceRate'} label={'Player Hunger Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PlayerStaminaDecreaceRate'} label={'Player Stamina Drain Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PlayerAutoHPRegeneRate'} label={'Player HP Regen Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PlayerAutoHpRegeneRateInSleep'} label={'Player HP Regen (Sleep)'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalStomachDecreaceRate'} label={'Pal Hunger Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalStaminaDecreaceRate'} label={'Pal Stamina Drain Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalAutoHPRegeneRate'} label={'Pal HP Regen Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        <Field name={'PalAutoHpRegeneRateInSleep'} label={'Pal HP Regen (Sleep)'} type={'number'} step={0.1} min={0} disabled={!canManage} />
    </div>
);

const WorldSection = ({ canManage }: { canManage: boolean }) => (
    <div className={'space-y-4'}>
        <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
            <Field name={'DropItemMaxNum'} label={'Max Drop Items'} type={'number'} min={0} disabled={!canManage} />
            <Field name={'DropItemAliveMaxHours'} label={'Drop Item Lifetime (hours)'} type={'number'} step={0.1} min={0} disabled={!canManage} />
            <Field name={'BuildObjectDamageRate'} label={'Build Object Damage Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
            <Field name={'BuildObjectDeteriorationDamageRate'} label={'Build Deterioration Rate'} type={'number'} step={0.1} min={0} disabled={!canManage} />
            <Field name={'BaseCampMaxNum'} label={'Max Base Camps'} type={'number'} min={1} disabled={!canManage} />
            <Field name={'BaseCampWorkerMaxNum'} label={'Max Base Camp Workers'} type={'number'} min={1} disabled={!canManage} />
            <Field name={'GuildPlayerMaxNum'} label={'Max Guild Players'} type={'number'} min={1} disabled={!canManage} />
            <Field name={'PalEggDefaultHatchingTime'} label={'Egg Hatching Time (hours)'} type={'number'} step={0.1} min={0} disabled={!canManage} />
            <Field name={'SupplyDropSpan'} label={'Supply Drop Interval (min)'} type={'number'} min={0} disabled={!canManage} />
            <Field name={'AutoResetGuildTimeNoOnlinePlayers'} label={'Guild Reset Time (hours)'} type={'number'} step={0.1} min={0} disabled={!canManage} />
        </div>
        <div className={'grid grid-cols-1 gap-3 sm:grid-cols-2'}>
            <ToggleField name={'bAutoResetGuildNoOnlinePlayers'} label={'Auto Reset Empty Guilds'} disabled={!canManage} />
            <ToggleField name={'bIsUseBackupSaveData'} label={'Use Backup Save Data'} disabled={!canManage} />
        </div>
    </div>
);

const TabSection = ({ activeTab, canManage }: TabSectionProps) => {
    switch (activeTab) {
        case 'Server':   return <ServerSection canManage={canManage} />;
        case 'Gameplay': return <GameplaySection canManage={canManage} />;
        case 'Rates':    return <RatesSection canManage={canManage} />;
        case 'Survival': return <SurvivalSection canManage={canManage} />;
        case 'World':    return <WorldSection canManage={canManage} />;
    }
};

// ---------------------------------------------------------------------------
// Preset card
// ---------------------------------------------------------------------------
interface PresetCardProps {
    preset: PalworldPreset;
    onApply: (presetId: string) => void;
    applying: string | null;
    disabled: boolean;
}

const PresetCard = ({ preset, onApply, applying, disabled }: PresetCardProps) => {
    const primary = useStoreState(state => state.theme.data!.colors.primary);
    const isApplying = applying === preset.id;

    return (
        <div
            className={'flex flex-col rounded-lg border border-neutral-700 bg-zinc-800 p-4'}
            style={{ borderColor: isApplying ? primary : undefined }}
        >
            <h3 className={'mb-1 font-semibold text-white'}>{preset.name}</h3>
            <p className={'mb-4 flex-1 text-sm text-neutral-400'}>{preset.description}</p>
            <Button
                onClick={() => onApply(preset.id)}
                disabled={disabled || applying !== null}
                className={'w-full justify-center'}
                style={!disabled ? { backgroundColor: `${primary}20`, borderColor: primary } : undefined}
            >
                {isApplying ? (
                    <Spinner size={'small'} className={'mr-2'} />
                ) : null}
                Apply
            </Button>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------
const validationSchema = object().shape({
    ServerName:                         string().required('Required'),
    ServerDescription:                  string().nullable(),
    AdminPassword:                      string().nullable(),
    ServerPassword:                     string().nullable(),
    ServerPlayerMaxNum:                 number().required().min(1).max(32),
    CoopPlayerMaxNum:                   number().required().min(1).max(32),
    PublicPort:                         number().required().min(1).max(65535),
    Difficulty:                         mixed().oneOf(['None', 'Normal', 'Difficult']).required(),
    DeathPenalty:                       mixed().oneOf(['None', 'Item', 'ItemAndEquipment', 'All']).required(),
    bIsPvP:                             boolean().required(),
    bEnablePlayerToPlayerDamage:        boolean().required(),
    bEnableFriendlyFire:                boolean().required(),
    bEnableInvaderEnemy:                boolean().required(),
    bEnableNonLoginPenalty:             boolean().required(),
    bEnableFastTravel:                  boolean().required(),
    bIsStartLocationSelectByMap:        boolean().required(),
    bExistPlayerAfterLogout:            boolean().required(),
    bEnableDefenseOtherGuildPlayer:     boolean().required(),
    DayTimeSpeedRate:                   number().required().min(0),
    NightTimeSpeedRate:                 number().required().min(0),
    ExpRate:                            number().required().min(0),
    PalCaptureRate:                     number().required().min(0),
    PalSpawnNumRate:                    number().required().min(0),
    PalDamageRateAttack:                number().required().min(0),
    PalDamageRateDefense:               number().required().min(0),
    PlayerDamageRateAttack:             number().required().min(0),
    PlayerDamageRateDefense:            number().required().min(0),
    WorkSpeedRate:                      number().required().min(0),
    CollectionDropRate:                 number().required().min(0),
    CollectionObjectHpRate:             number().required().min(0),
    CollectionObjectRespawnSpeedRate:   number().required().min(0),
    EnemyDropItemRate:                  number().required().min(0),
    PlayerStomachDecreaceRate:          number().required().min(0),
    PlayerStaminaDecreaceRate:          number().required().min(0),
    PlayerAutoHPRegeneRate:             number().required().min(0),
    PlayerAutoHpRegeneRateInSleep:      number().required().min(0),
    PalStomachDecreaceRate:             number().required().min(0),
    PalStaminaDecreaceRate:             number().required().min(0),
    PalAutoHPRegeneRate:                number().required().min(0),
    PalAutoHpRegeneRateInSleep:         number().required().min(0),
    DropItemMaxNum:                     number().required().min(0),
    DropItemAliveMaxHours:              number().required().min(0),
    BuildObjectDamageRate:              number().required().min(0),
    BuildObjectDeteriorationDamageRate: number().required().min(0),
    BaseCampMaxNum:                     number().required().min(1),
    BaseCampWorkerMaxNum:               number().required().min(1),
    GuildPlayerMaxNum:                  number().required().min(1),
    PalEggDefaultHatchingTime:          number().required().min(0),
    SupplyDropSpan:                     number().required().min(0),
    bAutoResetGuildNoOnlinePlayers:     boolean().required(),
    AutoResetGuildTimeNoOnlinePlayers:  number().required().min(0),
    bIsUseBackupSaveData:               boolean().required(),
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const uuid = ServerContext.useStoreState(state => state.server.data?.uuid);
    const primary = useStoreState(state => state.theme.data!.colors.primary);
    const [canManage] = usePermissions(['extension.manage']);
    const { addFlash, clearFlashes, clearAndAddHttpError } = useFlash();

    const [settings, setSettings] = useState<PalworldSettings | null>(null);
    const [fileExists, setFileExists] = useState(true);
    const [loading, setLoading] = useState(true);
    const [presets, setPresets] = useState<PalworldPreset[]>([]);
    const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<TabName>('Server');

    const fetchData = useCallback(() => {
        if (!uuid) return;

        setLoading(true);
        clearFlashes('server:palworld-manager');

        Promise.all([getSettings(uuid), getPresets(uuid)])
            .then(([statusData, presetData]) => {
                setSettings(statusData.settings);
                setFileExists(statusData.file_exists);
                setPresets(presetData);
            })
            .catch(error => clearAndAddHttpError({ key: 'server:palworld-manager', error }))
            .finally(() => setLoading(false));
    }, [uuid]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleApplyPreset = async (presetId: string) => {
        if (!uuid) return;

        setApplyingPreset(presetId);
        clearFlashes('server:palworld-manager');

        try {
            const merged = await applyPreset(uuid, presetId);
            setSettings(merged);
            setFileExists(true);
            addFlash({ key: 'server:palworld-manager', type: 'success', message: 'Preset applied successfully.' });
        } catch (error) {
            clearAndAddHttpError({ key: 'server:palworld-manager', error });
        } finally {
            setApplyingPreset(null);
        }
    };

    if (loading && !settings) {
        return (
            <PageContentBlock title={'Palworld Server Manager'}>
                <div className={'flex items-center justify-center py-16'}>
                    <Spinner size={'large'} />
                </div>
            </PageContentBlock>
        );
    }

    return (
        <PageContentBlock title={'Palworld Server Manager'}>
            <FlashMessageRender byKey={'server:palworld-manager'} className={'mb-4'} />

            {/* Header */}
            <div className={'mb-6 flex items-center justify-between'}>
                <button
                    onClick={() => navigate(`/server/${id}/extensions`)}
                    className={'flex items-center gap-2 text-neutral-400 transition-colors hover:text-white'}
                >
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Back to Extensions
                </button>
                <div className={'flex items-center gap-3'}>
                    <h1 className={'flex items-center gap-2 text-lg font-semibold text-white'}>
                        <FontAwesomeIcon icon={faGamepad} style={{ color: primary }} />
                        Palworld Server Manager
                    </h1>
                </div>
                <Button onClick={fetchData} disabled={loading}>
                    <FontAwesomeIcon icon={faSync} className={classNames('mr-2', loading && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            {/* File-not-found banner */}
            {!fileExists && (
                <div className={'mb-6 rounded-lg border border-amber-600/40 bg-amber-500/10 p-4 text-sm text-amber-300'}>
                    <strong>PalWorldSettings.ini was not found</strong> at{' '}
                    <code className={'rounded bg-amber-900/40 px-1 py-0.5 text-xs'}>
                        Pal/Saved/Config/LinuxServer/PalWorldSettings.ini
                    </code>
                    . Start your server at least once to generate the file, or save below to create it with defaults.
                </div>
            )}

            {/* Preset cards */}
            <div className={'mb-6'}>
                <h2 className={'mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-400'}>
                    Quick Presets
                </h2>
                <div className={'grid grid-cols-1 gap-4 sm:grid-cols-3'}>
                    {presets.map(preset => (
                        <PresetCard
                            key={preset.id}
                            preset={preset}
                            onApply={handleApplyPreset}
                            applying={applyingPreset}
                            disabled={!canManage}
                        />
                    ))}
                </div>
            </div>

            {/* Settings form */}
            {settings && (
                <Formik
                    enableReinitialize
                    initialValues={settings}
                    validationSchema={validationSchema}
                    onSubmit={async (values, { setSubmitting }) => {
                        if (!uuid) return;

                        clearFlashes('server:palworld-manager');

                        try {
                            await saveSettings(uuid, values);
                            setFileExists(true);
                            addFlash({
                                key: 'server:palworld-manager',
                                type: 'success',
                                message: 'Settings saved successfully.',
                            });
                        } catch (error) {
                            clearAndAddHttpError({ key: 'server:palworld-manager', error });
                        } finally {
                            setSubmitting(false);
                        }
                    }}
                >
                    {({ isSubmitting }) => (
                        <Form>
                            <div className={'rounded-lg bg-zinc-800'}>
                                {/* Tabs */}
                                <div className={'flex border-b border-neutral-700'}>
                                    {TABS.map(tab => (
                                        <button
                                            key={tab}
                                            type={'button'}
                                            onClick={() => setActiveTab(tab)}
                                            className={classNames(
                                                'px-5 py-3 text-sm font-medium transition-colors',
                                                activeTab === tab
                                                    ? 'border-b-2 text-white'
                                                    : 'text-neutral-400 hover:text-white',
                                            )}
                                            style={
                                                activeTab === tab
                                                    ? { borderColor: primary, color: primary }
                                                    : undefined
                                            }
                                        >
                                            {tab}
                                        </button>
                                    ))}
                                </div>

                                {/* Tab content */}
                                <div className={'p-6'}>
                                    <TabSection activeTab={activeTab} canManage={canManage} />
                                </div>
                            </div>

                            {/* Save button */}
                            <div className={'mt-4 flex justify-end'}>
                                <Button
                                    type={'submit'}
                                    disabled={isSubmitting || !canManage}
                                    style={canManage ? { backgroundColor: primary } : undefined}
                                >
                                    {isSubmitting ? (
                                        <Spinner size={'small'} className={'mr-2'} />
                                    ) : (
                                        <FontAwesomeIcon icon={faSave} className={'mr-2'} />
                                    )}
                                    Save Settings
                                </Button>
                            </div>
                        </Form>
                    )}
                </Formik>
            )}
        </PageContentBlock>
    );
};
