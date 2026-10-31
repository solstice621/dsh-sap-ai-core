import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantMessage, createToolResultMessage, ReasoningEffortId, ToolCallId } from '@deepseek-ai/dsh-llm';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { SapAiCoreAdapter } from '../../src/adapter.js';
import { snapshotOf, routeOf, freeze } from '../../src/config.js';
import { buildRequest } from '../../src/protocol/request.js';
import { encodeRequest, responseProjection } from '../../src/protocol/orchestration.js';
import { bufferedReply } from '../../src/protocol/stream.js';
import { replayState, restoreReasoning } from '../../src/protocol/replay.js';
import { config, credentialAccess, event, sse, mockServer, json, request, collect, until } from '../support/mock.js';

function orchestrationConfig(origin: string) {
  const input = config(origin);
  input.providers.sap!.protocol = 'sap-orchestration-v2';
  return input;
}
const wrap = (final: unknown, extra = {}) => ({ request_id: 'orchestration-request', final_result: final, ...extra });
const prelude = () => wrap({ id: '', model: '', choices: [{ index: 0, delta: { content: '' } }] }, { intermediate_results: { templating: {} } });

test('Orchestration: selectable thinking keeps reasoning separate, sends its budget, and counts usage once', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sse([
      wrap(event({ reasoning_content: [{ content: '先想' }, { content: '清楚' }] })),
      wrap(event({ content: '答案' })),
      wrap({ ...event({ reasoning_content: [] }, 'stop'), usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, completion_tokens_details: { reasoning_tokens: 2 } } }),
    ]));
  }); t.after(() => mock.close());
  const input = orchestrationConfig(mock.origin), model = input.providers.sap!.models[0]!;
  model.capabilities.reasoningContent = true; model.maxOutputTokens = 256;
  model.compatibility = { ...model.compatibility, maxTokensField: 'max_completion_tokens', defaultReasoningEffort: 'off', reasoningEfforts: {
    off: { name: '关闭', parameters: { enable_thinking: false } },
    low: { name: '低', parameters: { enable_thinking: true, thinking_budget: 64 } },
  } };
  const snapshot = snapshotOf(input), route = routeOf(snapshot, 'sap', 'chat');
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  const info = await adapter.resolveModel('sap', 'chat');
  assert.deepEqual(info.reasoning?.efforts.map(effort => effort.id), ['off', 'low']);
  assert.equal(info.reasoning?.defaultEffort, 'off');
  const chunks = await collect(adapter.stream({ ...request(), reasoningEffort: ReasoningEffortId('low'), maxTokens: 256 }));
  assert.equal(chunks.filter(c => c.type === 'reasoning-delta').map(c => c.text).join(''), '先想清楚');
  assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''), '答案');
  assert.deepEqual(chunks.filter(c => c.type === 'usage').map(c => c.usage), [{ inputTokens: 10, outputTokens: 5, totalTokens: 15, reasoningTokens: 2 }]);
  const params = JSON.parse(mock.requests.at(-1)!.body).config.modules.prompt_templating.model.params;
  assert.equal(params.thinking_budget, 64); assert.equal(params.enable_thinking, true);
  assert.equal(params.max_completion_tokens, 256); assert.equal(params.max_tokens, undefined);
  const buffered = bufferedReply(wrap({ model: 'mock-model', choices: [{ message: { role: 'assistant', content: 'answer', reasoning_content: [{ content: 'reason' }] }, finish_reason: 'stop' }] }), route);
  assert.equal(buffered.some(c => c.type === 'reasoning-delta' && c.text === 'reason'), true);
  assert.throws(() => responseProjection(route)(wrap(event({ reasoning_content: [{ content: 'signed', signature: 'opaque' }] }))), { code: 'UNSUPPORTED_OPTION' });
  const replayRoute = { ...route, model: { ...route.model, compatibility: { ...route.model.compatibility, replayReasoning: true } } };
  const previous = createAssistantMessage({ source: { provider: 'sap', model: 'chat', replayState: replayState(replayRoute, 'synthetic reasoning') }, content: [{ type: 'text', text: 'history' }] });
  const encoded = encodeRequest(buildRequest({ ...request(), messages: [...request().messages, previous] }, replayRoute), replayRoute) as Record<string, any>;
  assert.deepEqual(encoded.messages_history[1].reasoning_content, [{ content: 'synthetic reasoning' }]);
});

test('Orchestration: concurrent models share auth and a deployment, while each body and response keeps its selected model', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    const body = JSON.parse(req.body), model = body.config.modules.prompt_templating.model.name;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const usage = { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 };
    const final = { ...event({}, 'stop'), model, usage };
    res.end(sse([prelude(), wrap({ ...event({ content: model }), model }), wrap(final, { intermediate_results: { llm: final } })]));
  }); t.after(() => mock.close());
  const input = orchestrationConfig(mock.origin);
  input.providers.sap!.models = ['one', 'two', 'three', 'four', 'five'].map(id => ({ ...structuredClone(input.providers.sap!.models[0]!), id, upstreamModel: id }));
  const snapshot = snapshotOf(input), adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access });
  t.after(() => adapter.close());
  const models = await adapter.listModels('sap');
  assert.equal(models.length, 5);
  await Promise.all(models.map(async model => {
    const chunks = await collect(adapter.stream({ ...request(), model: model.id }));
    assert.equal(chunks.filter(c => c.type === 'text-delta').map(c => c.text).join(''), model.id);
    assert.deepEqual(chunks.filter(c => c.type === 'usage').map(c => c.usage), [{ inputTokens: 10, outputTokens: 3, totalTokens: 13 }]);
    assert.equal(chunks.at(-1)!.type, 'finish');
  }));
  assert.equal(mock.authRequests.length, 1);
  const calls = mock.requests.filter(r => r.method === 'POST' && r.url.pathname !== '/oauth/token');
  assert.equal(calls.length, 5);
  for (const call of calls) {
    assert.equal(call.url.pathname, '/v2/inference/deployments/test-deployment/v2/completion');
    assert.equal(call.url.search, '');
    const body = JSON.parse(call.body);
    assert.equal(body.config.modules.prompt_templating.model.max_retries, 0);
    assert.equal(Array.isArray(body.config.modules), false);
    assert.equal(body.config.stream.enabled, true);
    assert.equal(body.config.modules.prompt_templating.prompt, undefined);
  }
});

test('Orchestration: tools, JSON and literal template-looking text retain order through history and params', () => {
  const route = routeOf(snapshotOf(orchestrationConfig('http://127.0.0.1:1')), 'sap', 'chat');
  const callId = ToolCallId('original-call'), argumentsJson = '{ "value": "{{?not_a_template}}" }';
  const options = freeze({ ...request(), messages: [
    ...request().messages,
    createAssistantMessage({ source: { provider: 'sap', model: 'chat' }, content: [{ type: 'tool-call', id: callId, name: 'literal_tool', arguments: argumentsJson }] }),
    createToolResultMessage({ callId, content: [{ type: 'text', text: '{{?literal_result}}' }], isError: false }),
  ], tools: [{ name: 'literal_tool', description: 'Synthetic tool', parameters: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] } }] });
  const wire = buildRequest(options, route), body = encodeRequest(wire, route) as Record<string, any>;
  assert.deepEqual(body.messages_history, [wire.messages[0], {
    role: 'assistant',
    tool_calls: [{ id: callId, type: 'function', function: { name: 'literal_tool', arguments: argumentsJson } }],
  }, { role: 'tool', tool_call_id: callId, content: '{{?literal_result}}' }]);
  assert.equal(wire.messages[1]?.content, null, 'the original Chat Completions request is unchanged');
  assert.deepEqual(body.config.modules.prompt_templating.model.params.tools, wire.tools);
  const chunks = bufferedReply(wrap({ model: 'mock-model', choices: [{ message: { role: 'assistant', content: 'result' }, finish_reason: 'stop' }] }), route);
  assert.equal(chunks.at(-1)!.type, 'finish');
  const replayRoute = { ...route, model: { ...route.model, compatibility: { ...route.model.compatibility, replayReasoning: true } } };
  const state = replayState(replayRoute, 'reasoning');
  const previous = createAssistantMessage({ source: { provider: 'sap', model: 'chat', replayState: state }, content: [{ type: 'text', text: 'history' }] });
  assert.equal(restoreReasoning(previous, replayRoute), 'reasoning');
  assert.equal(restoreReasoning(previous, { ...replayRoute, provider: { ...route.provider, protocol: 'openai-chat-completions' } }), undefined);
  assert.throws(() => snapshotOf({ ...orchestrationConfig('http://127.0.0.1:1'), providers: { sap: { ...route.provider, apiVersion: 'wrong-query' } } }), { code: 'INVALID_CONFIG' });
});

test('Orchestration: wrong models, module failures, changed identities and missing DONE fail without retries or exposed error bodies', async t => {
  const base = { ...event({ content: 'partial' }), model: 'mock-model' };
  const cases = [
    { events: [wrap({ ...base, model: 'unrequested-model' })], done: true },
    { events: [wrap(base), { error: { code: 400, message: 'synthetic-secret' } }], done: true },
    { events: [wrap(base), wrap({}, { intermediate_failures: [{ message: 'synthetic-secret' }] })], done: true },
    { events: [wrap(base), { ...wrap(event({}, 'stop')), request_id: 'changed' }], done: true },
    { events: [wrap(base), wrap(event({}, 'stop'))], done: false },
  ];
  for (const scenario of cases) {
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse(scenario.events, scenario.done));
    }); t.after(() => mock.close());
    const snapshot = snapshotOf(orchestrationConfig(mock.origin)), adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access });
    t.after(() => adapter.close());
    const chunks: StreamChunk[] = [];
    await assert.rejects(async () => { for await (const chunk of adapter.stream(request())) chunks.push(chunk); }, error => {
      assert.doesNotMatch(String(error), /synthetic-secret/);
      return ['PROTOCOL', 'PROVIDER_ERROR'].includes((error as { code: string }).code);
    });
    assert.equal(chunks.some(c => c.type === 'finish'), false);
    assert.equal(mock.requests.filter(r => r.url.pathname.endsWith('/v2/completion')).length, 1);
  }
});

test('Orchestration: read-only discovery requires one RUNNING orchestration deployment, regardless of requested model', async t => {
  let count = 1;
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    if (req.url.pathname === '/v2/lm/deployments') return json(res, { count: count + 1, resources: [
      { id: 'direct', status: 'RUNNING', scenarioId: 'foundation-models' },
      ...Array.from({ length: count }, (_, i) => ({ id: 'shared-' + i, status: 'RUNNING', scenarioId: 'orchestration', deploymentUrl: mock.origin + '/v2/inference/deployments/shared-' + i })),
    ] });
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse([wrap(event({ content: 'ok' }, 'stop'))]));
  }); t.after(() => mock.close());
  const input = orchestrationConfig(mock.origin);
  input.providers.sap!.models[0]!.deployment = { selector: { scenario: 'orchestration' }, cacheTtlMs: 0 };
  const snapshot = snapshotOf(input), adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access });
  t.after(() => adapter.close());
  await collect(adapter.stream(request()));
  assert.equal(mock.requests.at(-1)!.url.pathname, '/v2/inference/deployments/shared-0/v2/completion');
  count = 2; await assert.rejects(collect(adapter.stream(request())), { code: 'AMBIGUOUS_DEPLOYMENT' });
  count = 0; await assert.rejects(collect(adapter.stream(request())), { code: 'DEPLOYMENT_NOT_READY' });
});

test('Orchestration: cancellation releases the stream and envelope metadata never becomes model output', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(sse([prelude(), wrap(event({ content: 'first' }))], false));
  }); t.after(() => mock.close());
  const route = routeOf(snapshotOf(orchestrationConfig(mock.origin)), 'sap', 'chat');
  assert.equal(responseProjection(route)({ request_id: 'x', intermediate_results: { templating: {} } }), undefined);
  const adapter = new SapAiCoreAdapter({ snapshot: () => route.snapshot, credentials: credentialAccess().access });
  t.after(() => adapter.close());
  const controller = new AbortController(), iterator = adapter.stream({ ...request(), signal: controller.signal })[Symbol.asyncIterator]();
  const first = await iterator.next(); assert.equal(first.value!.type, 'block-start');
  controller.abort();
  await assert.rejects(async () => { while (!(await iterator.next()).done) {} }, { code: 'ABORTED' });
  await until(() => mock.closedResponses >= 2);
});
