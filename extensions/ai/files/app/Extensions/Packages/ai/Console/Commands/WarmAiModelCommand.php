<?php

namespace Everest\Extensions\Packages\ai\Console\Commands;

use Illuminate\Console\Command;
use Everest\Extensions\Packages\ai\AiConfiguration;
use Everest\Extensions\Packages\ai\ProviderFactory;
use Everest\Extensions\Packages\ai\Data\ProviderConfig;
use Everest\Extensions\Packages\ai\Providers\OllamaProvider;

class WarmAiModelCommand extends Command
{
    protected $signature = 'p:ext:ai:warm';

    protected $description = 'Keep the configured Ollama model loaded in memory so users never hit a cold start.';

    /**
     * Whether an Ollama warm-up is useful for the current configuration.
     *
     * The scheduler uses the same predicate so hosted providers do not launch
     * a five-minute no-op process. The command repeats the check because it can
     * also be invoked manually, and settings may change after a schedule tick
     * has decided that the event is due.
     */
    public static function shouldRun(ProviderFactory $factory): bool
    {
        $enabled = AiConfiguration::boolean('enabled');
        $warm = AiConfiguration::boolean('warm');
        $provider = $factory->provider();

        return $enabled && $warm && $provider === ProviderConfig::PROVIDER_OLLAMA;
    }

    public function handle(ProviderFactory $factory): int
    {
        if (!self::shouldRun($factory)) {
            $this->line('AI warm-up skipped (disabled, warm-up off, or provider is not Ollama).');

            return Command::SUCCESS;
        }

        $driver = $factory->make();

        if ($driver instanceof OllamaProvider && $driver->warm()) {
            $this->info('Ollama model warmed successfully.');

            return Command::SUCCESS;
        }

        $this->warn('Ollama model warm-up failed — see the application log.');

        return Command::FAILURE;
    }
}
