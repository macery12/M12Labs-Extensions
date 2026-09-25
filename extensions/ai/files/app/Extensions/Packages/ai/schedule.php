<?php

use Everest\Extensions\Packages\ai\AiConfiguration;
use Everest\Extensions\Packages\ai\Data\ProviderConfig;
use Everest\Services\Extensions\ExtensionScheduleBuilder;

/*
|--------------------------------------------------------------------------
| Scheduled work
|--------------------------------------------------------------------------
|
| Read by the panel only while the extension is enabled, so neither command
| needs to ask whether the module is switched on.
*/

return function (ExtensionScheduleBuilder $schedule): void {
    // Retention. Conversations, tool-call audit, usage logs and the durable
    // event log each have their own window; the command reads them itself.
    $schedule->command('p:ext:ai:prune')->hourly();

    // Re-assert Ollama's keep_alive before it lapses.
    //
    // In the panel this was wrapped in ->when(fn (ProviderFactory $f) =>
    // WarmAiModelCommand::shouldRun($f)), so no child process was launched for
    // a hosted provider or with warm-up switched off. A package's schedule has
    // no conditional verb -- the builder's allowlist is frequencies only,
    // deliberately, since a condition is arbitrary code running on every
    // scheduler tick -- so the same question is asked here instead, while the
    // schedule is being built. That is not weaker: the panel rebuilds this
    // file's schedule on every tick, so the answer is just as current as a
    // closure's would have been, and it decides without constructing a
    // provider driver.
    //
    // Keep-alive is an Ollama concept; no hosted provider holds a model
    // resident, which is why the provider is part of the condition and not
    // only the switch. The command repeats the whole guard internally for
    // manual invocations and for settings changed between tick and run.
    $warmsALocalModel = AiConfiguration::boolean('warm')
        && AiConfiguration::string('provider') === ProviderConfig::PROVIDER_OLLAMA;

    if ($warmsALocalModel) {
        $schedule->command('p:ext:ai:warm')->everyFiveMinutes();
    }
};
