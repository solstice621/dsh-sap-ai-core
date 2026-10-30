import type { Context } from '@deepseek-ai/cordis';
import { SapAiCoreAdapter } from './adapter.js';
import { snapshotOf } from './config.js';
import type { Snapshot } from './config.js';
import { Config } from './schema.js';
import type { PluginConfig } from './schema.js';
import type { DiagnosticInput, DiagnosticResult } from './diagnostics/types.js';
import type { AttemptDiagnostic } from './adapter.js';
export { Config, SapAiCoreAdapter, snapshotOf };
export { ConfigSchema, routeOf } from './config.js';
export { SapAiCoreError } from './diagnostics/errors.js';
export type { Options, Snapshot, ModelRoute, LogicalModel, Instance, ProviderRoute } from './config.js';
export type { AdapterOptions, AttemptDiagnostic } from './adapter.js';
export type { CredentialAccess } from './auth/credentials.js';
export type { DiagnosticInput, DiagnosticResult, DiagnosticLevel, Inspection } from './diagnostics/types.js';
export declare const name = "sap-ai-core";
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        sapAiCore: SapAiCoreRuntime;
    }
    interface Events {
        'sap-ai-core/attempt'(event: AttemptDiagnostic): void;
    }
}
export declare class SapAiCoreRuntime {
    private readonly ctx;
    private readonly namespace;
    readonly adapter: SapAiCoreAdapter;
    private current;
    private registration?;
    private directory?;
    private toolsContext?;
    private closed;
    constructor(ctx: Context, input: unknown, namespace?: string);
    get snapshot(): Snapshot;
    diagnose(input: DiagnosticInput): Promise<DiagnosticResult>;
    useToolsContext(ctx: Context): () => void;
    validate(input: unknown): Snapshot;
    update(input: unknown): void;
    private entries;
    private commit;
    close(): Promise<void>;
}
export declare function apply(ctx: Context, config: PluginConfig): void;
