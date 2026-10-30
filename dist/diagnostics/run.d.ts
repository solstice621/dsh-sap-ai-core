import type { Context } from '@deepseek-ai/cordis';
import type { SapAiCoreAdapter } from '../adapter.js';
import type { Snapshot } from '../config.js';
import type { DiagnosticInput, DiagnosticResult } from './types.js';
export declare function diagnose(ctx: Context, adapter: SapAiCoreAdapter, snapshot: Snapshot, input: DiagnosticInput): Promise<DiagnosticResult>;
