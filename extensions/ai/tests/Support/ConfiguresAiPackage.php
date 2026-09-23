<?php

namespace Everest\Tests\Extensions\ai;

use Everest\Models\User;
use Everest\Models\AdminRole;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Everest\Extensions\Packages\ai\AiConfiguration;
use Everest\Services\Extensions\ExtensionSecretStore;

/**
 * The package's configuration stores, for a test that has none.
 *
 * In the panel this module read `config('modules.ai.*')`, so a test set a
 * value by calling `config()->set(...)` — an in-memory write that needed no
 * database and no installed anything. A package has no config file: the same
 * dotted keys now resolve across the extension's settings column, its secret
 * store and its own table, all of which are rows.
 *
 * So a test that wants `agent.max_wall_seconds` to be 30 needs somewhere for
 * the 30 to live. This creates that somewhere:
 *
 * - `extension_configs`, core's table, which a unit run's `:memory:` database
 *   has never had a migration for;
 * - `ext_ai_settings`, this package's own, which no *core* migration creates
 *   at all — it ships in the package and runs at install time, so even a fully
 *   migrated integration database does not have it.
 *
 * Both are created only when absent, the same way {@see \Everest\Tests\TestCase}
 * creates `settings`, so this is a no-op against a database that already has
 * them.
 *
 * ## Why the writes go straight to the rows
 *
 * {@see \Everest\Extensions\Sdk\Services\PackageSettings::save()} is the real
 * writer, and it refuses unless the extension is in the panel's verified
 * runtime plan — correctly, since that plan is what validates a value against
 * its declared type. None of that exists in a test process, and standing up a
 * signed, installed, plan-resolved extension to set one integer would test the
 * platform rather than the agent. A fixture writes the row; the code under
 * test reads it through the real {@see AiConfiguration}.
 */
trait ConfiguresAiPackage
{
    /**
     * A file the harness staged beside these traits.
     *
     * Resolved from this file's own location rather than a written-out path,
     * because where the support tree lands in a panel checkout is the
     * harness's business and may change without the tests knowing.
     */
    protected function aiSupportPath(string $file): string
    {
        return __DIR__ . '/' . $file;
    }

    /**
     * Give the package a configuration, by the dotted keys it has always used.
     *
     * `$this->aiConfig(['agent.max_wall_seconds' => 30, 'provider' => 'ollama'])`
     * is the replacement for the module-era `config()->set('modules.ai.…')`.
     * A declared field lands in the settings column; anything else lands in
     * the package's own table, which is the same split {@see AiConfiguration}
     * reads back.
     *
     * @param array<string, mixed> $values
     */
    protected function aiConfig(array $values): void
    {
        $this->createAiStores();

        $declared = [];
        foreach ($values as $key => $value) {
            // `enabled` is the extension's own switch, which lives in a column
            // of its own -- the same short-circuit AiConfiguration::get() takes.
            if ($key === 'enabled') {
                $this->writeAiSettings([], filter_var($value, FILTER_VALIDATE_BOOL));

                continue;
            }

            $flat = AiConfiguration::settingKey($key);

            if (AiConfiguration::declares($flat)) {
                $declared[$flat] = $value;

                continue;
            }

            DB::table(AiConfiguration::TABLE)->updateOrInsert(
                ['key' => $key],
                ['value' => is_string($value) ? $value : json_encode($value), 'updated_at' => now()],
            );
        }

        if ($declared !== []) {
            $this->writeAiSettings($declared);
        }

        AiConfiguration::flush();
    }

    /**
     * Unset keys, so the packaged default answers again.
     *
     * The module-era `Setting::forget()`, which several tests use to prove
     * that a default is a default and not a value somebody happened to store.
     */
    protected function aiForget(string ...$keys): void
    {
        $this->createAiStores();

        $drop = [];
        foreach ($keys as $key) {
            if ($key === 'enabled') {
                $this->writeAiSettings([], false);

                continue;
            }

            $flat = AiConfiguration::settingKey($key);

            if (AiConfiguration::declares($flat)) {
                $drop[] = $flat;

                continue;
            }

            DB::table(AiConfiguration::TABLE)->where('key', $key)->delete();
        }

        if ($drop !== []) {
            $row = DB::table('extension_configs')
                ->where('extension_id', AiConfiguration::EXTENSION_ID)
                ->first();

            if ($row !== null) {
                $settings = json_decode((string) $row->settings, true) ?: [];
                DB::table('extension_configs')
                    ->where('extension_id', AiConfiguration::EXTENSION_ID)
                    ->update(['settings' => json_encode(array_diff_key($settings, array_flip($drop)))]);
            }
        }

        AiConfiguration::flush();
    }

    /**
     * Store a credential the manifest declares.
     *
     * Through the panel's real store, encryption and context binding included,
     * because the thing worth proving is that the package reads a credential
     * the way an operator wrote one -- not that a fixture can return a string.
     */
    protected function aiSecret(string $key, string $value): void
    {
        $this->createAiStores();

        app(ExtensionSecretStore::class)->put(AiConfiguration::EXTENSION_ID, $key, $value);
    }

    /** Switch the extension itself on or off, which is what `enabled` reads. */
    protected function aiEnabled(bool $enabled = true): void
    {
        $this->createAiStores();
        $this->writeAiSettings([], $enabled);
    }

    /**
     * A real panel owner.
     *
     * The advanced benchmark looks one up rather than fabricating one: the
     * role vocabulary is core's, a package is handed capability constants and
     * not the model behind them, and measuring the tool set an operator really
     * has is the more honest measurement anyway. That decision is what makes
     * this necessary -- the code under test issues a query, so the test owes
     * it a database to issue it against.
     *
     * Core's own migration builds the tables, rather than a hand-copied
     * schema that would drift the first time a column moved.
     */
    protected function aiOwner(): User
    {
        if (Schema::hasTable('users')) {
            $existing = User::query()->whereHas('adminRole', fn ($query) => $query->where('is_owner', true))->first();

            if ($existing instanceof User) {
                return $existing;
            }
        }

        $this->migrateCore('*_create_users_tables.php');

        // This one both adds `is_owner` and mints the protected Owner profile,
        // so the fixture does not have to know what an owner's permission set
        // is -- core decides that, and it changes.
        $this->migrateCore('*_create_owner_access_profile.php');

        $role = AdminRole::query()->where('is_owner', true)->firstOrFail();

        $user = new User();
        $user->forceFill([
            'uuid' => '00000000-0000-4000-8000-0000000000ff',
            'username' => 'ai-package-test-owner',
            'email' => 'ai-package-test-owner@example.test',
            'password' => 'x',
            'admin_role_id' => $role->id,
            'root_admin' => 1,
            'use_totp' => 0,
        ]);
        $user->save();

        return $user->refresh();
    }

    /** Run one of core's own migrations by filename glob. */
    private function migrateCore(string $glob): void
    {
        $matches = glob(base_path('database/migrations/' . $glob));

        if ($matches === false || $matches === []) {
            $this->fail(sprintf('No migration matching %s in this panel; the owner fixture cannot be built.', $glob));
        }

        Artisan::call('migrate', [
            '--path' => 'database/migrations/' . basename($matches[0]),
            '--force' => true,
        ]);
    }

    /**
     * Run the package's own migration, the way the installer does.
     *
     * Its tables were core's until the module was lifted out, so a test that
     * migrated the panel used to get `ext_ai_*` for free and the package's
     * tests passed without ever exercising the file that now creates them.
     * They do not exist in a panel that has not installed this extension,
     * which is the whole point, so the fixture installs it.
     *
     * The real migration rather than a hand-written schema: every create in it
     * is guarded, so this is idempotent, and a column that drifts from what
     * the package ships fails a test here instead of on a live install.
     */
    protected function migrateAiPackage(): void
    {
        $files = glob(app_path('Extensions/Packages/ai/database/migrations/*.php')) ?: [];
        sort($files);

        if ($files === []) {
            $this->fail('The AI package migrations are not staged.');
        }

        foreach ($files as $file) {
            // Schema only. The settings adoption is a one-time data move with
            // a marker; running it here would set the marker before the test
            // that exercises it has put anything in place to adopt.
            if (str_contains($file, 'adopt_panel_ai_settings')) {
                continue;
            }

            $migration = require $file;
            $migration->up();
        }
    }

    /**
     * Create the stores the package reads and writes: the two its configuration
     * lives in, and its own data tables.
     */
    protected function createAiStores(): void
    {
        if (!Schema::hasTable('extension_configs')) {
            Schema::create('extension_configs', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->string('extension_id')->unique();
                $table->boolean('enabled')->default(0);
                $table->json('allowed_nests')->nullable();
                $table->json('allowed_eggs')->nullable();
                $table->json('settings')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('extension_secrets')) {
            Schema::create('extension_secrets', function (Blueprint $table): void {
                $table->bigIncrements('id');
                $table->string('extension_id');
                $table->string('key', 64);
                $table->text('value');
                $table->unsignedInteger('key_version')->default(1);
                $table->char('context_hash', 64);
                $table->timestamp('rotated_at')->nullable();
                $table->unsignedInteger('updated_by')->nullable();
                $table->timestamps();
                $table->unique(['extension_id', 'key']);
            });
        }

        if (!Schema::hasTable(AiConfiguration::TABLE)) {
            Schema::create(AiConfiguration::TABLE, function (Blueprint $table): void {
                $table->string('key', 191)->primary();
                $table->longText('value')->nullable();
                $table->timestamp('updated_at')->nullable();
            });
        }

        $this->migrateAiPackage();
    }

    /**
     * Merge into the extension's settings column.
     *
     * A merge rather than a replace for the same reason the real writer
     * merges: a test that sets a provider and then a model must not find the
     * provider gone.
     *
     * @param array<string, mixed> $changes
     */
    private function writeAiSettings(array $changes, ?bool $enabled = null): void
    {
        $existing = DB::table('extension_configs')
            ->where('extension_id', AiConfiguration::EXTENSION_ID)
            ->first();

        $settings = $existing === null ? [] : (json_decode((string) $existing->settings, true) ?: []);

        DB::table('extension_configs')->updateOrInsert(
            ['extension_id' => AiConfiguration::EXTENSION_ID],
            [
                'enabled' => $enabled ?? ($existing->enabled ?? true),
                'settings' => json_encode(array_replace($settings, $changes)),
                'updated_at' => now(),
                'created_at' => $existing->created_at ?? now(),
            ],
        );
    }
}
