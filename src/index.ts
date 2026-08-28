/**
 * Central tail portal: map producer invocations to Analytics Engine `invocation_slo`.
 * Producers attach via wrangler `tail_consumers`; no business logic here.
 */
import type { Env } from './env.js';
import { recordInvocationSamples, type TraceLike } from './trace-to-point.js';

export type { Env };

export default {
    async fetch(): Promise<Response> {
        return Response.json({ ok: true, worker: 'TAL1' });
    },

    async tail(events: TraceLike[], env: Env): Promise<void> {
        recordInvocationSamples(env.AE_INVOCATION_SLO, events);
    },
};
