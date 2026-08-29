import { describe, expect, it, vi } from 'vitest';
import type { InvocationSloDataset } from '../src/env.js';
import {
    INVOCATION_SLO_BINDING,
    INVOCATION_SLO_DATASET,
    pathPrefix,
    recordInvocationSamples,
    traceToPoint,
} from '../src/trace-to-point.js';

function fakeDataset(): { ds: InvocationSloDataset; write: ReturnType<typeof vi.fn> } {
    const write = vi.fn();
    return { ds: { writeDataPoint: write }, write };
}

describe('pathPrefix', () => {
    it('keeps first two path segments and drops query', () => {
        expect(pathPrefix('https://api.mailworld.uk/v1/chat/invest?x=1')).toBe('/v1/chat');
    });

    it('returns / for origin-only url', () => {
        expect(pathPrefix('https://example.com/')).toBe('/');
    });

    it('returns empty on missing or invalid url', () => {
        expect(pathPrefix(undefined)).toBe('');
        expect(pathPrefix('not a url')).toBe('');
    });
});

describe('traceToPoint', () => {
    it('maps fetch ok invocation to fixed column order', () => {
        expect(
            traceToPoint({
                scriptName: 'llm-gateway-worker',
                outcome: 'ok',
                cpuTimeMs: 12,
                wallTimeMs: 40,
                event: {
                    request: {
                        method: 'post',
                        url: 'https://api.mailworld.uk/v1/chat/general',
                    },
                },
            }),
        ).toEqual({
            indexes: ['llm-gateway-worker'],
            blobs: ['ok', 'POST', '/v1/chat'],
            doubles: [12, 1, 40],
        });
    });

    it('maps exception and null event (cron/queue) as unknown method', () => {
        expect(
            traceToPoint({
                scriptName: 'notify-worker',
                outcome: 'exception',
                event: null,
            }),
        ).toEqual({
            indexes: ['notify-worker'],
            blobs: ['exception', 'unknown', ''],
            doubles: [0, 0, 0],
        });
    });

    it('accepts cpuTime/wallTime aliases and skips tal1 self traces', () => {
        expect(
            traceToPoint({
                scriptName: 'edge-gateway-worker',
                outcome: 'ok',
                cpuTime: 3,
                wallTime: 9,
                event: { request: { method: 'GET', url: 'https://api.mailworld.uk/health' } },
            })?.doubles,
        ).toEqual([3, 1, 9]);
        expect(traceToPoint({ scriptName: 'tal1', outcome: 'ok' })).toBeNull();
        expect(traceToPoint({ scriptName: '', outcome: 'ok' })).toBeNull();
    });
});

describe('recordInvocationSamples', () => {
    it('no-ops when binding missing', () => {
        expect(() =>
            recordInvocationSamples(undefined, [{ scriptName: 'llm-gateway-worker', outcome: 'ok' }]),
        ).not.toThrow();
    });

    it('writes one point per producer event and fail-opens on throw', () => {
        const { ds, write } = fakeDataset();
        recordInvocationSamples(ds, [
            { scriptName: 'tal1', outcome: 'ok' },
            { scriptName: 'advisor-worker', outcome: 'exceededCpu' },
            { scriptName: 'invest-rss-worker', outcome: 'ok' },
        ]);
        expect(write).toHaveBeenCalledTimes(2);
        expect(write.mock.calls[0][0].blobs[0]).toBe('exceededCpu');
        expect(write.mock.calls[0][0].doubles[1]).toBe(0);

        const throwing: InvocationSloDataset = {
            writeDataPoint: () => {
                throw new Error('boom');
            },
        };
        expect(() =>
            recordInvocationSamples(throwing, [{ scriptName: 'notify-worker', outcome: 'ok' }]),
        ).not.toThrow();
    });
});

describe('INVOCATION_SLO constants', () => {
    it('binding and dataset names stay lockstep with wrangler', () => {
        expect(INVOCATION_SLO_BINDING).toBe('AE_INVOCATION_SLO');
        expect(INVOCATION_SLO_DATASET).toBe('invocation_slo');
    });
});
