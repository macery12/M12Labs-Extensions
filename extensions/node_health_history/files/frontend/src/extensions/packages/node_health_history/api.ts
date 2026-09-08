import { createExtensionAdminClient } from '@/extensions-sdk';

// The SDK client is bound to this extension's own admin namespace, which the
// panel mounts at /api/application/extensions/ext/node_health_history. The base
// URL is derived from the extension id rather than written here, so a package
// cannot address another extension's routes.
const client = createExtensionAdminClient('node_health_history');

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
    return client.get<NodeHealth[]>('/', { params: { hours } });
}
