import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
export declare function unsupported(option: string): never;
export declare function modelInfo(route: ModelRoute): LlmResolvedModelInfo;
