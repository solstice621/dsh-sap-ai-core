import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { harness } from '../support/dsh.js';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { MemoryCredentials } from '../support/dsh.js';
import * as sap from '../../src/index.js';
import { config, mockServer, json, textResponse, event, sse, collect, request } from '../support/mock.js';

test('S-T01/S-T15: real Cordis/DSH registers, selects, updates atomically, and unloads', async t => {
  const mock = await mockServer(); t.after(() => mock.close());
  const options = config(mock.origin); const app = await harness(options); t.after(() => app.close());
  assert.equal(app.ctx.llm.listProviders()[0]!.id, 'sap');
  assert.equal((await app.ctx.llm.listModels('sap'))[0]!.id, 'chat');
  assert.equal((await app.ctx.sapAiCore.adapter.resolveModel('sap', 'chat')).systemPromptUpdate, undefined);
  const chunks = await collect(app.ctx.llm.stream(request())); assert.equal(chunks.at(-1)!.type, 'finish');
  const invalid = structuredClone(options); invalid.providers.sap!.models.push(structuredClone(invalid.providers.sap!.models[0]!));
  assert.throws(() => app.ctx.sapAiCore.update(invalid), { code: 'INVALID_CONFIG' });
  assert.equal((await app.ctx.llm.listModels('sap')).length, 1);
  const changed = structuredClone(options); changed.providers.sap!.models[0]!.deployment = { id: 'changed-deployment' };
  app.ctx.sapAiCore.update(changed); await collect(app.ctx.llm.stream(request()));
  assert.match(mock.inferenceRequests.at(-1)!.url.pathname, /changed-deployment/);
  await app.plugin.dispose(); assert.deepEqual(app.ctx.llm.listProviders(), []); assert.deepEqual(app.ctx.llm.listConfigurableProviders(), []);
});

test('S-T17: plugin activation rejects unknown top-level configuration', async t => {
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime); await ctx.plugin(MemoryCredentials);
  const plugin = ctx.plugin(sap, { ...config('http://127.0.0.1:1'), unsupportedOption: true });
  await assert.rejects(plugin.await(), { code: 'INVALID_CONFIG' });
  assert.deepEqual(ctx.llm.listProviders(), []);
});

test('S-T07: DSH auth recovery is exactly once for both waterfall orders and survives repeated 401', async t => {
  for (const retryFirst of [false, true]) {
    let inference = 0;
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token-' + inference, token_type: 'bearer', expires_in: 60 });
      inference++; json(res, { error: 'token rejected' }, 401);
    }); t.after(() => mock.close());
    const app = await harness(config(mock.origin), true, retryFirst); t.after(() => app.close());
    const handle = await app.ctx.agents.create({ sessionId: SessionId(randomUUID()), agentOptions: { provider: 'sap', model: 'chat', maxTokens: 64 } }); t.after(() => handle.dispose());
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'synthetic auth recovery' }], source: { kind: 'user' } }));
    await handle.agent.whenIdle();
    assert.equal(inference, 2); assert.equal(mock.authRequests.length, 2);
    assert.equal(app.ctx.sessionProjections.stateOf(handle.agent.session, 'sapAiCoreAuthRecovery') !== undefined, true);
  }
});

test('S-T07/S-T16: 403 is terminal and transient 503 is retried only by DSH', async t => {
  for (const status of [403, 503]) {
    let attempts = 0;
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      if (++attempts === 1 || status === 403) return json(res, { error: 'provider refusal' }, status);
      textResponse(res);
    }); t.after(() => mock.close());
    const options = config(mock.origin); options.providers.sap!.retryPolicy = { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 20, jitterRatio: 0 };
    const app = await harness(options, true); t.after(() => app.close());
    const handle = await app.ctx.agents.create({ sessionId: SessionId(randomUUID()), agentOptions: { provider: 'sap', model: 'chat', maxTokens: 64 } }); t.after(() => handle.dispose());
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'synthetic retry' }], source: { kind: 'user' } }));
    await handle.agent.whenIdle();
    assert.equal(attempts, status === 403 ? 1 : 2); assert.equal(mock.authRequests.length, 1);
  }
});

test('S-T12/S-T20: DSH executes a controlled tool once, sends its result, and finishes the next model step', async t => {
  let attempts = 0, executions = 0;
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    attempts++;
    if (attempts === 1) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(sse([event({ tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'multiply', arguments: '{"a":12,"b":13}' } }] }), event({}, 'tool_calls')])); return;
    }
    textResponse(res, '156');
  }); t.after(() => mock.close());
  const app = await harness(config(mock.origin), true); t.after(() => app.close());
  const handle = await app.ctx.agents.create({
    sessionId: SessionId(randomUUID()), agentOptions: { provider: 'sap', model: 'chat', maxTokens: 64 },
    setup(ctx) {
      ctx.tools.register({ name: 'multiply', description: 'multiply two integers', parameters: { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'integer' } }, required: ['a', 'b'] }, output: { schema: { type: 'integer' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
        async execute(args) { executions++; const { a, b } = args as { a: number; b: number }; return a * b; },
      });
    },
  }); t.after(() => handle.dispose());
  handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '12 × 13' }], source: { kind: 'user' } }));
  await handle.agent.whenIdle();
  assert.equal(attempts, 2); assert.equal(executions, 1);
  const body = JSON.parse(mock.inferenceRequests[1]!.body);
  const result = body.messages.find((m: { role: string }) => m.role === 'tool');
  assert.equal(result.tool_call_id, 'call-1'); assert.equal(result.content, '156');
});

test('S-T16: DSH honors Retry-After, bounds retries, and cancels its scheduled backoff', async t => {
  for (const cancel of [false, true]) {
    let attempts = 0;
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      attempts++; res.setHeader('retry-after', cancel ? '1' : '0.01'); json(res, { error: 'temporary rate limit' }, 429);
    }); t.after(() => mock.close());
    const options = config(mock.origin); options.providers.sap!.retryPolicy = { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 2000, jitterRatio: 0 };
    const app = await harness(options, true); t.after(() => app.close());
    const delays: number[] = [];
    const handle = await app.ctx.agents.create({
      sessionId: SessionId(randomUUID()), agentOptions: { provider: 'sap', model: 'chat', maxTokens: 64 },
      setup(ctx) {
        ctx.on('session/event', (_session, event) => {
          if (event.type !== 'llm/retry') return;
          delays.push(event.data.delayMs);
          if (cancel) handle.agent.cancel({ kind: 'user' });
        });
      },
    }); t.after(() => handle.dispose());
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'synthetic backoff' }], source: { kind: 'user' } }));
    await handle.agent.whenIdle();
    assert.equal(attempts, cancel ? 1 : 3); assert.deepEqual(delays, cancel ? [1000] : [10, 10]);
    assert.equal(mock.authRequests.length, 1);
  }
});
