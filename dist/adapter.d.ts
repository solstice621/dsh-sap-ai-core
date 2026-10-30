import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmFailure, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, PreparedAdapterCall, ResolvedRetryPolicy, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { Snapshot } from './config.js';
import { CredentialResolver } from './auth/credentials.js';
import type { CredentialAccess } from './auth/credentials.js';
import { TokenManager } from './auth/token-manager.js';
import { DeploymentResolver } from './routing/deployments.js';
import type { Inspection, InspectionLevel } from './diagnostics/types.js';
export interface AttemptDiagnostic {
    event: 'attempt';
    provider: string;
    model: string;
    configGeneration: number;
    attemptId: string;
    deployment?: string;
    tokenGeneration?: number;
    firstDeltaMs?: number;
    elapsedMs: number;
    outcome: 'success' | 'error' | 'aborted' | 'consumer-exit';
    code?: string;
    phase?: string;
    status?: number;
    upstreamRequestId?: string;
    usage?: TokenUsage;
}
export interface AuthReceipt {
    provider: string;
    sessionId?: string;
    tokenGeneration: number;
    configGeneration: number;
    at: number;
}
export interface AdapterOptions {
    snapshot: () => Snapshot;
    credentials: CredentialAccess;
    onDiagnostic?: (event: AttemptDiagnostic) => void;
}
export declare class SapAiCoreAdapter extends LlmAdapter {
    private readonly options;
    readonly credentials: CredentialResolver;
    readonly tokens: TokenManager;
    readonly deployments: DeploymentResolver;
    private readonly lifetime;
    private readonly active;
    private readonly receipts;
    constructor(options: AdapterOptions);
    private route;
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(provider: string): ResolvedRetryPolicy;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** Read-only health and connection checks. No inspection level performs inference. */
    inspect(provider: string, model: string, level: InspectionLevel, signal?: AbortSignal): Promise<Inspection>;
    private withRoute;
    takeAuthReceipt(failure: LlmFailure, provider: string, sessionId: string): AuthReceipt | undefined;
    private run;
    close(): Promise<void>;
}
