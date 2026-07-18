<?php

namespace Everest\Extensions\Packages\node_health_history\Console\Commands;

use Everest\Extensions\Packages\node_health_history\Services\NodeHealthPoller;
use Everest\Models\ExtensionConfig;
use Illuminate\Console\Command;

class PollNodeHealthCommand extends Command
{
    protected $signature = 'p:ext:node-health-history:poll';

    protected $description = 'Sample each node\'s wings health and record a snapshot (Node Health History extension).';

    public function handle(NodeHealthPoller $poller): int
    {
        // Second enable-gate: the scheduler only registers this command for
        // enabled extensions, but it can also be run manually, so guard here.
        $config = ExtensionConfig::getByExtensionId(NodeHealthPoller::EXTENSION_ID);
        if (!$config || !$config->enabled) {
            $this->components->warn('Node Health History is disabled; nothing was polled.');

            return self::SUCCESS;
        }

        $result = $poller->poll();

        $this->components->info(sprintf(
            'Polled %d node(s): %d healthy, %d snapshot(s) pruned.',
            $result['polled'],
            $result['healthy'],
            $result['pruned']
        ));

        return self::SUCCESS;
    }
}
