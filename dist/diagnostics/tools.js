import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SapAiCoreError, checkAbort } from './errors.js';
/** The real DSH Agent owns execution and result replay, including in diagnostics. */
export async function diagnoseTools(ctx, input, maxTokens, maxRequests, signal, report, observe) {
    if (!ctx.agents || !ctx.tools)
        throw new SapAiCoreError('DIAGNOSTIC_UNAVAILABLE', 'config', 'tools diagnostics require DSH Agent and tools services');
    let executions = 0, results = 0, finalAnswer = false;
    let failure;
    const handle = await ctx.agents.create({
        sessionId: SessionId(randomUUID()), agentOptions: { provider: input.provider, model: input.model, maxTokens },
        setup(child) {
            child.tools.restrict({ allow: [] });
            child.tools.register({
                name: 'sap_diagnostic_multiply', description: 'Multiply two integers. Use this tool to verify arithmetic.',
                parameters: { type: 'object', properties: { a: { type: 'integer', minimum: 0, maximum: 100 }, b: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['a', 'b'], additionalProperties: false },
                output: { schema: { type: 'integer' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
                async execute(args) {
                    const value = args;
                    if (++executions > 2 || value.a !== 12 || value.b !== 13)
                        throw new SapAiCoreError('DIAGNOSTIC_FAILED', 'inference', 'unexpected diagnostic tool invocation');
                    return value.a * value.b;
                },
            });
            child.on('agent/request', async (_payload, next) => ({ ...await next(), provider: input.provider, model: input.model, maxTokens }));
            child.on('agent/assistant-stream', ({ agent, frame }) => {
                if (frame.type === 'start') {
                    if (report.requests >= maxRequests) {
                        failure = new SapAiCoreError('DIAGNOSTIC_BUDGET', 'inference', 'diagnostic request budget exhausted');
                        agent.cancel({ kind: 'hook', reason: 'diagnostic request budget exhausted' });
                    }
                    else
                        report.requests++;
                }
                if (frame.type === 'chunk') {
                    try {
                        observe(frame.chunk);
                    }
                    catch (error) {
                        failure = error;
                        agent.cancel({ kind: 'hook', reason: 'diagnostic inference failed' });
                    }
                }
            });
            child.on('session/event', (_session, event) => {
                if (event.type === 'tool/result' && !event.data.message.isError)
                    results++;
                if (event.type === 'assistant/message' && !event.data.interrupted && results && event.data.message.content.some(block => block.type === 'text' && /156/.test(block.text)))
                    finalAnswer = true;
                if (event.type === 'turn/end' && event.data.reason.kind === 'error')
                    failure = new SapAiCoreError(event.data.reason.error.code, 'inference', 'DSH diagnostic turn failed', event.data.reason.error);
            });
        },
    });
    const cancel = () => handle.agent.cancel({ kind: 'user' });
    signal.addEventListener('abort', cancel, { once: true });
    try {
        checkAbort(signal);
        handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '必须调用 sap_diagnostic_multiply 工具计算 12 × 13。收到工具结果后，仅回答计算结果。' }] }));
        await handle.agent.whenIdle();
        checkAbort(signal);
        if (failure)
            throw failure;
        if (executions !== 1 || results !== 1 || !finalAnswer)
            throw new SapAiCoreError('DIAGNOSTIC_FAILED', 'inference', 'complete tool call, result, and subsequent answer were not observed');
        report.toolExecutions = executions;
        report.toolResults = results;
    }
    finally {
        signal.removeEventListener('abort', cancel);
        await handle.dispose();
    }
}
//# sourceMappingURL=tools.js.map