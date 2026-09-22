<?php

namespace Everest\Tests\Unit\Extensions\ai;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\AiConfiguration;

/**
 * Installing the extension must not reset an operator's configuration.
 *
 * The tables were always adopted; the settings were not, and the consequence
 * on a real upgrade was that the transcripts survived and the provider, model,
 * budgets, tool policy and privacy categories were replaced by the manifest's
 * defaults. That is worse than either outcome on its own, because the module
 * looks installed and configured and is neither.
 */
class AdoptsPanelSettingsTest extends AiPackageTestCase
{
    /** The panel rows a pre-extension install would have. */
    private const LEGACY = [
        'settings::modules:ai:enabled' => 'true',
        'settings::modules:ai:provider' => 'anthropic',
        'settings::modules:ai:model' => 'claude-sonnet-5',
        'settings::modules:ai:max_tokens' => '2500',
        'settings::modules:ai:temperature' => '0.3',
        'settings::modules:ai:agent:enabled' => '1',
        'settings::modules:ai:agent:max_steps' => '30',
        'settings::modules:ai:agent:allow_destructive_batches' => '',
        'settings::modules:ai:agent:max_tools' => '',
        'settings::modules:ai:privacy:categories' => '["email","ip"]',
        'settings::modules:ai:risk_overrides' => '{"files_write":"write"}',
        'settings::modules:ai:key' => 'encrypted-blob',
        'settings::modules:ai:feature_crash_analysis' => '1',
    ];

    public function setUp(): void
    {
        parent::setUp();

        if (!Schema::hasTable('settings')) {
            Schema::create('settings', function (Blueprint $table): void {
                $table->string('key')->unique();
                $table->text('value');
            });
        }

        DB::table('settings')->where('key', 'like', 'settings::modules:ai:%')->delete();
        DB::table(AiConfiguration::TABLE)->delete();
        DB::table('extension_configs')->where('extension_id', 'ai')->delete();

        foreach (self::LEGACY as $key => $value) {
            DB::table('settings')->insert(['key' => $key, 'value' => $value]);
        }
    }

    public function testDeclaredValuesArriveAsTheirDeclaredTypes(): void
    {
        $this->adopt();

        $this->assertSame('anthropic', AiConfiguration::get('provider'));
        $this->assertSame('claude-sonnet-5', AiConfiguration::get('model'));

        // Not the strings "2500" and "0.3": a settings form declaring a number
        // renders an empty field when it is handed text.
        $this->assertSame(2500, AiConfiguration::get('max_tokens'));
        $this->assertSame(0.3, AiConfiguration::get('temperature'));
        $this->assertTrue(AiConfiguration::get('agent.enabled'));
        $this->assertSame(30, AiConfiguration::get('agent.max_steps'));
    }

    public function testStructuredValuesGoToThePackagesOwnTable(): void
    {
        $this->adopt();

        $this->assertSame(['email', 'ip'], AiConfiguration::list('privacy.categories'));
        $this->assertSame(['files_write' => 'write'], AiConfiguration::list('risk_overrides'));
    }

    /**
     * An empty value meant two different things in the panel -- a false switch,
     * or "unset, use the config default" -- and the config is gone. Leaving it
     * alone gives the same answer the fallback would have.
     */
    public function testEmptyValuesAreLeftToTheManifestDefault(): void
    {
        $this->adopt();

        $stored = DB::table('extension_configs')->where('extension_id', 'ai')->value('settings');
        $settings = json_decode((string) $stored, true);

        $this->assertArrayNotHasKey('agent_max_tools', $settings);
        $this->assertArrayNotHasKey('agent_allow_destructive_batches', $settings);
    }

    /**
     * The credential cannot come across: a package has no writer for the
     * encrypted secret store, which is what stops a secret existing that no
     * operator entered.
     */
    public function testTheCredentialIsNotAdopted(): void
    {
        $this->adopt();

        $stored = json_decode((string) DB::table('extension_configs')->where('extension_id', 'ai')->value('settings'), true);

        $this->assertArrayNotHasKey('key', $stored);
        $this->assertArrayNotHasKey('api_key', $stored);
        $this->assertSame([], DB::table(AiConfiguration::TABLE)->where('value', 'encrypted-blob')->get()->all());
    }

    /** The extension's own switch stays the operator's decision at install. */
    public function testTheExtensionDoesNotEnableItself(): void
    {
        $this->adopt();

        $this->assertFalse((bool) DB::table('extension_configs')->where('extension_id', 'ai')->value('enabled'));
    }

    /** A second install must not overwrite what the operator has since set. */
    public function testAdoptionRunsOnlyOnce(): void
    {
        $this->adopt();

        DB::table('settings')->where('key', 'settings::modules:ai:model')->update(['value' => 'something-else']);
        $this->adopt();

        $this->assertSame('claude-sonnet-5', AiConfiguration::get('model'));
    }

    private function adopt(): void
    {
        $migration = require app_path(
            'Extensions/Packages/ai/database/migrations/2026_09_22_000001_adopt_panel_ai_settings.php'
        );
        $migration->up();

        AiConfiguration::flush();
    }
}
