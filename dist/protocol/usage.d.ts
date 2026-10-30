import type { TokenUsage } from '@deepseek-ai/dsh-llm';
/** OpenAI prompt_tokens includes cached input; completion_tokens includes reasoning. */
export declare function mapUsage(raw: unknown): TokenUsage | undefined;
