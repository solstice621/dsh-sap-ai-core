import type { Context } from '@deepseek-ai/cordis';
import type { SapAiCoreAdapter } from '../adapter.js';
interface RecoveryRecord {
    provider: string;
    turn: number;
    step: number;
    tokenGeneration: number;
    configGeneration: number;
    used: true;
}
declare module '@deepseek-ai/dsh-session' {
    interface PluginRecordMap {
        'plugin:dsh-sap-ai-core/auth-recovery': RecoveryRecord;
    }
}
declare module '@deepseek-ai/dsh-session-projection' {
    interface SessionProjectionStateMap {
        sapAiCoreAuthRecovery: Record<string, boolean>;
    }
}
/** Optional Agent integration; standalone llm.stream still makes exactly one attempt. */
export declare function registerAuthRecovery(ctx: Context, adapter: SapAiCoreAdapter): void;
export {};
