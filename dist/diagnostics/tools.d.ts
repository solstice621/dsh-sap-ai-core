import type { Context } from '@deepseek-ai/cordis';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { DiagnosticInput, InferenceDiagnostic } from './types.js';
/** The real DSH Agent owns execution and result replay, including in diagnostics. */
export declare function diagnoseTools(ctx: Context, input: DiagnosticInput, maxTokens: number, maxRequests: number, signal: AbortSignal, report: InferenceDiagnostic, observe: (chunk: StreamChunk) => void): Promise<void>;
