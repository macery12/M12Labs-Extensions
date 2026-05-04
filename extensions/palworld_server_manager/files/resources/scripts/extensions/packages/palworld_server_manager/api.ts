import http from '@/api/http';

const extensionId = 'palworld_server_manager';

const getBasePath = (uuid: string): string => `/api/client/servers/${uuid}/extensions/${extensionId}`;

export interface PalworldSettings {
    // Server
    ServerName: string;
    ServerDescription: string;
    AdminPassword: string;
    ServerPassword: string;
    ServerPlayerMaxNum: number;
    CoopPlayerMaxNum: number;
    PublicPort: number;

    // Gameplay
    Difficulty: 'None' | 'Normal' | 'Difficult';
    DeathPenalty: 'None' | 'Item' | 'ItemAndEquipment' | 'All';
    bIsPvP: boolean;
    bEnablePlayerToPlayerDamage: boolean;
    bEnableFriendlyFire: boolean;
    bEnableInvaderEnemy: boolean;
    bEnableNonLoginPenalty: boolean;
    bEnableFastTravel: boolean;
    bIsStartLocationSelectByMap: boolean;
    bExistPlayerAfterLogout: boolean;
    bEnableDefenseOtherGuildPlayer: boolean;

    // Rates
    DayTimeSpeedRate: number;
    NightTimeSpeedRate: number;
    ExpRate: number;
    PalCaptureRate: number;
    PalSpawnNumRate: number;
    PalDamageRateAttack: number;
    PalDamageRateDefense: number;
    PlayerDamageRateAttack: number;
    PlayerDamageRateDefense: number;
    WorkSpeedRate: number;
    CollectionDropRate: number;
    CollectionObjectHpRate: number;
    CollectionObjectRespawnSpeedRate: number;
    EnemyDropItemRate: number;

    // Survival
    PlayerStomachDecreaceRate: number;
    PlayerStaminaDecreaceRate: number;
    PlayerAutoHPRegeneRate: number;
    PlayerAutoHpRegeneRateInSleep: number;
    PalStomachDecreaceRate: number;
    PalStaminaDecreaceRate: number;
    PalAutoHPRegeneRate: number;
    PalAutoHpRegeneRateInSleep: number;

    // World
    DropItemMaxNum: number;
    DropItemAliveMaxHours: number;
    BuildObjectDamageRate: number;
    BuildObjectDeteriorationDamageRate: number;
    BaseCampMaxNum: number;
    BaseCampWorkerMaxNum: number;
    GuildPlayerMaxNum: number;
    PalEggDefaultHatchingTime: number;
    SupplyDropSpan: number;
    bAutoResetGuildNoOnlinePlayers: boolean;
    AutoResetGuildTimeNoOnlinePlayers: number;
    bIsUseBackupSaveData: boolean;
}

export interface PalworldPreset {
    id: string;
    name: string;
    description: string;
    settings: Partial<PalworldSettings>;
}

export interface PalworldStatusResponse {
    settings: PalworldSettings;
    file_exists: boolean;
    parse_error?: boolean;
}

export const getSettings = async (uuid: string): Promise<PalworldStatusResponse> => {
    const { data } = await http.get(`${getBasePath(uuid)}`);
    return data.data;
};

export const saveSettings = async (uuid: string, settings: PalworldSettings): Promise<void> => {
    await http.post(`${getBasePath(uuid)}/settings`, settings);
};

export const getPresets = async (uuid: string): Promise<PalworldPreset[]> => {
    const { data } = await http.get(`${getBasePath(uuid)}/presets`);
    return data.data.presets;
};

export const applyPreset = async (uuid: string, presetId: string): Promise<PalworldSettings> => {
    const { data } = await http.post(`${getBasePath(uuid)}/apply-preset`, { preset_id: presetId });
    return data.data.settings;
};
