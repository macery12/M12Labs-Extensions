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

// ─── Java version tiers ───────────────────────────────────────────────────────

export type JavaVersionTier = 'java8_16' | 'java17_20' | 'java21_24' | 'java25plus';

export const JAVA_VERSION_TIER_LABELS: Record<JavaVersionTier, string> = {
    java8_16:   'Java 8–16',
    java17_20:  'Java 17–20',
    java21_24:  'Java 21–24',
    java25plus: 'Java 25+',
};

export const DEFAULT_JAVA_TIER: JavaVersionTier = 'java21_24';

/** Maximum Java major version represented by each tier (for minJava comparisons). */
export const TIER_MAX_JAVA: Record<JavaVersionTier, number> = {
    java8_16:   16,
    java17_20:  20,
    java21_24:  24,
    java25plus: Number.MAX_SAFE_INTEGER,
};

// ─── GC option IDs (needed by tier helpers below) ────────────────────────────

/** All GC option IDs — shown in the dedicated GC dropdown, not as checkboxes. */
export const GC_OPTION_IDS = ['aikar_g1gc', 'zgc', 'shenandoah', 'g1gc_basic'] as const;
export type GcOptionId = typeof GC_OPTION_IDS[number];

/** Default GC selection — depends on the default tier (java21_24). */
export const DEFAULT_GC: GcOptionId = 'zgc';

/** Returns the recommended default GC for a given tier. */
export function getDefaultGcForTier(tier: JavaVersionTier): GcOptionId {
    return (tier === 'java21_24' || tier === 'java25plus') ? 'zgc' : 'aikar_g1gc';
}

/** Returns true when the given GC option should show a "Recommended" badge for the tier. */
export function isGcRecommendedForTier(gcId: string, tier: JavaVersionTier): boolean {
    if (tier === 'java21_24' || tier === 'java25plus') return gcId === 'zgc';
    return gcId === 'aikar_g1gc';
}

/** Returns true when the given GC option should show a "Legacy / Not recommended" badge for the tier. */
export function isGcLegacyForTier(gcId: string, tier: JavaVersionTier): boolean {
    return (tier === 'java21_24' || tier === 'java25plus') && gcId === 'aikar_g1gc';
}

/** Returns extra option IDs that are always forced on for the given tier + GC combo. */
export function getAlwaysIncludedForContext(tier: JavaVersionTier, gcId: GcOptionId | null): string[] {
    const ids: string[] = ['core_flags', 'always_pre_touch', 'disable_explicit_gc', 'use_container_support'];
    // ParallelRefProcEnabled is G1GC-specific — exclude it when ZGC is selected
    if (gcId !== 'zgc') ids.push('parallel_ref_proc_enabled');
    // native_access is forced on for Java 25+
    if (tier === 'java25plus') ids.push('native_access');
    return ids;
}

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

/**
 * Option IDs that are pre-selected on fresh load (excluding the default GC and
 * always-enabled items which are included automatically).
 * Reflects the default tier (java21_24): native_access is recommended for Java 21+.
 */
export const DEFAULT_ENABLED_OPTION_IDS: string[] = [
    'jit_optimize',
    'terminal_compat',
    'log4j_fix',
    'native_access',
];

export const MINECRAFT_OPTIONS: MinecraftOption[] = [
    // ── Core JVM Performance Toggles (always-on, shown individually) ─────────
    {
        id:              'always_pre_touch',
        name:            'AlwaysPreTouch',
        description:     'Best for: stable tick pacing on all servers. Tradeoff: slower startup due to full heap pre-allocation.',
        tooltip:         '-XX:+AlwaysPreTouch forces the JVM to allocate and touch all heap memory at startup. This prevents lazy allocation from causing lag spikes during gameplay when new memory regions are first accessed.',
        category:        'server',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        alwaysEnabled:   true,
    },
    {
        id:              'disable_explicit_gc',
        name:            'DisableExplicitGC',
        description:     'Best for: avoiding plugin-triggered pause spikes. Tradeoff: explicit GC calls from plugins are ignored.',
        tooltip:         '-XX:+DisableExplicitGC prevents code from triggering explicit garbage collection via System.gc(). Some poorly-written plugins call this, causing unexpected GC pauses. Disabling it lets the JVM manage GC automatically.',
        category:        'server',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        alwaysEnabled:   true,
    },
    {
        id:              'use_container_support',
        name:            'UseContainerSupport',
        description:     'Best for: containerized hosting (Docker/M12labs). Benefit: JVM respects cgroup memory limits correctly.',
        tooltip:         '-XX:+UseContainerSupport makes the JVM container-aware so it correctly reads memory limits from Docker/M12labs. Without this, the JVM may see the host machine\'s total RAM instead of the container limit.',
        category:        'server',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        alwaysEnabled:   true,
    },
    {
        id:              'parallel_ref_proc_enabled',
        name:            'ParallelRefProcEnabled',
        description:     'Best for: object-heavy workloads. Benefit: faster reference processing during GC and lower pause pressure.',
        tooltip:         '-XX:+ParallelRefProcEnabled allows the garbage collector to process soft, weak, and phantom references in parallel during GC. This can significantly reduce GC pause times on servers with many objects.',
        category:        'server',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        alwaysEnabled:   true,
    },

    // ── Garbage Collection ──────────────────────────────────────────────────
    {
        id:              'aikar_g1gc',
        name:            "G1GC — Aikar's Flags",
        description:     'Best for: Java 8–20 servers. Classic G1GC tuning by Aikar. For Java 21+, ZGC is now the recommended choice.',
        tooltip:         "A well-known set of G1GC JVM flags originally published by Aikar. Reduces GC pause times and avoids common Minecraft-related GC issues. Recommended for Java 8–20 servers. For Java 21+, consider ZGC for lower pause times. Best results on 4–16 GB RAM.",
        category:        'gc',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: ['zgc', 'shenandoah', 'g1gc_basic'],
    },
    {
        id:              'zgc',
        name:            'ZGC — Low Latency',
        description:     'Best for: Java 21+ servers. Mojang\'s default as of Minecraft 26.1. Lowest pause times. Tradeoff: slightly higher memory overhead.',
        tooltip:         'ZGC with the Generational extension (Java 21+) provides sub-millisecond GC pauses. Recommended for Java 21+ servers. For Java 25+, automatically uses Compact Object Headers and String Deduplication (Mojang\'s defaults for Minecraft 26.1). Not compatible with G1GC-based options.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         21,
        incompatibleWith: ['aikar_g1gc', 'shenandoah', 'g1gc_basic', 'string_dedup'],
    },
    {
        id:              'shenandoah',
        name:            'ShenandoahGC',
        description:     'Best for: low-pause setups on Java 11+ when ZGC is unavailable. Tradeoff: tuning ecosystem is less common than G1GC.',
        tooltip:         'ShenandoahGC performs concurrent compaction to keep pause times very low. Available from Java 11 and uses the incremental-update (iu) mode for broadest compatibility. Good alternative when ZGC is not available. Not compatible with G1GC or ZGC options.',
        category:        'gc',
        loaderCompat:    null,
        minJava:         11,
        incompatibleWith: ['aikar_g1gc', 'zgc', 'g1gc_basic', 'string_dedup'],
    },
    {
        id:              'g1gc_basic',
        name:            'Basic G1GC',
        description:     "Best for: conservative baselines, compatibility checks, or debugging. Tradeoff: less tuned than Aikar's G1GC.",
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
        description:     'Best for: memory-constrained G1GC servers with many duplicate strings. Tradeoff: small additional GC CPU work.',
        tooltip:         'Enables -XX:+UseStringDeduplication, which causes G1GC to merge identical String objects in the heap. Reduces memory usage on servers with many duplicate strings (chat, items). Requires G1GC; not compatible with ZGC or Shenandoah.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: ['zgc', 'shenandoah'],
    },
    {
        id:              'jit_optimize',
        name:            'JIT Compiler Optimizations',
        description:     'Best for: all server types. Benefit: better long-run CPU efficiency as hot paths are optimized.',
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
        description:     'Best for: Paper-family servers on Java 16+. Benefit: avoids module-access errors and reflective warnings.',
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
        description:     'Best for: container or headless consoles. Benefit: more reliable terminal behavior and readable color output.',
        tooltip:         'Sets -Dterminal.jline=false -Dterminal.ansi=true. Helps avoid terminal issues in containerized or headless environments and keeps colour output readable. Commonly useful for modded server consoles, but safe for all server types.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     true,
    },
    {
        id:              'native_access',
        name:            'Native Access (JNA Warning Suppression)',
        description:     'Best for: Java 21+ servers. Benefit: suppresses JNA restricted method warnings that will become errors in a future Java release.',
        tooltip:         '--enable-native-access=ALL-UNNAMED allows JNA (Java Native Access) to call restricted native methods without warnings. In Java 21+ these generate warnings; in a future release they will become errors. Recommended for Java 21+; automatically forced on for Java 25+.',
        category:        'performance',
        loaderCompat:    null,
        minJava:         21,
        incompatibleWith: [],
        recommended:     true,
    },

    // ── Security ────────────────────────────────────────────────────────────
    {
        id:              'log4j_fix',
        name:            'Log4Shell Mitigation',
        description:     'Best for: all server types. Benefit: defense-in-depth against Log4Shell-style lookup abuse.',
        tooltip:         'Adds -Dlog4j2.formatMsgNoLookups=true to block the Log4Shell exploit. Modern Minecraft versions (1.18.1+) ship a patched log4j, but this flag is harmless and provides defence-in-depth for all versions.',
        category:        'security',
        loaderCompat:    null,
        minJava:         8,
        incompatibleWith: [],
        recommended:     true,
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
        description:      "Best for: most servers as a default baseline. Includes: Aikar G1GC, JIT tuning, terminal compatibility, and security hardening.",
        tooltip:          "The recommended set of flags for every Minecraft server: Aikar's G1GC, JIT compiler optimisations, terminal-compatibility fixes, and Log4Shell mitigation.",
        gcId:             'aikar_g1gc',
        optionIds:        ['jit_optimize', 'terminal_compat', 'log4j_fix'],
        recommendedLoader: null,
        accentColor:      'bg-blue-600',
        xmsMb:            256,
    },
    {
        id:               'large_modpack',
        name:             'Large Modpack',
        description:      "Best for: large modded environments with heavy classpaths. Includes: Aikar G1GC, JIT tuning, terminal compatibility, and security hardening.",
        tooltip:          "Combines Aikar's G1GC flags with JIT compiler optimisations, Log4Shell mitigation, and terminal compatibility fixes. Best suited to large modded environments where startup footprint and classpath size are higher than average.",
        gcId:             'aikar_g1gc',
        optionIds:        ['jit_optimize', 'terminal_compat', 'log4j_fix'],
        recommendedLoader: 'forge',
        accentColor:      'bg-orange-600',
        xmsMb:            512,
    },
    {
        id:               'paper_performance',
        name:             'Paper Performance',
        description:      'Best for: Paper-family servers under higher player load. Includes: Aikar G1GC, String Deduplication, JIT tuning, module opens, and security hardening.',
        tooltip:          "Enables Aikar's G1GC flags, String Deduplication for memory savings, JIT optimisations, Paper module-system opens, and Log4Shell mitigation. Ideal for high-player-count Paper or Purpur servers.",
        gcId:             'aikar_g1gc',
        optionIds:        ['string_dedup', 'jit_optimize', 'paper_modules', 'log4j_fix'],
        recommendedLoader: 'paper',
        accentColor:      'bg-green-600',
        xmsMb:            512,
    },
    {
        id:               'low_latency',
        name:             'Low Latency (ZGC)',
        description:      'Best for: high-memory, low-latency targets. Includes: Generational ZGC with JIT, terminal compatibility, and security hardening. Requires Java 21+ and 16 GB+ RAM.',
        tooltip:          "Uses Java 21's Generational ZGC (-XX:+UseZGC -XX:+ZGenerational) for the lowest possible GC latency. Best for servers with 16 GB+ of dedicated RAM and Java 21.",
        gcId:             'zgc',
        optionIds:        ['jit_optimize', 'terminal_compat', 'log4j_fix'],
        recommendedLoader: null,
        accentColor:      'bg-purple-600',
        xmsMb:            512,
    },
    {
        id:               'vanilla_clean',
        name:             'Vanilla Clean',
        description:      'Best for: lightweight or conservative setups. Includes: basic G1GC, JIT tuning, and security hardening.',
        tooltip:          'A clean, minimal flag set: basic G1GC, JIT optimisations, and Log4Shell mitigation. Use this when you want a simple baseline without aggressive tuning.',
        gcId:             'g1gc_basic',
        optionIds:        ['jit_optimize', 'log4j_fix'],
        recommendedLoader: 'vanilla',
        accentColor:      'bg-zinc-500',
        xmsMb:            256,
    },
    {
        id:               'security_hardened',
        name:             'Security Hardened',
        description:      "Best for: security-first configurations on any server type. Includes: Aikar G1GC, terminal compatibility, JIT tuning, and Log4Shell mitigation.",
        tooltip:          "Aikar's G1GC combined with the Log4Shell mitigation flag and terminal-compat fixes. The security flag is harmless on patched versions but adds defence-in-depth for older modpacks running legacy Minecraft.",
        gcId:             'aikar_g1gc',
        optionIds:        ['jit_optimize', 'log4j_fix', 'terminal_compat'],
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
    server:      '⚙️ Core JVM Performance Toggles',
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
    xmxMb: number;
    javaVersionTier: JavaVersionTier;
} {
    if (!rawCommand) return { gcId: DEFAULT_GC, selectedIds: [...DEFAULT_ENABLED_OPTION_IDS], xmsMb: 256, xmxMb: 0, javaVersionTier: DEFAULT_JAVA_TIER };

    // Fragments that uniquely identify each option in a startup command string.
    const knownFragments: Record<string, string[]> = {
        always_pre_touch:          ['-XX:+AlwaysPreTouch'],
        disable_explicit_gc:       ['-XX:+DisableExplicitGC'],
        use_container_support:     ['-XX:+UseContainerSupport'],
        parallel_ref_proc_enabled: ['-XX:+ParallelRefProcEnabled'],
        aikar_g1gc:                ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=200'],
        // zgc_java25 must be checked before zgc to avoid a partial match
        zgc_java25:                ['-XX:+UseZGC', '-XX:+ZGenerational', '-XX:+UseCompactObjectHeaders'],
        zgc:                       ['-XX:+UseZGC', '-XX:+ZGenerational'],
        shenandoah:                ['-XX:+UseShenandoahGC'],
        g1gc_basic:                ['-XX:+UseG1GC'],
        string_dedup:              ['-XX:+UseStringDeduplication'],
        jit_optimize:              ['-XX:+TieredCompilation'],
        paper_modules:             ['--add-opens java.base/java.lang=ALL-UNNAMED'],
        terminal_compat:           ['-Dterminal.jline=false'],
        native_access:             ['--enable-native-access=ALL-UNNAMED'],
        log4j_fix:                 ['-Dlog4j2.formatMsgNoLookups=true'],
    };

    let gcId: GcOptionId | null = null;
    let isJava25ZGC = false;
    const selectedIds: string[] = [];

    // Check for zgc_java25 first (more specific than zgc) before the main option loop
    const zgc25Fragments = knownFragments['zgc_java25'];
    if (zgc25Fragments && zgc25Fragments.every(f => rawCommand.includes(f))) {
        gcId = 'zgc';
        isJava25ZGC = true;
    }

    for (const option of MINECRAFT_OPTIONS) {
        const fragments = knownFragments[option.id];
        if (!fragments || !fragments.every(f => rawCommand.includes(f))) continue;

        if (option.alwaysEnabled) continue; // always-on items are included automatically; don't add to selectedIds

        if ((GC_OPTION_IDS as readonly string[]).includes(option.id)) {
            // Set gcId only once; the pre-check above may have already set it for zgc_java25
            if (gcId === null) gcId = option.id as GcOptionId;
            continue;
        }

        // Skip string_dedup if it was baked into zgc_java25 flags
        if (option.id === 'string_dedup' && isJava25ZGC) continue;

        // Skip if any already-selected option declares it incompatible.
        const blocked = selectedIds.some(selId => {
            const sel = MINECRAFT_OPTIONS.find(o => o.id === selId);
            return sel?.incompatibleWith.includes(option.id) ?? false;
        });
        if (blocked) continue;

        selectedIds.push(option.id);
    }

    // Infer Java version tier from detected GC
    let javaVersionTier: JavaVersionTier;
    if (isJava25ZGC) {
        javaVersionTier = 'java25plus';
    } else if (gcId === 'zgc') {
        javaVersionTier = 'java21_24';
    } else if (gcId === 'shenandoah') {
        javaVersionTier = 'java17_20';
    } else if (gcId !== null) {
        // G1GC detected — assume Java 17-20 for modern servers using G1GC
        javaVersionTier = 'java17_20';
    } else {
        javaVersionTier = DEFAULT_JAVA_TIER;
    }

    // Parse Xms and Xmx values from command (e.g. -Xms256M, -Xmx1024M)
    const xmsMatch = rawCommand.match(/-Xms(\d+)[Mm]/);
    const xmxMatch = rawCommand.match(/-Xmx(\d+)[Mm]/);
    const xmsMb = xmsMatch ? parseInt(xmsMatch[1], 10) : 256;
    const xmxMb = xmxMatch ? parseInt(xmxMatch[1], 10) : 0; // 0 = not found; caller should substitute suggested value

    return { gcId, selectedIds, xmsMb, xmxMb, javaVersionTier };
}
