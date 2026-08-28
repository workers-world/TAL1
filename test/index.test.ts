import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/env.js';

describe('TAL1 handlers', () => {
    it('fetch returns health json', async () => {
        const res = await worker.fetch();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, worker: 'TAL1' });
    });

    it('tail writes samples then returns', async () => {
        const write = vi.fn();
        const env = { AE_INVOCATION_SLO: { writeDataPoint: write } } as Env;
        await worker.tail(
            [{ scriptName: 'llm-gateway-worker', outcome: 'ok', event: null }],
            env,
        );
        expect(write).toHaveBeenCalledOnce();
    });
});
