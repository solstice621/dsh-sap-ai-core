import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { LlmFailure } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { SapAiCoreError } from '../../src/diagnostics/errors.js';

/** An unpredictable value proves a real DSH tool result reached the next model step. */
export async function verifyToolRoundtrip(ctx: Context, provider: string, model: string, maxTokens = 128, reasoningEffort?: string) {
  const code = 'DSH-' + randomUUID().slice(0, 8);
  const effort = reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) };
  let requests = 0, executions = 0, toolResults = 0, matched = false, reasoningDeltas = 0;
  let failure: LlmFailure | undefined;
  const started = performance.now();
  const handle = await ctx.agents.create({
    sessionId: SessionId(randomUUID()), agentOptions: { provider, model, maxTokens, ...effort },
    setup(child) {
      child.tools.restrict({ allow: [] });
      child.tools.register({
        name: 'sap_read_verification_code', description: 'Read the current verification code. The code is available only through this tool.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
        async execute() { executions++; return code; },
      });
      child.on('agent/request', async (_payload, next) => ({ ...await next(), provider, model, maxTokens, ...effort }));
      child.on('agent/assistant-stream', ({ agent, frame }) => {
        if (frame.type === 'start' && ++requests > 3) agent.cancel({ kind: 'hook', reason: 'live request budget exhausted' });
        if (frame.type === 'chunk' && frame.chunk.type === 'reasoning-delta') reasoningDeltas++;
      });
      child.on('session/event', (_session, event) => {
        if (event.type === 'tool/result' && !event.data.message.isError) toolResults++;
        if (event.type === 'assistant/message' && !event.data.interrupted && toolResults && event.data.message.content.some(block => block.type === 'text' && block.text.includes(code))) matched = true;
        if (event.type === 'turn/end' && event.data.reason.kind === 'error') failure = event.data.reason.error;
      });
    },
  });
  const timer = setTimeout(() => handle.agent.cancel({ kind: 'hook', reason: 'live tool check timed out' }), 90_000);
  try {
    handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请调用 sap_read_verification_code 读取当前校验码，收到工具结果后原样回复该校验码。校验码只能从工具获得。' }] }));
    await handle.agent.whenIdle();
    if (failure) throw new SapAiCoreError(failure.code, 'inference', 'live model tools turn failed', failure);
    assert.equal(executions, 1); assert.equal(toolResults, 1); assert.equal(matched, true);
    assert.ok(requests >= 2 && requests <= 3);
    return { ok: true, level: 'tools', provider, model, requests, requestedMaxOutputTokens: maxTokens, toolExecutions: executions, toolResults, reasoningDeltas, unpredictableResultReturned: true, elapsedMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); await handle.dispose(); }
}
