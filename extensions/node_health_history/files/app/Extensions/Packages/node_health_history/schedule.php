<?php

use Everest\Services\Extensions\ExtensionScheduleBuilder;

/**
 * Registered by ExtensionScheduleService only while this extension is enabled.
 *
 * The builder is not Laravel's Schedule: it exposes command() for commands this
 * package declared under capabilities.commands, and only the frequency verbs on
 * its allowlist. cron() is absent by design, so the poll cadence is a select of
 * supported intervals rather than a free-form number that has to be rendered
 * into a cron expression.
 */
return function (ExtensionScheduleBuilder $schedule): void {
    $config = \Everest\Models\ExtensionConfig::getByExtensionId('node_health_history');
    $interval = (string) ($config?->settings['poll_interval_minutes'] ?? '5');

    $frequencies = [
        '1' => 'everyMinute',
        '5' => 'everyFiveMinutes',
        '10' => 'everyTenMinutes',
        '15' => 'everyFifteenMinutes',
        '30' => 'everyThirtyMinutes',
        '60' => 'hourly',
    ];

    // Falls back rather than throwing: a settings row written before an upgrade
    // narrowed the choices must not take the whole scheduler run down with it.
    $frequency = $frequencies[$interval] ?? 'everyFiveMinutes';

    $schedule->command('p:ext:node-health-history:poll')->{$frequency}();
};
