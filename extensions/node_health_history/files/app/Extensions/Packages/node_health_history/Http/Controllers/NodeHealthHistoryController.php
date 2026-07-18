<?php

namespace Everest\Extensions\Packages\node_health_history\Http\Controllers;

use Everest\Extensions\Packages\node_health_history\Http\Requests\GetNodeHealthHistoryRequest;
use Everest\Extensions\Packages\node_health_history\Services\NodeHealthPoller;
use Everest\Http\Controllers\Api\Application\ApplicationApiController;
use Everest\Models\Node;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class NodeHealthHistoryController extends ApplicationApiController
{
    /**
     * Per-node current status + uptime, plus a recent time series for charting.
     */
    public function index(GetNodeHealthHistoryRequest $request): JsonResponse
    {
        $hours = (int) $request->input('hours', 24);
        $since = now()->subHours($hours);

        $rows = DB::table(NodeHealthPoller::TABLE)
            ->where('captured_at', '>=', $since)
            ->orderBy('captured_at')
            ->get();

        $nodeNames = Node::query()->pluck('name', 'id');

        $byNode = [];
        foreach ($rows as $row) {
            $byNode[$row->node_id][] = $row;
        }

        $nodes = [];
        foreach ($byNode as $nodeId => $snapshots) {
            $total = count($snapshots);
            $healthyCount = 0;
            $series = [];
            foreach ($snapshots as $snapshot) {
                if ($snapshot->healthy) {
                    $healthyCount++;
                }
                $series[] = [
                    'capturedAt' => $snapshot->captured_at,
                    'healthy' => (bool) $snapshot->healthy,
                    'latencyMs' => $snapshot->latency_ms !== null ? (int) $snapshot->latency_ms : null,
                ];
            }

            $latest = $snapshots[$total - 1];
            $nodes[] = [
                'nodeId' => (int) $nodeId,
                'name' => $nodeNames[$nodeId] ?? ('Node #' . $nodeId),
                'currentlyHealthy' => (bool) $latest->healthy,
                'wingsVersion' => $latest->wings_version,
                'latestLatencyMs' => $latest->latency_ms !== null ? (int) $latest->latency_ms : null,
                'uptimePercent' => $total > 0 ? round($healthyCount / $total * 100, 1) : 0.0,
                'sampleCount' => $total,
                'series' => $series,
            ];
        }

        usort($nodes, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return new JsonResponse([
            'object' => 'list',
            'data' => $nodes,
            'meta' => ['hours' => $hours],
        ]);
    }
}
