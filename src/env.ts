/**
 * Env: AE invocation_slo + sch1 Intake（未捕获异常）；无 D1/KV。
 */
import type { SecretLike } from 'framework_sdk_worker/secrets';

export interface InvocationSloDataset {
    writeDataPoint(event?: {
        indexes?: Array<ArrayBuffer | string | null>;
        blobs?: Array<ArrayBuffer | string | null>;
        doubles?: number[];
    }): void;
}

export interface Env {
    AE_INVOCATION_SLO?: InvocationSloDataset;
    SVC_SCH1?: Fetcher;
    SCH_INTAKE_TOKEN?: SecretLike;
}
