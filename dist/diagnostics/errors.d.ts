import { LlmError } from '@deepseek-ai/dsh-llm';
export type Phase = 'config' | 'credentials' | 'auth' | 'deployment' | 'inference' | 'stream';
export interface ErrorFacts {
    status?: number;
    requestId?: string;
    upstreamRequestId?: string;
    providerRetryAfterMs?: number;
}
/** Only locally authored reasons enter errors. Never retain an upstream body/cause. */
export declare class SapAiCoreError extends LlmError {
    readonly phase: Phase;
    readonly reason: string;
    readonly upstreamRequestId?: string;
    constructor(code: string, phase: Phase, reason: string, facts?: ErrorFacts);
}
export declare function aborted(phase?: Phase): SapAiCoreError;
export declare function checkAbort(signal?: AbortSignal, phase?: Phase): void;
export declare function safeError(error: unknown, phase: Phase, signal?: AbortSignal): SapAiCoreError;
export declare function retryAfter(value: string | null, now?: number): number | undefined;
export declare function httpError(status: number, phase: Phase, facts: ErrorFacts): SapAiCoreError;
