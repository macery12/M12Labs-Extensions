<?php

use Everest\Models\ExtensionConfig;
use Illuminate\Console\Scheduling\Schedule;

/**
 * Registered by ExtensionScheduleService only while this extension is enabled.
 * The poll cadence follows the extension's own poll_interval_minutes setting.
 */
return function (Schedule $schedule): void {
    $config = ExtensionConfig::getByExtensionId('node_health_history');
    // Clamped to 1-59: the value fills the minute field of a */N cron expression.
    $interval = (int) ($config?->settings['poll_interval_minutes'] ?? 5);
    $interval = max(1, min(59, $interval));

    $schedule->command('p:ext:node-health-history:poll')
        ->cron(sprintf('*/%d * * * *', $interval))
        ->withoutOverlapping();
};
