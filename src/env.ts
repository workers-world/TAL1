/**
 * Env: Analytics Engine binding only (no secrets).
 */
export interface InvocationSloDataset {
    writeDataPoint(event?: {
        indexes?: Array<ArrayBuffer | string | null>;
        blobs?: Array<ArrayBuffer | string | null>;
        doubles?: number[];
    }): void;
}

export interface Env {
    AE_INVOCATION_SLO?: InvocationSloDataset;
}
