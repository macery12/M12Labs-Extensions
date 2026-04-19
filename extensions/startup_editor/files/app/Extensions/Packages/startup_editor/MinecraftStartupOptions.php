<?php

namespace Everest\Extensions\Packages\startup_editor;

/**
 * Defines the allowlist of Minecraft startup options and presets.
 *
 * Each option maps an ID to:
 *   - jvm_flags:     JVM arguments inserted before "-jar" (space-separated string)
 *   - server_args:   Arguments inserted after the jar file (space-separated string)
 *   - loader_compat: null = all loaders; string[] = only these loader slugs
 *   - min_java:      Minimum Java major version required (int)
 *
 * Options are the single source of truth for command generation and validation.
 * The frontend TypeScript file carries display metadata (names, descriptions, etc.)
 * and the IDs here must stay in sync with those in minecraftOptions.ts.
 */
class MinecraftStartupOptions
{
    public const OPTIONS = [
        // ── Garbage Collection ────────────────────────────────────────────
        'aikar_g1gc' => [
            'jvm_flags'    => '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200'
                . ' -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch'
                . ' -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M'
                . ' -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4'
                . ' -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90'
                . ' -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32'
                . ' -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 8,
        ],
        'zgc' => [
            'jvm_flags'    => '-XX:+UseZGC -XX:+ZGenerational -XX:+AlwaysPreTouch',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 21,
        ],
        'shenandoah' => [
            'jvm_flags'    => '-XX:+UseShenandoahGC -XX:ShenandoahGCMode=iu -XX:+AlwaysPreTouch',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 11,
        ],
        'g1gc_basic' => [
            'jvm_flags'    => '-XX:+UseG1GC',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 8,
        ],

        // ── Performance ───────────────────────────────────────────────────
        'string_dedup' => [
            'jvm_flags'    => '-XX:+UseStringDeduplication',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 8,
        ],
        'jit_optimize' => [
            'jvm_flags'    => '-XX:+TieredCompilation -XX:+OptimizeStringConcat',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 8,
        ],
        'paper_modules' => [
            'jvm_flags'    => '--add-opens java.base/java.lang=ALL-UNNAMED'
                . ' --add-opens java.base/java.net=ALL-UNNAMED'
                . ' --add-opens java.base/java.nio=ALL-UNNAMED'
                . ' --add-opens java.base/sun.nio.ch=ALL-UNNAMED',
            'server_args'  => '',
            'loader_compat' => ['paper', 'purpur', 'folia'],
            'min_java'     => 16,
        ],

        // ── Terminal / Compatibility ──────────────────────────────────────
        'terminal_compat' => [
            'jvm_flags'    => '-Dterminal.jline=false -Dterminal.ansi=true',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 8,
        ],

        // ── Security ──────────────────────────────────────────────────────
        'log4j_fix' => [
            'jvm_flags'    => '-Dlog4j2.formatMsgNoLookups=true',
            'server_args'  => '',
            'loader_compat' => null,
            'min_java'     => 8,
        ],

        // ── Server Arguments ─────────────────────────────────────────────
        'nogui' => [
            'jvm_flags'    => '',
            'server_args'  => '--nogui',
            'loader_compat' => null,
            'min_java'     => 8,
        ],
        'force_upgrade' => [
            'jvm_flags'    => '',
            'server_args'  => '--forceUpgrade',
            'loader_compat' => null,
            'min_java'     => 8,
        ],
        'bonus_chest' => [
            'jvm_flags'    => '',
            'server_args'  => '--bonusChest',
            'loader_compat' => ['vanilla', 'paper', 'purpur', 'spigot', 'bukkit', 'folia'],
            'min_java'     => 8,
        ],
        'eraseCache' => [
            'jvm_flags'    => '',
            'server_args'  => '--eraseCache',
            'loader_compat' => ['forge', 'neoforge'],
            'min_java'     => 8,
        ],
    ];

    /**
     * Named presets; each holds an ordered list of option IDs to activate.
     */
    public const PRESETS = [
        'basic_optimize' => [
            'options' => ['aikar_g1gc', 'terminal_compat', 'nogui'],
        ],
        'large_modpack' => [
            'options' => ['aikar_g1gc', 'jit_optimize', 'terminal_compat', 'nogui'],
        ],
        'paper_performance' => [
            'options' => ['aikar_g1gc', 'string_dedup', 'jit_optimize', 'paper_modules', 'nogui'],
        ],
        'low_latency' => [
            'options' => ['zgc', 'terminal_compat', 'nogui'],
        ],
        'vanilla_clean' => [
            'options' => ['g1gc_basic', 'nogui'],
        ],
        'security_hardened' => [
            'options' => ['aikar_g1gc', 'log4j_fix', 'terminal_compat', 'nogui'],
        ],
    ];

    /**
     * Returns all valid option IDs.
     */
    public static function getValidOptionIds(): array
    {
        return array_keys(self::OPTIONS);
    }

    /**
     * Compose a startup command from a validated list of option IDs.
     *
     * Format: java -Xms128M -XX:MaxRAMPercentage=95.0 [jvm_flags] -jar [jarVar] [server_args]
     *
     * @param  string[]  $selectedOptionIds  Option IDs pre-validated against the allowlist by
     *                                        SaveStartupEditorRequest.  Unknown IDs are silently
     *                                        skipped as a defence-in-depth measure, but callers
     *                                        must validate before calling this method.
     */
    public static function buildStartupCommand(array $selectedOptionIds, string $jarVar): string
    {
        $jvmParts    = [];
        $serverParts = [];

        foreach ($selectedOptionIds as $id) {
            $option = self::OPTIONS[$id] ?? null;
            if ($option === null) {
                continue;
            }
            if ($option['jvm_flags'] !== '') {
                $jvmParts[] = $option['jvm_flags'];
            }
            if ($option['server_args'] !== '') {
                $serverParts[] = $option['server_args'];
            }
        }

        $parts = ['java', '-Xms128M', '-XX:MaxRAMPercentage=95.0'];

        foreach ($jvmParts as $flags) {
            $parts[] = $flags;
        }

        $parts[] = '-jar';
        $parts[] = $jarVar;

        foreach ($serverParts as $arg) {
            $parts[] = $arg;
        }

        return implode(' ', $parts);
    }

    /**
     * Extract the jar-file variable placeholder from an egg default command.
     *
     * Looks for patterns like: -jar {{SERVER_JARFILE}}
     * Falls back to the common default if not found.
     */
    public static function extractJarVariable(string $eggDefault): string
    {
        if (preg_match('/-jar\s+(\{\{[A-Z0-9_]+\}\})/i', $eggDefault, $matches)) {
            return $matches[1];
        }

        return '{{SERVER_JARFILE}}';
    }

    /**
     * Infer the Minecraft loader slug from an egg name.
     * Returns one of: forge, neoforge, fabric, quilt, paper, purpur,
     *                 spigot, bukkit, folia, vanilla, or null (unknown).
     */
    public static function detectLoader(string $eggName): ?string
    {
        $lower = strtolower($eggName);

        $map = [
            'neoforge'   => 'neoforge',
            'forge'      => 'forge',
            'fabric'     => 'fabric',
            'quilt'      => 'quilt',
            'purpur'     => 'purpur',
            'folia'      => 'folia',
            'paper'      => 'paper',
            'spigot'     => 'spigot',
            'bukkit'     => 'bukkit',
            'vanilla'    => 'vanilla',
        ];

        foreach ($map as $keyword => $slug) {
            if (str_contains($lower, $keyword)) {
                return $slug;
            }
        }

        return null;
    }
}
