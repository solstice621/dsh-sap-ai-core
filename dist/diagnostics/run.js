import { routeOf } from '../config.js';
import { SapAiCoreError, checkAbort } from './errors.js';
import { RequestScope } from '../transport/cancellation.js';
function bound(value, fallback, max) {
    const actual = value ?? fallback;
    if (!Number.isSafeInteger(actual) || actual < 1 || actual > max)
        throw new SapAiCoreError('INVALID_REQUEST', 'config', 'diagnostic budget is outside its supported range');
    return actual;
}
export async function diagnose(ctx, adapter, snapshot, input) {
    if (!['config', 'auth', 'deployment', 'chat', 'stream', 'tools'].includes(input.level))
        throw new SapAiCoreError('INVALID_REQUEST', 'config', 'unknown diagnostic level');
    if (input.level === 'config' || input.level === 'auth' || input.level === 'deployment')
        return adapter.inspect(input.provider, input.model, input.level, input.signal);
    if (input.allowInference !== true)
        throw new SapAiCoreError('INFERENCE_OPT_IN_REQUIRED', 'config', 'paid diagnostics require explicit allowInference');
    const route = routeOf(snapshot, input.provider, input.model);
    if (input.level === 'stream' && route.model.mode !== 'streaming')
        throw new SapAiCoreError('UNSUPPORTED_OPTION', 'config', 'buffered mode cannot pass streaming diagnostics');
    const maxRequests = bound(input.maxRequests, input.level === 'tools' ? 3 : 1, 4);
    const maxTokens = bound(input.maxOutputTokens, 128, 256);
    const timeoutMs = bound(input.timeoutMs, 90_000, 120_000);
    if (input.level === 'tools' && maxRequests < 2)
        throw new SapAiCoreError('INVALID_REQUEST', 'config', 'tool diagnostics need a budget of at least two requests');
    const scope = new RequestScope([input.signal], timeoutMs);
    const started = performance.now();
    const report = { ok: true, level: input.level, provider: input.provider, model: input.model, requests: 0, requestedMaxOutputTokens: maxTokens, textDeltas: 0, textCharacters: 0, elapsedMs: 0, realStreaming: false, usage: [] };
    const observe = (chunk) => {
        if (chunk.type === 'text-delta') {
            report.firstDeltaMs ??= Math.round(performance.now() - started);
            report.textDeltas++;
            report.textCharacters += chunk.text.length;
        }
        if (chunk.type === 'usage')
            report.usage.push(chunk.usage);
        if (chunk.type === 'finish' && chunk.reason.kind === 'error')
            throw new SapAiCoreError(chunk.reason.failure.code, 'inference', 'diagnostic inference failed', chunk.reason.failure);
    };
    try {
        if (input.level === 'tools') {
            const { diagnoseTools } = await import('./tools.js');
            await diagnoseTools(ctx, input, maxTokens, maxRequests, scope.signal, report, observe);
        }
        else {
            report.requests = 1;
            const call = await adapter.prepareCall(input.provider, input.model, scope.signal);
            for await (const chunk of call.stream({ provider: input.provider, model: input.model, maxTokens, signal: scope.signal, messages: [{ role: 'user', content: [{ type: 'text', text: '请用三句简短中文解释为什么天空是蓝色的。' }] }] }))
                observe(chunk);
        }
        checkAbort(scope.signal);
        if (!report.textCharacters)
            throw new SapAiCoreError('DIAGNOSTIC_FAILED', 'inference', 'diagnostic produced no final text');
        report.realStreaming = route.model.mode === 'streaming' && report.textDeltas > 1;
        if (input.level === 'stream' && !report.realStreaming)
            throw new SapAiCoreError('DIAGNOSTIC_FAILED', 'stream', 'multiple upstream text increments were not observed');
        report.elapsedMs = Math.round(performance.now() - started);
        return report;
    }
    finally {
        scope.controller.abort();
        scope.dispose();
    }
}
//# sourceMappingURL=run.js.map