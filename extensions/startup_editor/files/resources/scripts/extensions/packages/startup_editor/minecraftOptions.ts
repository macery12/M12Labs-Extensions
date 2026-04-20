/**
 * Minecraft startup option and preset definitions for the frontend.
 *
 * Option IDs here MUST stay in sync with the PHP allowlist in
 * MinecraftStartupOptions.php.
 */

// ─── Loader slugs ────────────────────────────────────────────────────────────

export type LoaderSlug =
    | 'forge'
    | 'neoforge'
    | 'fabric'
    | 'quilt'
    | 'paper'
    | 'purpur'
    | 'folia'
    | 'spigot'
    | 'bukkit'
    | 'vanilla';

export const LOADER_LABELS: Record<LoaderSlug, string> = {
    forge:    'Forge',
    neoforge: 'NeoForge',
    fabric:   'Fabric',
    quilt:    'Quilt',
    paper:    'Paper',
    purpur:   'Purpur',
    folia:    'Folia',
    spigot:   'Spigot',
    bukkit:   'Bukkit',
    vanilla:  'Vanilla',
};

// ─── Option definition ────────────────────────────────────────────────────────

export type OptionCategory = 'core' | 'gc' | 'performance' | 'server' | 'security';

export interface MinecraftOption {
    /** Must match a key in MinecraftStartupOptions::OPTIONS (PHP). */
    id: string;
    name: string;
    description: string;
    /** Shown on hover. Should be more detailed than description. */
    tooltip: string;
    category: OptionCategory;
    /** null = compatible with all loaders. */
    loaderCompat: LoaderSlug[] | null;
    /** Minimum Java major version (e.g. 8, 11, 17, 21). */
    minJava: number;
    /** IDs of options that cannot be enabled at the same time as this one. */
    incompatibleWith: string[];
    /** If true, pre-selected on a fresh load and shown with a ⭐ recommended badge. */
    recommended?: boolean;
    /**
     * If true, this option is always enabled and cannot be deselected by the user.
     * Shown with a 🔒 lock indicator instead of a checkbox.
     */
    alwaysEnabled?: boolean;
}

// ─── GC option IDs ────────────────────────────────────────────────────────────

/** All GC option IDs — shown in the dedicated GC dropdown, not as checkboxes. */
export const GC_OPTION_IDS = ['aikar_g1gc', 'zgc', 'shenandoah', 'g1gc_basic'] as const;
export type GcOptionId = typeof GC_OPTION_IDS[number];

/** Default GC selection shown on fresh load. */
export const DEFAULT_GC: GcOptionId = 'aikar_g1gc';

/**
 * Option IDs that are pre-selected on fresh load (excluding the default GC and
 * core_flags which is always-enabled separately).
 */
export const DEFAULT_ENABLED_OPTION_IDS: string[] = [
    'nogui',
    'jit_optimize',
    'terminal_compat',
    'log4j_fix',
];

export const MINECRAFT_OPTIONS: MinecraftOption[] = [
    // ── Core (always-on baseline) ────────────────────────────────────────────
    {
        id:              'core_flags',
        name:            'Core JVM Flags',
        description:     'Essential flags for Pterodactyl containers: AlwaysPreTouch, DisableExplicitGC, UseContainerSupport, ParallelRefProcEnabled.',
        tooltip:         '-XX:+AlwaysPreTouch pre-allocates heap memory at startup to prevent runtime lag spikes. -XX:+DisableExplicitGC prevents plugins from forcing GC. -XX:+UseContainerSupport ensures the JVM respects Docker/container memory limits — required for Pterodactyl. -XX:+ParallelRefProcEnabled speeds up reference processing during GC.',
        category:        'core',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        alwaysEnabled:   true,
    },

    // ── Garbage Collection ──────────────────────────────────────────────────
    {
        id:              'aikar_g1gc',
        name:            "G1GC — Aikar's Flags",
        description:     'Best for: general-purpose servers, Paper/Spigot, 4 GB–16 GB RAM. Most stable and widely used. Balanced performance and memory usage.',
        tooltip:         "A well-known set of G1GC JVM flags originally published by Aikar. Reduces GC pause times and avoids common Minecraft-related GC issues. Recommended for nearly every server regardless of loader or version. Best results on 4–16 GB RAM with Java 8+.",
        category:        'gc',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: ['zgc', 'shenandoah', 'g1gc_basic'],
        recommended:     true,
    },
    {
        id:              'zgc',
        name:            'ZGC (Generational)',
        description:     'Best for: high-RAM servers (16 GB+). Extremely low latency (near-zero pause times). Slightly higher CPU usage. Ideal for large modpacks or high player counts.',
        tooltip:         'ZGC with the Generational extension (Java 21+) provides sub-millisecond GC pauses. Requires at least Java 21 and works best with 16 GB+ of dedicated RAM. Higher CPU overhead than G1GC. Not compatible with G1GC-based options or String Deduplication.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         21,
        incompatibleWith: ['aikar_g1gc', 'shenandoah', 'g1gc_basic', 'string_dedup'],
    },
    {
        id:              'shenandoah',
        name:            'ShenandoahGC',
        description:     'Best for: low-pause setups on Java 17+. Middle ground between G1GC and ZGC. Good alternative if ZGC is unavailable.',
        tooltip:         'ShenandoahGC performs concurrent compaction to keep pause times very low. Available from Java 11 and uses the incremental-update (iu) mode for broadest compatibility. Good alternative when ZGC is not available. Not compatible with G1GC or ZGC options.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         11,
        incompatibleWith: ['aikar_g1gc', 'zgc', 'g1gc_basic', 'string_dedup'],
    },
    {
        id:              'g1gc_basic',
        name:            'Basic G1GC',
        description:     "Best for: minimal setups or debugging. Uses JVM defaults without Aikar's aggressive tuning.",
        tooltip:         "Enables the G1 garbage collector with JVM defaults. Use this only if you want a simple baseline or if Aikar's flags cause issues. Not compatible with ZGC, Shenandoah, or Aikar's flags.",
        category:        'gc',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: ['aikar_g1gc', 'zgc', 'shenandoah'],
    },

    // ── Performance ─────────────────────────────────────────────────────────
    {
        id:              'string_dedup',
        name:            'String Deduplication',
        description:     'Instructs G1GC to deduplicate equal String objects, saving heap memory.',
        tooltip:         'Enables -XX:+UseStringDeduplication, which causes G1GC to merge identical String objects in the heap. Reduces memory usage on servers with many duplicate strings (chat, items). Requires G1GC; not compatible with ZGC or Shenandoah.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: ['zgc', 'shenandoah'],
    },
    {
        id:              'jit_optimize',
        name:            'JIT Compiler Optimizations',
        description:     'Enables tiered compilation and string-concat optimisation in the JIT.',
        tooltip:         'Turns on -XX:+TieredCompilation (multi-tier JIT) and -XX:+OptimizeStringConcat. Generally beneficial for all Minecraft servers; helps reduce CPU usage over time as hot code paths are compiled.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     true,
    },
    {
        id:              'paper_modules',
        name:            'Paper Module Opens',
        description:     'Adds --add-opens flags required by Paper/Purpur on Java 16+.',
        tooltip:         'Paper and its forks (Purpur, Folia) need access to internal JDK classes via the Java module system. These --add-opens flags are required on Java 16+ and prevent reflective-access warnings and crashes. Only relevant for Paper-based servers.',
        category:        'performance',
        loaderCompat:    ['paper', 'purpur', 'folia'],
        minJava:         16,
        incompatibleWith: [],
    },

    // ── Terminal / Compatibility ─────────────────────────────────────────────
    {
        id:              'terminal_compat',
        name:            'Terminal Compatibility',
        description:     'Disables JLine and enables ANSI colour for Forge-style terminal output in containers.',
        tooltip:         'Sets -Dterminal.jline=false -Dterminal.ansi=true. Prevents JLine from crashing in headless container environments and ensures colour codes work properly. Recommended for Forge and NeoForge; safe for all servers.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     true,
    },

    // ── Security ────────────────────────────────────────────────────────────
    {
        id:              'log4j_fix',
        name:            'Log4Shell Mitigation',
        description:     'Disables Log4j2 JNDI message lookups (Log4Shell / CVE-2021-44228).',
        tooltip:         'Adds -Dlog4j2.formatMsgNoLookups=true to block the Log4Shell exploit. Modern Minecraft versions (1.18.1+) ship a patched log4j, but this flag is harmless and provides defence-in-depth for all versions.',
        category:        'security',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     true,
    },

    // ── Server Arguments ────────────────────────────────────────────────────
    {
        id:              'nogui',
        name:            'No GUI (--nogui)',
        description:     'Disables the Swing server GUI window. Required in headless/container environments.',
        tooltip:         'Passes --nogui to the server JAR. Prevents Minecraft from opening a Swing-based GUI window that would fail in a headless Docker container. Strongly recommended for all panel-hosted servers.',
        category:        'server',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     true,
    },
    {
        id:              'force_upgrade',
        name:            'Force World Upgrade (--forceUpgrade)',
        description:     'Forces the server to upgrade all loaded chunks on next start.',
        tooltip:         'Passes --forceUpgrade to the server JAR. Use this once after a major Minecraft version update to pre-convert all chunk data. Remove after the first successful start to avoid re-processing on every boot.',
        category:        'server',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
    },
    {
        id:              'bonus_chest',
        name:            'Bonus Chest (--bonusChest)',
        description:     'Spawns a bonus chest near the world spawn on a fresh world.',
        tooltip:         'Passes --bonusChest to the server JAR. Only takes effect when generating a new world. Safe to leave enabled on a new server; harmless on existing worlds.',
        category:        'server',
        loaderCompat:    ['vanilla', 'paper', 'purpur', 'spigot', 'bukkit', 'folia'],
        minJava:         8,
        incompatibleWith: [],
    },
    {
        id:              'eraseCache',
        name:            'Erase Cache (--eraseCache)',
        description:     'Tells Forge/NeoForge to wipe and rebuild its optimisation cache on next start.',
        tooltip:         'Passes --eraseCache to the Forge or NeoForge server JAR. Useful after updating mods to prevent stale cache entries from causing startup errors. Remove after the cache has been rebuilt.',
        category:        'server',
        loaderCompat:    ['forge', 'neoforge'],
        minJava:         8,
        incompatibleWith: [],
    },
];

// ─── Preset definition ────────────────────────────────────────────────────────

export interface Preset {
    /** Must match a key in MinecraftStartupOptions::PRESETS (PHP). */
    id: string;
    name: string;
    description: string;
    tooltip: string;
    /** GC option ID for this preset (null = no GC / JVM defaults). */
    gcId: GcOptionId | null;
    /** Non-GC option IDs this preset activates (core_flags always added automatically). */
    optionIds: string[];
    /** Optional: a loader this preset is best suited for. */
    recommendedLoader?: LoaderSlug | null;
    /** Tailwind colour class for the accent stripe. */
    accentColor: string;
    /** Xms in MB for this preset. */
    xmsMb: number;
}

export const PRESETS: Preset[] = [
    {
        id:               'basic_optimize',
        name:             'Basic Optimize',
        description:      "Aikar's G1GC + JIT + terminal compat + security. Recommended starting point.",
        tooltip:          "The recommended set of flags for every Minecraft server: Aikar's G1GC, JIT compiler optimisations, terminal-compatibility fixes, Log4Shell mitigation, and --nogui.",
        gcId:             'aikar_g1gc',
        optionIds:        ['jit_optimize', 'terminal_compat', 'log4j_fix', 'nogui'],
        recommendedLoader: null,
        accentColor:      'bg-blue-600',
        xmsMb:            256,
    },
    {
        id:               'large_modpack',
        name:             'Large Modpack',
        description:      "Aikar's G1GC + JIT tuning. Optimised for Forge/NeoForge packs with hundreds of mods.",
        tooltip:          "Combines Aikar's G1GC flags with JIT-compiler optimisations, Log4Shell mitigation, and terminal-compat fixes. Designed for Forge/NeoForge modpacks with large classpaths.",
        gcId:             'aikar_g1gc',
        optionIds:        ['jit_optimize', 'terminal_compat', 'log4j_fix', 'nogui'],
        recommendedLoader: 'forge',
        accentColor:      'bg-orange-600',
        xmsMb:            512,
    },
    {
        id:               'paper_performance',
        name:             'Paper Performance',
        description:      'Full performance stack for Paper/Purpur: Aikar + String Dedup + JIT + module opens.',
        tooltip:          "Enables Aikar's G1GC flags, String Deduplication for memory savings, JIT optimisations, Paper module-system opens, and Log4Shell mitigation. Ideal for high-player-count Paper or Purpur servers.",
        gcId:             'aikar_g1gc',
        optionIds:        ['string_dedup', 'jit_optimize', 'paper_modules', 'log4j_fix', 'nogui'],
        recommendedLoader: 'paper',
        accentColor:      'bg-green-600',
        xmsMb:            512,
    },
    {
        id:               'low_latency',
        name:             'Low Latency (ZGC)',
        description:      'Generational ZGC for near-zero GC pauses. Requires Java 21+ and 16 GB+ RAM.',
        tooltip:          "Uses Java 21's Generational ZGC (-XX:+UseZGC -XX:+ZGenerational) for the lowest possible GC latency. Best for servers with 16 GB+ of dedicated RAM and Java 21.",
        gcId:             'zgc',
        optionIds:        ['jit_optimize', 'terminal_compat', 'log4j_fix', 'nogui'],
        recommendedLoader: null,
        accentColor:      'bg-purple-600',
        xmsMb:            512,
    },
    {
        id:               'vanilla_clean',
        name:             'Vanilla Clean',
        description:      'Minimal config: basic G1GC + JIT + security. Great for vanilla or lightly modded servers.',
        tooltip:          'A clean, minimal flag set: basic G1GC, JIT optimisations, Log4Shell mitigation, and --nogui. Use this when you want a simple baseline without aggressive tuning.',
        gcId:             'g1gc_basic',
        optionIds:        ['jit_optimize', 'log4j_fix', 'nogui'],
        recommendedLoader: 'vanilla',
        accentColor:      'bg-zinc-500',
        xmsMb:            256,
    },
    {
        id:               'security_hardened',
        name:             'Security Hardened',
        description:      "Aikar's flags + Log4Shell mitigation + terminal compat. Defence-in-depth for any server.",
        tooltip:          "Aikar's G1GC combined with the Log4Shell mitigation flag and terminal-compat fixes. The security flag is harmless on patched versions but adds defence-in-depth for older modpacks running legacy Minecraft.",
        gcId:             'aikar_g1gc',
        optionIds:        ['jit_optimize', 'log4j_fix', 'terminal_compat', 'nogui'],
        recommendedLoader: null,
        accentColor:      'bg-red-700',
        xmsMb:            256,
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<OptionCategory, string> = {
    core:        '🔒 Core JVM Flags',
    gc:          '🗑️ Garbage Collector',
    performance: '⚡ Performance',
    server:      '🖥️ Server Arguments',
    security:    '🛡️ Security',
};

/** Returns options filtered by category. */
export function optionsByCategory(category: OptionCategory): MinecraftOption[] {
    return MINECRAFT_OPTIONS.filter(o => o.category === category);
}

/**
 * Returns true when a given option is compatible with the detected loader
 * (loaderCompat === null means all loaders).
 */
export function isCompatibleWithLoader(option: MinecraftOption, loader: string | null): boolean {
    if (!option.loaderCompat) return true;
    if (!loader) return true;
    return option.loaderCompat.includes(loader as LoaderSlug);
}

/**
 * Infer the loader slug from an egg name string (mirrors the PHP detectLoader method).
 */
export function detectLoaderFromEggName(eggName: string): LoaderSlug | null {
    const lower = eggName.toLowerCase();
    const checks: [string, LoaderSlug][] = [
        ['neoforge', 'neoforge'],
        ['forge',    'forge'],
        ['fabric',   'fabric'],
        ['quilt',    'quilt'],
        ['purpur',   'purpur'],
        ['folia',    'folia'],
        ['paper',    'paper'],
        ['spigot',   'spigot'],
        ['bukkit',   'bukkit'],
        ['vanilla',  'vanilla'],
    ];
    for (const [keyword, slug] of checks) {
        if (lower.includes(keyword)) return slug;
    }
    return null;
}

/**
 * Parse a raw startup command string and return the selected GC id plus non-GC
 * option IDs inferred from the command text.  Used to pre-populate the UI when
 * the server already has a custom override.
 */
export function inferStateFromCommand(rawCommand: string): {
    gcId: GcOptionId | null;
    selectedIds: string[];
    xmsMb: number;
} {
    if (!rawCommand) return { gcId: DEFAULT_GC, selectedIds: [...DEFAULT_ENABLED_OPTION_IDS], xmsMb: 256 };

    // Fragments that uniquely identify each option in a startup command string.
    const knownFragments: Record<string, string[]> = {
        core_flags:      ['-XX:+UseContainerSupport', '-XX:+AlwaysPreTouch'],
        aikar_g1gc:      ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=200'],
        zgc:             ['-XX:+UseZGC', '-XX:+ZGenerational'],
        shenandoah:      ['-XX:+UseShenandoahGC'],
        g1gc_basic:      ['-XX:+UseG1GC'],
        string_dedup:    ['-XX:+UseStringDeduplication'],
        jit_optimize:    ['-XX:+TieredCompilation'],
        paper_modules:   ['--add-opens java.base/java.lang=ALL-UNNAMED'],
        terminal_compat: ['-Dterminal.jline=false'],
        log4j_fix:       ['-Dlog4j2.formatMsgNoLookups=true'],
        nogui:           ['--nogui'],
        force_upgrade:   ['--forceUpgrade'],
        bonus_chest:     ['--bonusChest'],
        eraseCache:      ['--eraseCache'],
    };

    let gcId: GcOptionId | null = null;
    const selectedIds: string[] = [];

    for (const option of MINECRAFT_OPTIONS) {
        const fragments = knownFragments[option.id];
        if (!fragments || !fragments.every(f => rawCommand.includes(f))) continue;

        if (option.alwaysEnabled) continue; // core_flags is always on; don't add to selectedIds

        if ((GC_OPTION_IDS as readonly string[]).includes(option.id)) {
            // Avoid setting both aikar_g1gc and g1gc_basic (aikar is more specific)
            if (gcId === null) gcId = option.id as GcOptionId;
            continue;
        }

        // Skip if any already-selected option declares it incompatible.
        const blocked = selectedIds.some(selId => {
            const sel = MINECRAFT_OPTIONS.find(o => o.id === selId);
            return sel?.incompatibleWith.includes(option.id) ?? false;
        });
        if (blocked) continue;

        selectedIds.push(option.id);
    }

    // Parse Xms value from command (e.g. -Xms256M)
    const xmsMatch = rawCommand.match(/-Xms(\d+)[Mm]/);
    const xmsMb = xmsMatch ? parseInt(xmsMatch[1], 10) : 256;

    return { gcId, selectedIds, xmsMb };
}

