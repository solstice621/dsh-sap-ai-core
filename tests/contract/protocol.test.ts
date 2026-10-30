import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantMessage, createSystemMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { Stream } from 'openai/core/streaming';
import { SapAiCoreAdapter } from '../../src/adapter.js';
import { snapshotOf, routeOf, freeze } from '../../src/config.js';
import { buildRequest } from '../../src/protocol/request.js';
import { mapUsage } from '../../src/protocol/usage.js';
import { ChatStreamTranslator } from '../../src/protocol/stream.js';
import { replayState } from '../../src/protocol/replay.js';
import { config, credentialAccess, event, sse, mockServer, json, request, collect, until } from '../support/mock.js';

test('S-T11/S-T13: split UTF-8, coalesced SSE, comments, trailing usage, and finish order', async t => {
  const mock = await mockServer(async (req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8' });
    const wire = Buffer.from(': keepalive\r\n\r\n' + sse([event({ reasoning_content: '思考' }), event({ content: '你好🌱' }), event({ content: '世界' }), event({}, 'stop'), { choices: [], usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 } }]));
    for (let i = 0; i < wire.length; i += 3) { res.write(wire.subarray(i, i + 3)); await new Promise(r => setImmediate(r)); }
    res.end();
  }); t.after(() => mock.close());
  const snapshot = snapshotOf(config(mock.origin));
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  const chunks = await collect(adapter.stream(request()));
  assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''), '你好🌱世界');
  assert.deepEqual(chunks.filter(c => c.type === 'block-start').map(c => [c.index, c.blockType]), [[0, 'reasoning'], [1, 'text']]);
  assert.equal(chunks.at(-1)!.type, 'finish'); assert.equal(chunks.at(-2)!.type, 'usage');
  assert.equal(chunks.filter(c => c.type === 'usage').length, 1);
});

test('S-T12: interleaved tool indices, late IDs, split names, and lossless large JSON', () => {
  const route = routeOf(snapshotOf(config('http://127.0.0.1:1')), 'sap', 'chat');
  const translate = new ChatStreamTranslator(route); const chunks: StreamChunk[] = [];
  const argument = JSON.stringify({ text: '中文🙂'.repeat(20_000) }, null, 2);
  chunks.push(...translate.accept(event({ tool_calls: [{ index: 7, function: { arguments: argument.slice(0, 100), name: 'multi' } }] })));
  chunks.push(...translate.accept(event({ tool_calls: [{ index: 2, id: 'second', function: { name: 'other', arguments: '{ "v": ' } }] })));
  chunks.push(...translate.accept(event({ tool_calls: [{ index: 7, id: 'first', function: { name: 'ply', arguments: argument.slice(100) } }, { index: 2, function: { arguments: '2 }' } }] })));
  chunks.push(...translate.accept(event({}, 'tool_calls')), ...translate.finish());
  const tools = chunks.filter(c => c.type === 'block-end');
  assert.equal(tools[0]!.index, 0); assert.equal(tools[1]!.index, 1);
  assert.equal(tools[0]!.block.type === 'tool-call' && tools[0]!.block.arguments, argument);
  const deltas = chunks.filter(c => c.type === 'tool-call-delta').filter(c => c.id === 'first');
  assert.equal(deltas.map(c => c.argumentsDelta).join(''), argument);
  assert.equal(deltas.at(-1)!.name, 'multiply');
});

test('S-T13/S-T19: cached and reasoning tokens do not inflate totals; no invented usage', () => {
  assert.deepEqual(mapUsage({ prompt_tokens: 12, completion_tokens: 8, total_tokens: 20, prompt_tokens_details: { cached_tokens: 5 }, completion_tokens_details: { reasoning_tokens: 3 } }), { inputTokens: 7, outputTokens: 8, totalTokens: 20, cacheReadTokens: 5, reasoningTokens: 3 });
  assert.equal(mapUsage(undefined), undefined); assert.equal(mapUsage({ prompt_tokens: 3 }), undefined);
  assert.deepEqual(mapUsage({ prompt_tokens: 2, completion_tokens: 4 }), { inputTokens: 2, outputTokens: 4, totalTokens: 6 });
  assert.throws(() => mapUsage({ prompt_tokens: 2, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 3 } }), { code: 'PROTOCOL' });
  const translator = new ChatStreamTranslator(routeOf(snapshotOf(config('http://127.0.0.1:1')), 'sap', 'chat'));
  translator.accept(event({ content: 'x' }, 'stop'));
  translator.accept({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 3 } });
  translator.accept({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 4 } });
  assert.deepEqual(translator.finish().filter(c => c.type === 'usage').map(c => c.usage), [{ inputTokens: 2, outputTokens: 4, totalTokens: 6 }]);
});

test('S-T14/S0: missing [DONE] is a failure even after finish_reason (SDK comparison)', async t => {
  const wire = sse([event({ content: 'partial' }, 'stop')], false);
  let sdkEvents = 0;
  for await (const _ of Stream.fromSSEResponse(new Response(wire), new AbortController())) sdkEvents++;
  assert.equal(sdkEvents, 1);
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(wire);
  }); t.after(() => mock.close());
  const snapshot = snapshotOf(config(mock.origin));
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  const chunks: StreamChunk[] = [];
  await assert.rejects(async () => { for await (const c of adapter.stream(request())) chunks.push(c); }, { code: 'PROTOCOL' });
  assert.equal(chunks.some(c => c.type === 'finish'), false);
});

test('S-T14: in-band and malformed SSE errors are explicit and redact upstream content', async t => {
  for (const wire of [sse([event({ content: 'partial' }), { error: { message: 'synthetic-secret' } }]), 'event: error\ndata: {"message":"synthetic-secret"}\n\n', 'data: {bad-secret-json}\n\n', 'garbage: secret\n\n']) {
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(wire);
    }); t.after(() => mock.close());
    const snapshot = snapshotOf(config(mock.origin));
    const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
    await assert.rejects(async () => collect(adapter.stream(request())), error => { assert.doesNotMatch(String(error), /secret/); return ['PROTOCOL', 'PROVIDER_ERROR'].includes((error as { code: string }).code); });
  }
});

test('S-T14/S-T15: idle timeout and early iterator return close HTTP consumption', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(sse([event({ content: 'first' })], false));
  }); t.after(() => mock.close());
  const cfg = config(mock.origin); cfg.instances.demo!.network = { proxyMode: 'direct', streamIdleTimeoutMs: 40 };
  const snapshot = snapshotOf(cfg);
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  await assert.rejects(async () => collect(adapter.stream(request())), { code: 'TIMEOUT' });
  const iterator = adapter.stream(request())[Symbol.asyncIterator](); await iterator.next(); await iterator.return?.();
  await until(() => mock.closedResponses >= 3);
  const stalled = adapter.stream(request())[Symbol.asyncIterator](); await stalled.next();
  await adapter.close();
  await assert.rejects(async () => { while (!(await stalled.next()).done) {} }, { code: 'ABORTED' });
});

test('S-T17/S-T20: frozen history keeps system order, exact tool JSON and results; unsupported input is rejected', () => {
  const route = routeOf(snapshotOf(config('http://127.0.0.1:1')), 'sap', 'chat');
  const toolId = ToolCallId('original-id');
  const options = freeze({ ...request(), system: 'prefix', messages: [
    createSystemMessage('first'), createSystemMessage('second'),
    createAssistantMessage({ source: { provider: 'sap', model: 'chat' }, content: [{ type: 'tool-call', id: toolId, name: 'multiply', arguments: '{ "b": 13, "a":12 }' }] }),
    createToolResultMessage({ callId: toolId, content: [{ type: 'text', text: '156' }], isError: false }),
  ] });
  const body = buildRequest(options, route);
  assert.deepEqual(body.messages.slice(0, 3).map(m => m.content), ['prefix', 'first', 'second']);
  assert.equal(body.messages[3]!.tool_calls![0]!.function.arguments, '{ "b": 13, "a":12 }');
  assert.equal(body.messages[4]!.tool_call_id, 'original-id'); assert.equal(body.messages[4]!.content, '156');
  assert.throws(() => buildRequest({ ...request(), reasoningEffort: 'high' as never }, route), { code: 'UNSUPPORTED_OPTION' });
  assert.throws(() => buildRequest({ ...request(), response_format: { type: 'json_object' } } as never, route), { code: 'UNSUPPORTED_OPTION' });
  assert.throws(() => buildRequest({ ...request(), messages: [{ role: 'user', content: [{ type: 'image' } as never] }] }, route), { code: 'UNSUPPORTED_OPTION' });
});

test('S-T13/S-T14: authoritative usage from a failed attempt is emitted once before its error', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sse([event({ content: 'partial' }), { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } }, { error: { message: 'synthetic-secret' } }]));
  }); t.after(() => mock.close());
  const snapshot = snapshotOf(config(mock.origin));
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  const chunks: StreamChunk[] = [];
  await assert.rejects(async () => { for await (const chunk of adapter.stream(request())) chunks.push(chunk); }, { code: 'PROVIDER_ERROR' });
  assert.equal(chunks.filter(chunk => chunk.type === 'usage').length, 1);
  assert.equal(chunks.at(-1)!.type, 'usage'); assert.equal(chunks.some(chunk => chunk.type === 'finish'), false);
});

test('S-T20: native reasoning replay follows exact provider/model/route identity only', () => {
  const cfg = config('http://127.0.0.1:1'); cfg.providers.sap!.models[0]!.compatibility!.replayReasoning = true;
  const route = routeOf(snapshotOf(cfg), 'sap', 'chat');
  const state = replayState(route, 'synthetic-reasoning');
  const previous = createAssistantMessage({ source: { provider: 'sap', model: 'chat', replayState: state }, content: [{ type: 'reasoning', text: 'synthetic-reasoning' }, { type: 'text', text: 'hello' }] });
  const req = { ...request(), messages: [previous, ...request().messages] };
  assert.equal(buildRequest(req, route).messages[0]!.reasoning_content, 'synthetic-reasoning');
  const other = structuredClone(previous); other.source.model = 'other';
  assert.equal(buildRequest({ ...req, messages: [other] }, route).messages[0]!.reasoning_content, undefined);
  cfg.providers.sap!.models[0]!.deployment = { id: 'another-deployment' };
  assert.equal(buildRequest(req, routeOf(snapshotOf(cfg, 2), 'sap', 'chat')).messages[0]!.reasoning_content, undefined);
  cfg.providers.sap!.models[0]!.compatibility!.replayReasoning = false;
  assert.equal(buildRequest(req, routeOf(snapshotOf(cfg, 3), 'sap', 'chat')).messages[0]!.reasoning_content, undefined);
});

test('S-T17: undeclared stop and buffered JSON on a streaming route fail explicitly', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    json(res, { choices: [{ message: { role: 'assistant', content: 'buffered' }, finish_reason: 'stop' }] });
  }); t.after(() => mock.close());
  const cfg = config(mock.origin); cfg.providers.sap!.models[0]!.capabilities.stop = false;
  const snapshot = snapshotOf(cfg);
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  assert.throws(() => adapter.stream({ ...request(), stop: ['END'] }), { code: 'UNSUPPORTED_OPTION' });
  assert.equal(mock.requests.length, 0);
  await assert.rejects(collect(adapter.stream(request())), { code: 'PROTOCOL' });
  cfg.providers.sap!.models[0]!.mode = 'buffered';
  const buffered = new SapAiCoreAdapter({ snapshot: () => snapshotOf(cfg), credentials: credentialAccess().access }); t.after(() => buffered.close());
  const chunks = await collect(buffered.stream(request())); assert.equal(chunks.at(-1)!.type, 'finish');
  assert.equal(JSON.parse(mock.inferenceRequests.at(-1)!.body).stream, false);
});
