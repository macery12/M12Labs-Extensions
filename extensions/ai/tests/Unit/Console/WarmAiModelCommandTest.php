<?php

namespace Everest\Tests\Unit\Extensions\ai\Console;

use Everest\Tests\Extensions\ai\AiPackageTestCase;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Data\ProviderConfig;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Everest\Extensions\Packages\ai\Console\Commands\WarmAiModelCommand;
use Illuminate\Console\Scheduling\Schedule;
use Everest\Services\Extensions\ExtensionScheduleService;

class WarmAiModelCommandTest extends AiPackageTestCase
{
    use RefreshDatabase;

    public function testHostedProviderIsNotEligibleEvenWhenWarmupWasPreviouslyEnabled(): void
    {
        $this->aiConfig(['enabled' => 'true']);
        $this->aiConfig(['warm' => 'true']);
        $this->aiConfig(['provider' => ProviderConfig::PROVIDER_ANTHROPIC]);

        $factory = app(ProviderFactory::class);

        $this->assertFalse(WarmAiModelCommand::shouldRun($factory));
        $this->assertFalse($this->warmupIsScheduled());
        $this->artisan('p:ext:ai:warm')
            ->expectsOutputToContain('AI warm-up skipped')
            ->assertSuccessful();
    }

    public function testEnabledOllamaWarmupIsEligibleForTheScheduler(): void
    {
        $this->aiConfig(['enabled' => 'true']);
        $this->aiConfig(['warm' => 'true']);
        $this->aiConfig(['provider' => ProviderConfig::PROVIDER_OLLAMA]);

        $this->assertTrue(WarmAiModelCommand::shouldRun(app(ProviderFactory::class)));
        $this->assertTrue($this->warmupIsScheduled());
    }

    /**
     * Whether the package's own schedule.php registers the warm-up.
     *
     * In the panel this was a core `->when()` closure evaluated on every
     * scheduler tick, so the test asked `filtersPass()`. A package schedule
     * has no conditional verb -- the builder's allowlist is frequencies only,
     * because a condition is arbitrary code running on every tick -- so the
     * decision moved to schedule-build time, and the question is now whether
     * the command is registered at all.
     */
    private function warmupIsScheduled(): bool
    {
        $schedule = new Schedule();
        app(ExtensionScheduleService::class)->register($schedule);

        return collect($schedule->events())
            ->contains(fn ($event): bool => str_contains((string) $event->command, 'p:ext:ai:warm'));
    }
}
