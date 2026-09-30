import { describe, expect, it, vi } from 'vitest';
import type { IntakeEnv } from 'framework_sdk_worker/intake';
import {
    analyzeExceptionEvent,
    recordExceptionHub,
    UNCAUGHT_REASON,
} from '../src/exception-hub.js';

describe('analyzeExceptionEvent', () => {
    it('skips tal1 self and empty script', () => {
        expect(analyzeExceptionEvent({ scriptName: 'tal1', outcome: 'exception' })).toEqual({
            log: null,
            intake: null,
        });
        expect(analyzeExceptionEvent({ scriptName: '', outcome: 'exception' })).toEqual({
            log: null,
            intake: null,
        });
    });

    it('logs + intake for uncaught exceptions with remapped stack', () => {
        const { log, intake } = analyzeExceptionEvent({
            scriptName: 'notify-worker',
            outcome: 'exception',
            event: { request: { method: 'GET', url: 'https://api.mailworld.uk/v1/send' } },
            exceptions: [
                {
                    name: 'TypeError',
                    message: 'x is not a function',
                    stack: 'TypeError: x is not a function\n    at parse (src/down.ts:30:8)',
                },
            ],
        });
        expect(log).toMatchObject({
            msg: 'tal1_exception',
            scriptName: 'notify-worker',
            outcome: 'exception',
            path: '/v1/send',
        });
        expect(log?.exceptions?.[0]?.stack).toContain('src/down.ts:30:8');
        expect(intake).not.toBeNull();
        expect(intake?.kind).toBe('ops.error');
        expect(intake?.source).toEqual({ producer: 'tal1', worker: 'notify-worker' });
        expect(intake?.title).toContain(UNCAUGHT_REASON);
        expect(JSON.stringify(intake?.payload)).toContain('src/down.ts:30:8');
    });

    it('logs errorInfo only without intake', () => {
        const { log, intake } = analyzeExceptionEvent({
            scriptName: 'email-rule-worker',
            outcome: 'ok',
            logs: [
                {
                    level: 'error',
                    message: ['caught', 'RangeError: out'],
                    errorInfo: [
                        null,
                        {
                            name: 'RangeError',
                            message: 'out',
                            stack: 'RangeError: out\n    at worker.js:1:10',
                        },
                    ],
                },
            ],
        });
        expect(log?.errorInfo?.[0]?.name).toBe('RangeError');
        expect(log?.exceptions).toBeUndefined();
        expect(intake).toBeNull();
    });

    it('intakes when outcome=exception even if exceptions array empty', () => {
        const { log, intake } = analyzeExceptionEvent({
            scriptName: 'sch1',
            outcome: 'exception',
            exceptions: [],
            logs: [],
        });
        // no exceptions and no errorInfo → nothing
        expect(log).toBeNull();
        expect(intake).toBeNull();

        const again = analyzeExceptionEvent({
            scriptName: 'sch1',
            outcome: 'exception',
            exceptions: [{ name: 'Error', message: 'boom' }],
        });
        expect(again.intake?.summary).toContain('boom');
    });
});

describe('recordExceptionHub', () => {
    it('console.error JSON and submitIntake for uncaught', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const waitUntil = vi.fn();
        const env = {
            SVC_SCH1: { fetch: vi.fn(async () => new Response('{}', { status: 200 })) },
            SCH_INTAKE_TOKEN: 'test-token',
        } as unknown as IntakeEnv;
        const result = recordExceptionHub(
            [
                {
                    scriptName: 'llm-gateway-worker',
                    outcome: 'exception',
                    exceptions: [{ name: 'Error', message: 'fail', stack: 'at src/x.ts:1:1' }],
                },
            ],
            env,
            { waitUntil },
        );
        expect(result).toEqual({ logged: 1, intakeSubmitted: 1 });
        expect(error).toHaveBeenCalledOnce();
        expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toMatchObject({
            msg: 'tal1_exception',
            scriptName: 'llm-gateway-worker',
        });
        expect(waitUntil).toHaveBeenCalled();
        error.mockRestore();
    });
});
