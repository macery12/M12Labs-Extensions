import http from '@/lib/http';

// Talks to this extension's admin API, mounted by the panel under
// /api/application/extensions/ext/<id> (admin-authed, session same-origin).
const BASE = '/api/application/extensions/ext/node_health_history';

export interface NodeHealthPoint {
    capturedAt: string;
    healthy: boolean;
    latencyMs: number | null;
}

export interface NodeHealth {
    nodeId: number;
    name: string;
    currentlyHealthy: boolean;
    wingsVersion: string | null;
    latestLatencyMs: number | null;
    uptimePercent: number;
    sampleCount: number;
    series: NodeHealthPoint[];
}

export async function getNodeHealth(hours = 24): Promise<NodeHealth[]> {
    const { data } = await http.get(BASE, { params: { hours } });
    return data.data as NodeHealth[];
}
