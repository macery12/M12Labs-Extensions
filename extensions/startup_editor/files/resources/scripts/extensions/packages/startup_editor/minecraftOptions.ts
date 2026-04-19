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

export type OptionCategory = 'gc' | 'performance' | 'server' | 'security';

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
    /** If true, shown with a ⭐ recommended badge. */
    recommended?: boolean;
}

export const MINECRAFT_OPTIONS: MinecraftOption[] = [
    // ── Garbage Collection ──────────────────────────────────────────────────
    {
        id:              'aikar_g1gc',
        name:            "Aikar's G1GC Flags",
        description:     'Highly-tuned G1 garbage-collector flags recommended for all Minecraft servers.',
        tooltip:         'A well-known set of G1GC JVM flags originally published by Aikar. Reduces GC pause times and avoids common Minecraft-related GC issues. Recommended for nearly every server regardless of loader or version.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: ['zgc', 'shenandoah', 'g1gc_basic'],
        recommended:     true,
    },
    {
        id:              'zgc',
        name:            'Generational ZGC',
        description:     'Ultra-low-latency garbage collector. Best for large, memory-rich servers on Java 21+.',
        tooltip:         'ZGC (with the Generational extension added in Java 21) provides sub-millisecond GC pauses. Requires at least Java 21 and works best when the server has plenty of RAM. Not compatible with G1GC-based options.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         21,
        incompatibleWith: ['aikar_g1gc', 'shenandoah', 'g1gc_basic', 'string_dedup'],
    },
    {
        id:              'shenandoah',
        name:            'ShenandoahGC',
        description:     'Low-pause GC available on Java 11+. A middle-ground between G1 and ZGC.',
        tooltip:         'ShenandoahGC performs concurrent compaction to keep pause times very low. Available from Java 11 and works on all loaders. Use "iu" (incremental-update) mode for most compatibility. Not compatible with G1GC or ZGC options.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         11,
        incompatibleWith: ['aikar_g1gc', 'zgc', 'g1gc_basic', 'string_dedup'],
    },
    {
        id:              'g1gc_basic',
        name:            'Basic G1GC',
        description:     'Enables G1GC without additional tuning. Suitable when you want GC control without the full Aikar preset.',
        tooltip:         "Enables the G1 garbage collector with JVM defaults. Use this only if you want to layer your own G1GC tuning on top, or if Aikar's flags cause issues. Not compatible with ZGC, Shenandoah, or Aikar's flags.",
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
        tooltip:         'Sets -Dterminal.jline=false -Dterminal.ansi=true. Prevents JLine from crashing in headless container environments and ensures colour codes work properly. Recommended for Forge and NeoForge; optional for others.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     false,
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
    /** IDs of options this preset activates. */
    optionIds: string[];
    /** Optional: a loader this preset is best suited for. */
    recommendedLoader?: LoaderSlug | null;
    /** Tailwind colour class for the accent stripe. */
    accentColor: string;
}

export const PRESETS: Preset[] = [
    {
        id:               'basic_optimize',
        name:             'Basic Optimize',
        description:      "Aikar's G1GC + terminal compat + No GUI. A safe starting point for any server.",
        tooltip:          "The minimum recommended set of flags for every Minecraft server: Aikar's well-tuned G1GC settings, terminal-compatibility fixes, and the --nogui flag to suppress the Swing window.",
        optionIds:        ['aikar_g1gc', 'terminal_compat', 'nogui'],
        recommendedLoader: null,
        accentColor:      'bg-blue-600',
    },
    {
        id:               'large_modpack',
        name:             'Large Modpack',
        description:      "Optimised for Forge/NeoForge packs with hundreds of mods. Adds JIT tuning on top of Aikar's flags.",
        tooltip:          "Combines Aikar's G1GC flags with JIT-compiler optimisations and terminal-compat flags. Designed for Forge/NeoForge modpacks with large classpaths where JIT warmup matters.",
        optionIds:        ['aikar_g1gc', 'jit_optimize', 'terminal_compat', 'nogui'],
        recommendedLoader: 'forge',
        accentColor:      'bg-orange-600',
    },
    {
        id:               'paper_performance',
        name:             'Paper Performance',
        description:      'Full performance stack for Paper/Purpur: Aikar + dedup + JIT + module opens.',
        tooltip:          "Enables Aikar's G1GC flags, String Deduplication for memory savings, JIT optimisations, and the required Paper module-system opens. Ideal for high-player-count Paper or Purpur servers.",
        optionIds:        ['aikar_g1gc', 'string_dedup', 'jit_optimize', 'paper_modules', 'nogui'],
        recommendedLoader: 'paper',
        accentColor:      'bg-green-600',
    },
    {
        id:               'low_latency',
        name:             'Low Latency (ZGC)',
        description:      'Generational ZGC for near-zero GC pauses. Requires Java 21+.',
        tooltip:          "Uses Java 21's Generational ZGC (-XX:+UseZGC -XX:+ZGenerational) with AlwaysPreTouch for the lowest possible GC latency. Best for servers with 8 GB+ of dedicated RAM and Java 21.",
        optionIds:        ['zgc', 'terminal_compat', 'nogui'],
        recommendedLoader: null,
        accentColor:      'bg-purple-600',
    },
    {
        id:               'vanilla_clean',
        name:             'Vanilla Clean',
        description:      'Minimal config: basic G1GC and No GUI. Great for a vanilla or lightly modded server.',
        tooltip:          'A clean, minimal flag set: just basic G1GC and --nogui. Use this when you want a simple baseline without any aggressive tuning.',
        optionIds:        ['g1gc_basic', 'nogui'],
        recommendedLoader: 'vanilla',
        accentColor:      'bg-zinc-500',
    },
    {
        id:               'security_hardened',
        name:             'Security Hardened',
        description:      "Aikar's flags + Log4Shell mitigation + terminal compat. Defence-in-depth for any server.",
        tooltip:          "Aikar's G1GC combined with the Log4Shell mitigation flag and terminal-compat fixes. The security flag is harmless on patched versions but adds defence-in-depth for older modpacks running legacy Minecraft.",
        optionIds:        ['aikar_g1gc', 'log4j_fix', 'terminal_compat', 'nogui'],
        recommendedLoader: null,
        accentColor:      'bg-red-700',
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<OptionCategory, string> = {
    gc:          '🗑️ Garbage Collection',
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
 * Parse a raw startup command string and return the set of known option IDs
 * whose flags are present in it.  Used to pre-populate the UI when the server
 * already has a custom override.
 */
export function inferSelectedOptionsFromCommand(rawCommand: string): string[] {
    if (!rawCommand) return [];

    // Fragments that uniquely identify each option in a startup command string.
    const knownFragments: Record<string, string[]> = {
        aikar_g1gc:      ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200'],
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

    const selectedIds: string[] = [];
    for (const option of MINECRAFT_OPTIONS) {
        const fragments = knownFragments[option.id];
        if (!fragments || !fragments.every(f => rawCommand.includes(f))) continue;

        // Skip this option if any already-selected option declares it incompatible.
        // This mirrors the incompatibleWith metadata so we don't need special cases.
        const blockedBySelected = selectedIds.some(selectedId => {
            const selectedOption = MINECRAFT_OPTIONS.find(o => o.id === selectedId);
            return selectedOption?.incompatibleWith.includes(option.id) ?? false;
        });
        if (blockedBySelected) continue;

        selectedIds.push(option.id);
    }
    return selectedIds;
}
