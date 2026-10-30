import type { ReplayEnvelope, RequestMessage } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
export declare function replayState(route: ModelRoute, reasoning: string): ReplayEnvelope | undefined;
export declare function restoreReasoning(message: RequestMessage, route: ModelRoute): string | undefined;
