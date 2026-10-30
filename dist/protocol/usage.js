import { SapAiCoreError } from '../diagnostics/errors.js';
function count(value) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new SapAiCoreError('PROTOCOL', 'stream', 'invalid token usage');
    return value;
}
/** OpenAI prompt_tokens includes cached input; completion_tokens includes reasoning. */
export function mapUsage(raw) {
    if (raw === undefined || raw === null)
        return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw))
        throw new SapAiCoreError('PROTOCOL', 'stream', 'invalid usage object');
    const usage = raw;
    const input = count(usage.prompt_tokens), output = count(usage.completion_tokens);
    const total = count(usage.total_tokens);
    const cached = count(usage.prompt_tokens_details?.cached_tokens);
    const reasoning = count(usage.completion_tokens_details?.reasoning_tokens);
    if (input === undefined || output === undefined)
        return undefined;
    if ((cached !== undefined && cached > input) || (reasoning !== undefined && reasoning > output))
        throw new SapAiCoreError('PROTOCOL', 'stream', 'usage details exceed their totals');
    return {
        inputTokens: input - (cached ?? 0), outputTokens: output, totalTokens: total ?? input + output,
        ...(cached === undefined ? {} : { cacheReadTokens: cached }),
        ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }),
    };
}
//# sourceMappingURL=usage.js.map