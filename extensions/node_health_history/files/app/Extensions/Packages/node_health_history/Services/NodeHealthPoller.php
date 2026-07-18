<?php

namespace Everest\Extensions\Packages\node_health_history\Services;

use Everest\Exceptions\Http\Connection\DaemonConnectionException;
use Everest\Models\ExtensionConfig;
use Everest\Models\Node;
use Everest\Repositories\Wings\DaemonConfigurationRepository;
use Illuminate\Support\Facades\DB;

/**
 * Samples each node's wings /api/system endpoint and records a snapshot row.
 * Extracted from the artisan command so the polling logic can be reused/tested
 * independently of the console.
 */
class NodeHealthPoller
{
    public const EXTENSION_ID = 'node_health_history';
    public const TABLE = 'ext_node_health_history_snapshots';

    public function __construct(private DaemonConfigurationRepository $repository)
    {
    }

    /**
     * Poll every node once and prune expired snapshots.
     *
     * @return array{polled: int, healthy: int, pruned: int}
     */
    public function poll(): array
    {
        $config = ExtensionConfig::getByExtensionId(self::EXTENSION_ID);
        $retentionDays = (int) ($config?->settings['retention_days'] ?? 30);

        $polled = 0;
        $healthy = 0;

        foreach (Node::all() as $node) {
            $polled++;
            $snapshot = $this->sampleNode($node);
            if ($snapshot['healthy']) {
                $healthy++;
            }
            DB::table(self::TABLE)->insert($snapshot);
        }

        $pruned = $this->prune($retentionDays);

        return ['polled' => $polled, 'healthy' => $healthy, 'pruned' => $pruned];
    }

    /**
     * @return array<string, mixed> a row ready to insert into the snapshots table
     */
    private function sampleNode(Node $node): array
    {
        $base = [
            'node_id' => $node->id,
            'captured_at' => now(),
            'healthy' => false,
            'latency_ms' => null,
            'wings_version' => null,
            'memory_bytes' => null,
            'memory_total_bytes' => null,
            'error' => null,
        ];

        $startedAt = microtime(true);

        try {
            $info = $this->repository->setNode($node)->getSystemInformation();
        } catch (DaemonConnectionException $exception) {
            return array_merge($base, ['error' => substr($exception->getMessage(), 0, 250)]);
        } catch (\Throwable $exception) {
            return array_merge($base, ['error' => substr($exception->getMessage(), 0, 250)]);
        }

        return array_merge($base, [
            'healthy' => true,
            'latency_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            'wings_version' => $info['version'] ?? null,
            'memory_bytes' => $info['system']['memory'] ?? ($info['memory_bytes'] ?? null),
            'memory_total_bytes' => $info['system']['memory_total'] ?? null,
        ]);
    }

    private function prune(int $retentionDays): int
    {
        if ($retentionDays <= 0) {
            return 0;
        }

        return DB::table(self::TABLE)
            ->where('captured_at', '<', now()->subDays($retentionDays))
            ->delete();
    }
}
