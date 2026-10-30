import type { TokenUsage } from '@deepseek-ai/dsh-llm';
export type InspectionLevel = 'config' | 'auth' | 'deployment';
export type DiagnosticLevel = InspectionLevel | 'chat' | 'stream' | 'tools';
export interface Inspection {
    ok: true;
    level: InspectionLevel;
    provider: string;
    model: string;
    configGeneration: number;
    mode: 'streaming' | 'buffered';
    credentials: {
        ref: string;
        configured: boolean;
        source?: string;
    }[];
    network: {
        proxyMode: string;
        tlsVerification: true;
    };
    token?: {
        generation: number;
        expiresAt: number;
        refreshAt: number;
        remainingSeconds: number;
    };
    deployment?: {
        identity: string;
        status: 'RUNNING';
        selection: 'explicit' | 'discovery';
    };
}
export interface DiagnosticInput {
    level: DiagnosticLevel;
    provider: string;
    model: string;
    /** Required for all paid levels; config/auth/deployment never infer. */
    allowInference?: boolean;
    maxRequests?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
}
export interface InferenceDiagnostic {
    ok: true;
    level: 'chat' | 'stream' | 'tools';
    provider: string;
    model: string;
    requests: number;
    requestedMaxOutputTokens: number;
    textDeltas: number;
    textCharacters: number;
    firstDeltaMs?: number;
    elapsedMs: number;
    realStreaming: boolean;
    toolExecutions?: number;
    toolResults?: number;
    usage: TokenUsage[];
}
export type DiagnosticResult = Inspection | InferenceDiagnostic;
