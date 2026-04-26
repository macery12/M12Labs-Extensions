// ─── Types ────────────────────────────────────────────────────────────────────

export type ServerType = 'vanilla' | 'spigot' | 'paper' | 'fabric' | 'forge' | 'neoforge';
export type FieldType = 'text' | 'boolean' | 'integer' | 'select' | 'port' | 'password' | 'textarea';
export type SectionId = 'general' | 'world' | 'gameplay' | 'performance' | 'resource_pack' | 'rcon_query' | 'security' | 'advanced';

export interface FieldOption {
    value: string;
    label: string;
}

export interface FieldDef {
    key: string;
    label: string;
    description: string;
    section: SectionId;
    type: FieldType;
    defaultValue: string;
    advanced?: boolean;
    options?: FieldOption[];
    min?: number;
    max?: number;
    minVersion?: string;
    removedVersion?: string;
    serverTypes?: ServerType[];
    basicHide?: boolean;
    required?: boolean;
    /** When true the field is controlled by the panel and must not be edited by the user. */
    panelManaged?: boolean;
}

export interface BiomePreset {
    id: string;
    name: string;
    description: string;
    levelType: string;
    supportedServerTypes: ServerType[];
    minVersion?: string;
    notes?: string;
}

export interface ValidationResult {
    field: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
}

export interface RecommendedSetting {
    key: string;
    value: string;
    reason: string;
}

// ─── Section labels ───────────────────────────────────────────────────────────

export const SECTION_LABELS: Record<SectionId, string> = {
    general:       '🌐 General',
    world:         '🌍 World',
    gameplay:      '⚔️ Gameplay',
    performance:   '⚡ Performance',
    resource_pack: '🎨 Resource Pack',
    rcon_query:    '🔌 RCON & Query',
    security:      '🔒 Security',
    advanced:      '⚙️ Advanced',
};

export const SECTIONS: SectionId[] = [
    'general', 'world', 'gameplay', 'performance',
    'resource_pack', 'rcon_query', 'security', 'advanced',
];

// ─── Field definitions ────────────────────────────────────────────────────────

export const FIELD_DEFS: FieldDef[] = [
    // ── General ──────────────────────────────────────────────────────────────
    {
        key: 'server-port',
        label: 'Server Port',
        description: 'The TCP port the server listens on. Managed by the panel — do not change.',
        section: 'general',
        type: 'port',
        defaultValue: '25565',
        min: 1,
        max: 65535,
        panelManaged: true,
    },
    {
        key: 'server-ip',
        label: 'Server IP',
        description: 'The IP address the server binds to. Managed by the panel — do not change.',
        section: 'general',
        type: 'text',
        defaultValue: '',
        panelManaged: true,
    },
    {
        key: 'motd',
        label: 'Message of the Day',
        description: 'The message shown in the server list. Supports color codes with §. Max 59 chars.',
        section: 'general',
        type: 'text',
        defaultValue: 'A Minecraft Server',
    },
    {
        key: 'max-players',
        label: 'Max Players',
        description: 'Maximum number of players allowed on the server at once.',
        section: 'general',
        type: 'integer',
        defaultValue: '20',
        min: 1,
        max: 1000,
    },
    {
        key: 'white-list',
        label: 'Whitelist',
        description: 'If enabled, only players on the whitelist can join.',
        section: 'general',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'enforce-whitelist',
        label: 'Enforce Whitelist',
        description: 'Kick players not on the whitelist when the whitelist is reloaded.',
        section: 'general',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'online-mode',
        label: 'Online Mode',
        description: 'Authenticate players against Mojang servers. Disable only on private networks.',
        section: 'general',
        type: 'boolean',
        defaultValue: 'true',
    },

    // ── World ────────────────────────────────────────────────────────────────
    {
        key: 'level-name',
        label: 'World Name',
        description: 'The name of the world folder.',
        section: 'world',
        type: 'text',
        defaultValue: 'world',
    },
    {
        key: 'level-seed',
        label: 'Level Seed',
        description: 'Seed for world generation. Leave blank for random.',
        section: 'world',
        type: 'text',
        defaultValue: '',
    },
    {
        key: 'level-type',
        label: 'Level Type',
        description: 'World generation type.',
        section: 'world',
        type: 'select',
        defaultValue: 'minecraft:default',
        options: [
            { value: 'minecraft:default',              label: 'Default' },
            { value: 'minecraft:flat',                 label: 'Flat' },
            { value: 'minecraft:large_biomes',         label: 'Large Biomes' },
            { value: 'minecraft:amplified',            label: 'Amplified' },
            { value: 'minecraft:single_biome_surface', label: 'Single Biome' },
        ],
    },
    {
        key: 'gamemode',
        label: 'Default Game Mode',
        description: 'The default gamemode for new players.',
        section: 'world',
        type: 'select',
        defaultValue: 'survival',
        options: [
            { value: 'survival',  label: 'Survival' },
            { value: 'creative',  label: 'Creative' },
            { value: 'adventure', label: 'Adventure' },
            { value: 'spectator', label: 'Spectator' },
        ],
    },
    {
        key: 'difficulty',
        label: 'Difficulty',
        description: 'The difficulty level of the server.',
        section: 'world',
        type: 'select',
        defaultValue: 'easy',
        options: [
            { value: 'peaceful', label: 'Peaceful' },
            { value: 'easy',     label: 'Easy' },
            { value: 'normal',   label: 'Normal' },
            { value: 'hard',     label: 'Hard' },
        ],
    },
    {
        key: 'generate-structures',
        label: 'Generate Structures',
        description: 'Whether to generate villages, strongholds, dungeons, etc.',
        section: 'world',
        type: 'boolean',
        defaultValue: 'true',
    },
    {
        key: 'allow-nether',
        label: 'Allow Nether',
        description: 'Allow players to travel to the Nether dimension.',
        section: 'world',
        type: 'boolean',
        defaultValue: 'true',
    },
    {
        key: 'view-distance',
        label: 'View Distance',
        description: 'Server-side chunk render distance. Higher values increase CPU/RAM usage significantly.',
        section: 'world',
        type: 'integer',
        defaultValue: '10',
        min: 2,
        max: 32,
    },
    {
        key: 'simulation-distance',
        label: 'Simulation Distance',
        description: 'Distance at which entities are ticked. Added in 1.18.',
        section: 'world',
        type: 'integer',
        defaultValue: '10',
        min: 2,
        max: 32,
        minVersion: '1.18',
    },
    {
        key: 'spawn-protection',
        label: 'Spawn Protection',
        description: 'Radius around world spawn protected from non-op players. 0 to disable.',
        section: 'world',
        type: 'integer',
        defaultValue: '16',
        min: 0,
        max: 100,
    },
    {
        key: 'max-world-size',
        label: 'Max World Size',
        description: 'Maximum radius of the world border in blocks.',
        section: 'world',
        type: 'integer',
        defaultValue: '29999984',
        min: 1,
        max: 29999984,
        advanced: true,
    },
    {
        key: 'initial-enabled-packs',
        label: 'Initial Enabled Packs',
        description: 'Data packs enabled when creating a new world.',
        section: 'world',
        type: 'text',
        defaultValue: 'vanilla',
        minVersion: '1.20',
        advanced: true,
    },
    {
        key: 'initial-disabled-packs',
        label: 'Initial Disabled Packs',
        description: 'Data packs disabled when creating a new world.',
        section: 'world',
        type: 'text',
        defaultValue: '',
        minVersion: '1.20',
        advanced: true,
    },

    // ── Gameplay ──────────────────────────────────────────────────────────────
    {
        key: 'pvp',
        label: 'PvP',
        description: 'Allow player-vs-player combat.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'true',
    },
    {
        key: 'allow-flight',
        label: 'Allow Flight',
        description: 'Allow players to use flight in survival. Prevents kick for flying mods.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'enable-command-block',
        label: 'Enable Command Blocks',
        description: 'Allow command blocks to execute commands.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'force-gamemode',
        label: 'Force Gamemode',
        description: 'Force players into the default gamemode on join.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'hardcore',
        label: 'Hardcore Mode',
        description: 'Players are permanently banned on death.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'spawn-animals',
        label: 'Spawn Animals',
        description: 'Allow passive animals to spawn.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'true',
    },
    {
        key: 'spawn-monsters',
        label: 'Spawn Monsters',
        description: 'Allow hostile mobs to spawn.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'true',
    },
    {
        key: 'spawn-npcs',
        label: 'Spawn NPCs / Villagers',
        description: 'Allow villagers and other NPCs to spawn.',
        section: 'gameplay',
        type: 'boolean',
        defaultValue: 'true',
    },

    // ── Performance ───────────────────────────────────────────────────────────
    {
        key: 'max-tick-time',
        label: 'Max Tick Time (ms)',
        description: 'Maximum milliseconds a tick may take before the watchdog kills the server. -1 to disable.',
        section: 'performance',
        type: 'integer',
        defaultValue: '60000',
        min: -1,
        max: 300000,
        advanced: true,
    },
    {
        key: 'network-compression-threshold',
        label: 'Network Compression Threshold',
        description: 'Byte threshold above which packets are compressed. -1 to disable, 0 to compress all.',
        section: 'performance',
        type: 'integer',
        defaultValue: '256',
        min: -1,
        max: 65536,
        advanced: true,
    },
    {
        key: 'entity-broadcast-range-percentage',
        label: 'Entity Broadcast Range %',
        description: 'Percentage of view-distance at which entities are broadcast to clients.',
        section: 'performance',
        type: 'integer',
        defaultValue: '100',
        min: 10,
        max: 1000,
        advanced: true,
    },
    {
        key: 'player-idle-timeout',
        label: 'Player Idle Timeout (min)',
        description: 'Minutes before idle players are kicked. 0 to disable.',
        section: 'performance',
        type: 'integer',
        defaultValue: '0',
        min: 0,
        max: 60,
    },
    {
        key: 'use-native-transport',
        label: 'Use Native Transport',
        description: 'Use optimised network transport (Linux epoll). Leave enabled on Linux.',
        section: 'performance',
        type: 'boolean',
        defaultValue: 'true',
        advanced: true,
    },

    // ── Resource Pack ─────────────────────────────────────────────────────────
    {
        key: 'resource-pack',
        label: 'Resource Pack URL',
        description: 'URL of a resource pack to push to players.',
        section: 'resource_pack',
        type: 'text',
        defaultValue: '',
    },
    {
        key: 'resource-pack-sha1',
        label: 'Resource Pack SHA1',
        description: 'SHA1 hash of the resource pack for integrity verification.',
        section: 'resource_pack',
        type: 'text',
        defaultValue: '',
    },
    {
        key: 'resource-pack-prompt',
        label: 'Resource Pack Prompt',
        description: 'Custom text shown when players are prompted to download the resource pack.',
        section: 'resource_pack',
        type: 'text',
        defaultValue: '',
    },
    {
        key: 'require-resource-pack',
        label: 'Require Resource Pack',
        description: 'Kick players who decline the resource pack.',
        section: 'resource_pack',
        type: 'boolean',
        defaultValue: 'false',
    },

    // ── RCON & Query ──────────────────────────────────────────────────────────
    {
        key: 'enable-rcon',
        label: 'Enable RCON',
        description: 'Enable the RCON remote console.',
        section: 'rcon_query',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'rcon-port',
        label: 'RCON Port',
        description: 'The TCP port RCON listens on.',
        section: 'rcon_query',
        type: 'port',
        defaultValue: '25575',
        min: 1,
        max: 65535,
    },
    {
        key: 'rcon-password',
        label: 'RCON Password',
        description: 'Password for RCON access. Must be set when RCON is enabled.',
        section: 'rcon_query',
        type: 'password',
        defaultValue: '',
    },
    {
        key: 'enable-query',
        label: 'Enable Query',
        description: 'Enable the GameSpy4 query protocol for server listing.',
        section: 'rcon_query',
        type: 'boolean',
        defaultValue: 'false',
    },
    {
        key: 'query-port',
        label: 'Query Port',
        description: 'The UDP port the query protocol listens on.',
        section: 'rcon_query',
        type: 'port',
        defaultValue: '25565',
        min: 1,
        max: 65535,
    },

    // ── Security ──────────────────────────────────────────────────────────────
    {
        key: 'enforce-secure-profile',
        label: 'Enforce Secure Profile',
        description: 'Require players to have a signed public key for chat signing.',
        section: 'security',
        type: 'boolean',
        defaultValue: 'true',
        minVersion: '1.19',
    },
    {
        key: 'previews-chat',
        label: 'Chat Previews',
        description: 'Show chat previews to clients before sending.',
        section: 'security',
        type: 'boolean',
        defaultValue: 'false',
        minVersion: '1.19',
        removedVersion: '1.19.1',
    },
    {
        key: 'op-permission-level',
        label: 'OP Permission Level',
        description: 'Permission level granted to operators (1=lowest, 4=highest).',
        section: 'security',
        type: 'select',
        defaultValue: '4',
        options: [
            { value: '1', label: '1 — Bypass spawn protection' },
            { value: '2', label: '2 — Singleplayer commands' },
            { value: '3', label: '3 — Manage players' },
            { value: '4', label: '4 — All commands' },
        ],
    },
    {
        key: 'function-permission-level',
        label: 'Function Permission Level',
        description: 'Default permission level for functions and datapacks.',
        section: 'security',
        type: 'select',
        defaultValue: '2',
        options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
        ],
        advanced: true,
    },
    {
        key: 'enable-jmx-monitoring',
        label: 'Enable JMX Monitoring',
        description: 'Enable JMX monitoring for external Java management tools.',
        section: 'security',
        type: 'boolean',
        defaultValue: 'false',
        minVersion: '1.16',
        advanced: true,
    },

    // ── Advanced ──────────────────────────────────────────────────────────────
    {
        key: 'broadcast-console-to-ops',
        label: 'Broadcast Console to Ops',
        description: 'Send console command output to online operators.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'true',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'broadcast-rcon-to-ops',
        label: 'Broadcast RCON to Ops',
        description: 'Send RCON command output to online operators.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'true',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'debug',
        label: 'Debug Mode',
        description: 'Enable server debug logging.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'false',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'sync-chunk-writes',
        label: 'Sync Chunk Writes',
        description: 'Write chunks synchronously to disk.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'true',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'log-ips',
        label: 'Log Player IPs',
        description: 'Log player IP addresses in the server console.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'true',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'hide-online-players',
        label: 'Hide Online Players',
        description: 'Hide the online player list from server list pings.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'false',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'accepts-transfers',
        label: 'Accepts Transfers',
        description: 'Allow this server to receive players transferred from other servers.',
        section: 'advanced',
        type: 'boolean',
        defaultValue: 'false',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'text-filtering-config',
        label: 'Text Filtering Config',
        description: 'Path to a text filtering configuration file.',
        section: 'advanced',
        type: 'text',
        defaultValue: '',
        basicHide: true,
        advanced: true,
    },
    {
        key: 'bug-report-link',
        label: 'Bug Report Link',
        description: 'URL shown to players when the server crashes.',
        section: 'advanced',
        type: 'text',
        defaultValue: '',
        basicHide: true,
        advanced: true,
    },
];

// ─── Helper: fields by section ────────────────────────────────────────────────

export function fieldsBySection(section: SectionId): FieldDef[] {
    return FIELD_DEFS.filter(f => f.section === section);
}

// ─── Helper: build default properties map ─────────────────────────────────────

export function buildDefaultProperties(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of FIELD_DEFS) {
        out[f.key] = f.defaultValue;
    }
    return out;
}

// ─── Version comparison ───────────────────────────────────────────────────────

export function compareVersions(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] ?? 0;
        const nb = pb[i] ?? 0;
        if (na !== nb) return na - nb;
    }
    return 0;
}

export function isFieldAvailable(
    field: FieldDef,
    version: string | null,
): 'available' | 'not_yet' | 'removed' {
    if (!version) return 'available';
    if (field.minVersion && compareVersions(version, field.minVersion) < 0) return 'not_yet';
    if (field.removedVersion && compareVersions(version, field.removedVersion) >= 0) return 'removed';
    return 'available';
}

// ─── Biome presets ────────────────────────────────────────────────────────────

export const BIOME_PRESETS: BiomePreset[] = [
    {
        id: 'bop',
        name: "Biomes O' Plenty",
        description: 'Adds 80+ new biomes for the Overworld and Nether.',
        levelType: 'biomesoplenty:biomesoplenty',
        supportedServerTypes: ['fabric', 'forge', 'neoforge'],
        notes: "Requires the Biomes O' Plenty mod on the server.",
    },
    {
        id: 'byg',
        name: "Oh The Biomes You'll Go",
        description: 'Large biome variety mod for the Overworld and Nether.',
        levelType: 'byg:byg',
        supportedServerTypes: ['fabric', 'forge', 'neoforge'],
        notes: 'BYG level-type may vary by version — check mod documentation.',
    },
    {
        id: 'terralith',
        name: 'Terralith',
        description: 'Overhauled terrain generation using vanilla biomes.',
        levelType: 'terraformersmc:terralith',
        supportedServerTypes: ['fabric', 'forge', 'neoforge'],
        notes: 'Terralith 2.0+ uses this level-type. Compatible with most other mods.',
    },
    {
        id: 'tectonic',
        name: 'Tectonic',
        description: 'Massive terrain overhaul with dramatic mountains and valleys.',
        levelType: 'tectonic:tectonic',
        supportedServerTypes: ['fabric', 'forge', 'neoforge'],
        notes: "Check Tectonic's documentation for your specific version's level-type.",
    },
    {
        id: 'wwoo',
        name: "William Wythers' Overhauled Overworld",
        description: 'Overhauls vanilla biomes with enhanced terrain and features.',
        levelType: 'wwoo:wwoo',
        supportedServerTypes: ['fabric', 'forge', 'neoforge'],
        notes: 'WWOO works best combined with Terralith.',
    },
    {
        id: 'amplified_nether',
        name: 'Amplified Nether',
        description: 'Expands the Nether vertically to full 384-block height.',
        levelType: 'amplifiednether:amplified_nether',
        supportedServerTypes: ['fabric', 'forge', 'neoforge'],
        notes: 'Only affects the Nether dimension.',
    },
];

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateField(
    key: string,
    value: string,
    allProperties: Record<string, string>,
): ValidationResult[] {
    const results: ValidationResult[] = [];

    const PORT_FIELDS = ['server-port', 'rcon-port', 'query-port'];

    if (PORT_FIELDS.includes(key)) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 65535) {
            results.push({ field: key, severity: 'error', message: 'Port must be between 1 and 65535.' });
        } else if (n < 1024) {
            results.push({ field: key, severity: 'warning', message: 'Using a well-known reserved port (< 1024) may require elevated privileges.' });
        }
    }

    if (key === 'rcon-port' || key === 'query-port') {
        const serverPort = allProperties['server-port'];
        if (serverPort && value === serverPort) {
            results.push({ field: key, severity: 'error', message: 'This port conflicts with the server port.' });
        }
    }

    if (key === 'max-players') {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
            results.push({ field: key, severity: 'error', message: 'Must be a positive integer.' });
        } else if (n > 100) {
            results.push({ field: key, severity: 'warning', message: 'More than 100 players may impact performance significantly.' });
        }
    }

    if (key === 'motd' && value.length > 59) {
        results.push({ field: key, severity: 'warning', message: `MOTD is ${value.length} chars; some clients truncate after 59.` });
    }

    if (key === 'rcon-password' && (value === '' || value.trim() === '')) {
        if (allProperties['enable-rcon'] === 'true') {
            results.push({ field: key, severity: 'warning', message: 'RCON password is empty while RCON is enabled.' });
        }
    }

    if (key === 'view-distance') {
        const n = Number(value);
        if (n > 12) {
            results.push({ field: key, severity: 'warning', message: 'View distance above 12 can significantly increase CPU and RAM usage.' });
        }
    }

    return results;
}

export function validateAll(
    properties: Record<string, string>,
): ValidationResult[] {
    return FIELD_DEFS.flatMap(f => validateField(f.key, properties[f.key] ?? f.defaultValue, properties));
}

// ─── Recommendations ──────────────────────────────────────────────────────────

export function getRecommendations(
    serverType: ServerType,
    _version: string | null,
): RecommendedSetting[] {
    const recs: RecommendedSetting[] = [];

    // Universal security recommendations
    recs.push({ key: 'online-mode', value: 'true', reason: 'Online mode authenticates players with Mojang — disable only on private networks.' });

    if (serverType === 'paper') {
        recs.push(
            { key: 'max-tick-time', value: '60000', reason: 'Paper handles its own watchdog; a safe tick-time prevents false kills.' },
            { key: 'network-compression-threshold', value: '256', reason: 'Recommended threshold for Paper servers.' },
            { key: 'view-distance', value: '8', reason: 'View distance 8 balances performance and gameplay on Paper.' },
        );
    }

    if (serverType === 'fabric') {
        recs.push(
            { key: 'view-distance', value: '8', reason: 'Fabric performance mods work best with view-distance 8.' },
            { key: 'simulation-distance', value: '6', reason: 'Simulation distance 6 reduces entity tick load.' },
        );
    }

    if (serverType === 'forge' || serverType === 'neoforge') {
        recs.push(
            { key: 'view-distance', value: '8', reason: 'Modpacks are heavy; view-distance 8 helps performance.' },
            { key: 'max-tick-time', value: '60000', reason: 'Some Forge mods have long ticks during world gen; a watchdog value of 60s prevents false kills.' },
        );
    }

    if (serverType === 'vanilla') {
        recs.push(
            { key: 'difficulty', value: 'normal', reason: 'Normal difficulty is the standard vanilla survival experience.' },
            { key: 'spawn-animals', value: 'true', reason: 'Animals are part of the vanilla survival experience.' },
            { key: 'pvp', value: 'true', reason: 'PvP is enabled by default in vanilla.' },
        );
    }

    return recs;
}
