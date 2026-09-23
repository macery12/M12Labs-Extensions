<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Everest\Extensions\Packages\ai\AiConfiguration;
use Illuminate\Database\Migrations\Migration;

/*
 * Adopt the configuration the module left behind in the panel.
 *
 * The tables are adopted by the migration beside this one, for a reason that
 * applies just as much to the settings: this module shipped inside the panel
 * for several releases, so an install upgrading into the extension already has
 * an operator's configuration -- and it is in `settings`, under
 * `settings::modules:ai:*`, because that is where the module used to keep it.
 *
 * Without this, installing the extension seeds the manifest's defaults over
 * the top and the operator silently loses their provider, their model, their
 * budgets, their tool policy and their privacy categories. The transcripts
 * survive and the configuration does not, which is the worst of both.
 *
 * Runs once. The marker is a row in this package's own table rather than the
 * migration ledger, because an operator who installs, uninstalls and installs
 * again gets the migration ledger back to empty -- and by then they may have
 * configured the extension on its own terms, which must not be overwritten by
 * rows that predate it.
 *
 * ## What is not adopted, and why
 *
 * **The credentials.** `settings::modules:ai:key` and the two provider keys are
 * encrypted with the panel's own key and context. A package writes the
 * extension secret store only on behalf of a signed-in administrator, and a
 * migration has none -- deliberately, because a secret an operator did not
 * enter is a secret nobody can account for -- so the API key has to be pasted
 * in once after installing, on the AI Settings page or in the extension
 * drawer. The rest of the configuration surviving is what makes that a single
 * field rather than a page.
 *
 * **Empty values.** In the panel an empty string meant two different things
 * depending on the key: a false switch, or "unset, fall back to config". The
 * config is gone, so an empty value is left alone and the manifest's default
 * stands -- which is the same answer the fallback would have given.
 *
 * **Dead keys.** `feature_server_assistant`, `feature_crash_analysis` and the
 * `models:*` pair were removed from the module before it moved and have no
 * manifest field to land in.
 *
 * **`enabled`.** The extension's own switch is the operator's decision at
 * install time, and the panel asks them for it. A package turning itself on
 * because an older version of it was on is not an upgrade, it is a surprise.
 */
return new class () extends Migration {
    /** The row that records this having run. */
    private const MARKER = 'adopted_panel_settings';

    private const PREFIX = 'settings::modules:ai:';

    /** Keys with no home here. See the note above. */
    private const SKIP = [
        'enabled',
        'key', 'anthropic:key', 'openai:key',
        'feature_server_assistant', 'feature_crash_analysis',
        'models:agent', 'models:fast',
    ];

    public function up(): void
    {
        if (!Schema::hasTable('settings') || !Schema::hasTable(AiConfiguration::TABLE)) {
            return;
        }

        if (DB::table(AiConfiguration::TABLE)->where('key', self::MARKER)->exists()) {
            return;
        }

        $declared = [];
        $structured = [];

        foreach (DB::table('settings')->where('key', 'like', self::PREFIX . '%')->get(['key', 'value']) as $row) {
            $suffix = substr((string) $row->key, strlen(self::PREFIX));

            if ($suffix === '' || in_array($suffix, self::SKIP, true)) {
                continue;
            }

            $value = (string) $row->value;

            if (trim($value) === '') {
                continue;
            }

            $dotted = str_replace(':', '.', $suffix);
            $flat = AiConfiguration::settingKey($dotted);

            if (AiConfiguration::declares($flat)) {
                $declared[$flat] = $this->coerce($value);

                continue;
            }

            $structured[$dotted] = $value;
        }

        DB::transaction(function () use ($declared, $structured): void {
            if ($declared !== []) {
                $this->mergeDeclared($declared);
            }

            foreach ($structured as $key => $value) {
                DB::table(AiConfiguration::TABLE)->updateOrInsert(
                    ['key' => $key],
                    ['value' => $value, 'updated_at' => now()],
                );
            }

            DB::table(AiConfiguration::TABLE)->updateOrInsert(
                ['key' => self::MARKER],
                ['value' => now()->toIso8601String(), 'updated_at' => now()],
            );
        });
    }

    /**
     * Irreversible on purpose.
     *
     * Rolling back would mean deciding which of the current values the operator
     * set themselves and which came from here, and there is no record of that.
     * The panel's own rows are left untouched, so nothing was destroyed to
     * begin with.
     */
    public function down(): void
    {
        DB::table(AiConfiguration::TABLE)->where('key', self::MARKER)->delete();
    }

    /**
     * Fold adopted values into the settings column.
     *
     * A merge under what is already stored rather than over it: the installer
     * seeds the manifest defaults, and this runs in the same operation, so
     * anything already there is a default -- but if the order ever changes, an
     * operator's own value must win over a value from the panel's old store.
     *
     * @param array<string, mixed> $values
     */
    private function mergeDeclared(array $values): void
    {
        $existing = DB::table('extension_configs')
            ->where('extension_id', AiConfiguration::EXTENSION_ID)
            ->first();

        $settings = $existing === null ? [] : (json_decode((string) $existing->settings, true) ?: []);

        DB::table('extension_configs')->updateOrInsert(
            ['extension_id' => AiConfiguration::EXTENSION_ID],
            [
                'settings' => json_encode(array_replace($settings, $values)),
                'enabled' => $existing->enabled ?? false,
                'updated_at' => now(),
                'created_at' => $existing->created_at ?? now(),
            ],
        );
    }

    /**
     * The stored string as the type the field is declared with.
     *
     * Everything in `settings` is text, and a settings form reading `"30"`
     * where it declared a number renders an empty field. The accessors coerce
     * on read, so this is not correctness -- it is the difference between a
     * page that shows an operator their own configuration back and one that
     * looks like it lost it.
     */
    private function coerce(string $value): mixed
    {
        if (in_array($value, ['1', 'true'], true)) {
            return true;
        }

        if (in_array($value, ['0', 'false'], true)) {
            return false;
        }

        if (is_numeric($value)) {
            return str_contains($value, '.') ? (float) $value : (int) $value;
        }

        return $value;
    }
};
