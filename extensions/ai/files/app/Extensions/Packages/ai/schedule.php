<?php

use Everest\Extensions\Packages\ai\AiConfiguration;
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
    // scheduler tick. The command already repeats that guard internally for
    // manual invocations and for settings changed between tick and run, so
    // what is lost is a process spawn every five minutes on installs that do
    // not warm, not correctness.
    if (AiConfiguration::boolean('warm')) {
        $schedule->command('p:ext:ai:warm')->everyFiveMinutes();
    }
};
