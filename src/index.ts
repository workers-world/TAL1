/**
 * Central tail portal:
 * 1) AE invocation_slo（无 stack）
 * 2) 未捕获/已记录异常 → tal1 Workers Logs；未捕获另进 sch1 Intake
 */
import type { Env } from './env.js';
import { recordExceptionHub, type TraceExceptionEvent } from './exception-hub.js';
import { recordInvocationSamples } from './trace-to-point.js';

export type { Env };

export default {
    async fetch(): Promise<Response> {
        return Response.json({ ok: true, worker: 'tal1' });
    },

    async tail(events: TraceExceptionEvent[], env: Env, ctx: ExecutionContext): Promise<void> {
        recordInvocationSamples(env.AE_INVOCATION_SLO, events);
        recordExceptionHub(events, env, ctx);
    },
};
