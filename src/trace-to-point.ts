/**
 * Tail TraceItem → invocation_slo 数据点。
 * 上游：tail() events。
 * 下游：AE_INVOCATION_SLO.writeDataPoint。
 * 不变量：不转发 logs/headers；绑定缺失 / write 抛错 no-op；不 await。
 *
 * Column layout (dataset `invocation_slo`):
 *   index1 = scriptName
 *   blob1  = outcome
 *   blob2  = HTTP method，非 fetch 为 unknown
 *   blob3  = path 前两段
 *   double1 = cpuTimeMs
 *   double2 = ok (1/0)
 *   double3 = wallTimeMs
 */
import type { InvocationSloDataset } from './env.js';

export const INVOCATION_SLO_BINDING = 'AE_INVOCATION_SLO';
export const INVOCATION_SLO_DATASET = 'invocation_slo';
export const TAIL_SCRIPT_NAME = 'tal1';

const INDEX_MAX_BYTES = 96;
const BLOB_MAX_CHARS = 256;

export interface TraceLike {
    scriptName?: string | null;
    outcome?: string | null;
    cpuTimeMs?: number;
    wallTimeMs?: number;
    cpuTime?: number;
    wallTime?: number;
    event?: {
        request?: {
            url?: string;
            method?: string;
        };
    } | null;
}

export interface InvocationDataPoint {
    indexes: string[];
    blobs: string[];
    doubles: number[];
}

function clipBytes(value: string, maxBytes: number): string {
    const raw = String(value ?? '');
    const encoded = new TextEncoder().encode(raw);
    if (encoded.length <= maxBytes) {
        return raw;
    }
    return new TextDecoder().decode(encoded.slice(0, maxBytes));
}

function clipChars(value: string, maxChars: number): string {
    const raw = String(value ?? '');
    return raw.length <= maxChars ? raw : raw.slice(0, maxChars);
}

function finiteNonNeg(n: unknown): number {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
        return 0;
    }
    return n;
}

export function pathPrefix(url: string | undefined): string {
    if (!url) {
        return '';
    }
    try {
        const pathname = new URL(url).pathname;
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length === 0) {
            return '/';
        }
        return `/${parts.slice(0, 2).join('/')}`;
    } catch {
        return '';
    }
}

export function traceToPoint(event: TraceLike): InvocationDataPoint | null {
    const scriptName = String(event.scriptName ?? '').trim();
    if (!scriptName || scriptName === TAIL_SCRIPT_NAME) {
        return null;
    }
    const request = event.event?.request;
    const method = request?.method ? request.method.toUpperCase() : 'unknown';
    const outcome = String(event.outcome ?? 'unknown');
    const cpu = finiteNonNeg(event.cpuTimeMs ?? event.cpuTime);
    const wall = finiteNonNeg(event.wallTimeMs ?? event.wallTime);
    return {
        indexes: [clipBytes(scriptName, INDEX_MAX_BYTES)],
        blobs: [
            clipChars(outcome, BLOB_MAX_CHARS),
            clipChars(method, BLOB_MAX_CHARS),
            clipChars(pathPrefix(request?.url), BLOB_MAX_CHARS),
        ],
        doubles: [cpu, outcome === 'ok' ? 1 : 0, wall],
    };
}

export function recordInvocationSamples(
    dataset: InvocationSloDataset | undefined | null,
    events: readonly TraceLike[],
): void {
    if (!dataset || typeof dataset.writeDataPoint !== 'function') {
        return;
    }
    for (const event of events) {
        const point = traceToPoint(event);
        if (!point) {
            continue;
        }
        try {
            dataset.writeDataPoint(point);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`invocation_slo write failed script=${event.scriptName} error=${msg}`);
        }
    }
}
