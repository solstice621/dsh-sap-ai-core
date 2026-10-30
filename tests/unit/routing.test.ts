import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotOf, routeOf } from '../../src/config.js';
import { inferenceUrl } from '../../src/routing/endpoints.js';
import { SapAiCoreAdapter } from '../../src/adapter.js';
import { config, credentialAccess, json, mockServer, textResponse, collect, request, until } from '../support/mock.js';

test('S-T08/S-T18: endpoint/query/header validation rejects credential forwarding hazards', () => {
  const options = config('https://api.example.test');
  options.providers.sap!.apiVersion = 'version +&测试';
  options.providers.sap!.models[0]!.deployment = { id: 'one/路径 ?' };
  const route = routeOf(snapshotOf(options), 'sap', 'chat');
  const url = inferenceUrl(route, 'one/路径 ?');
  assert.equal(url.pathname, '/v2/inference/deployments/one%2F%E8%B7%AF%E5%BE%84%20%3F/chat/completions');
  assert.equal(url.searchParams.get('api-version'), 'version +&测试');
  delete options.providers.sap!.apiVersion;
  assert.equal(inferenceUrl(routeOf(snapshotOf(options), 'sap', 'chat'), 'id').search, '');
  for (const bad of ['http://public.example.test', 'https://user:secret@example.test', 'https://api.example.test?q=1', 'https://api.example.test/#fragment']) {
    const value = config(bad); assert.throws(() => snapshotOf(value), { code: 'INVALID_CONFIG' });
  }
  for (const header of ['Authorization', 'aI-ReSoUrCe-GrOuP', 'Cookie', 'Host', 'X-Request-ID']) {
    const value = config('https://api.example.test'); value.providers.sap!.headers = { [header]: 'value' };
    assert.throws(() => snapshotOf(value), { code: 'INVALID_CONFIG' });
  }
  const mixed = config('https://api.example.test');
  mixed.providers.sap!.models[0]!.deployment = { id: 'one', selector: { scenario: 'foundation-models', model: 'mock-model' } } as never;
  assert.throws(() => snapshotOf(mixed), { code: 'INVALID_CONFIG' });
  assert.throws(() => inferenceUrl(route, 'id', 'https://unknown.example.test/deployment'), { code: 'ROUTING' });
});

test('S-T01/S-T10: prepared calls retain old route/config after a concurrent update', async t => {
  const a = await mockServer(), b = await mockServer(); t.after(() => a.close()); t.after(() => b.close());
  const first = config(a.origin); first.providers.sap!.models[0]!.upstreamModel = 'model-a';
  let snapshot = snapshotOf(first);
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  const prepared = await adapter.prepareCall('sap', 'chat');
  const second = config(b.origin); second.providers.sap!.models[0]!.upstreamModel = 'model-b';
  snapshot = snapshotOf(second, 2);
  await collect(prepared.stream(request())); await collect(adapter.stream(request()));
  assert.equal(a.inferenceRequests.length, 1); assert.equal(b.inferenceRequests.length, 1);
  assert.equal(JSON.parse(a.inferenceRequests[0]!.body).model, 'model-a');
  assert.equal(JSON.parse(b.inferenceRequests[0]!.body).model, 'model-b');
});

test('S-T10: concurrent instances/resource groups/models keep tokens and routes isolated', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token-' + new URLSearchParams(req.body).get('client_id'), token_type: 'bearer', expires_in: 60 });
    textResponse(res);
  }); t.after(() => mock.close());
  const opts = config(mock.origin), creds = credentialAccess();
  opts.instances.other = { ...structuredClone(opts.instances.demo!), credentials: { clientIdRef: 'OTHER_ID', clientSecretRef: 'OTHER_SECRET' } };
  creds.values.set('OTHER_ID', 'other-client'); creds.values.set('OTHER_SECRET', 'other-secret');
  opts.providers.other = { ...structuredClone(opts.providers.sap!), instance: 'other', resourceGroup: 'group-b' };
  opts.providers.other.models[0]!.upstreamModel = 'other-model'; opts.providers.other.models[0]!.deployment = { id: 'other-deployment' };
  const snapshot = snapshotOf(opts);
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: creds.access }); t.after(() => adapter.close());
  await Promise.all(Array.from({ length: 8 }, (_, i) => collect(adapter.stream({ ...request(), provider: i % 2 ? 'sap' : 'other' }))));
  assert.equal(mock.authRequests.length, 2); assert.equal(mock.inferenceRequests.length, 8);
  for (const req of mock.inferenceRequests) {
    const model = JSON.parse(req.body).model;
    const other = model === 'other-model';
    assert.equal(req.headers.authorization, other ? 'Bearer token-other-client' : 'Bearer token-synthetic-client');
    assert.equal(req.headers['ai-resource-group'], other ? 'group-b' : 'default');
    assert.match(req.url.pathname, other ? /other-deployment/ : /test-deployment/);
  }
});

test('S-T09: discovery requires exactly one RUNNING match; explicit routes do not need management permission', async t => {
  for (const count of [0, 1, 2]) {
    let origin = '';
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      if (req.url.pathname === '/v2/lm/deployments') return json(res, { count, resources: Array.from({ length: count }, (_, i) => ({ id: 'd' + i, status: 'RUNNING', scenarioId: 'foundation-models', deploymentUrl: origin + '/v2/inference/deployments/d' + i, details: { resources: { backendDetails: { model: { name: 'mock-model' } } } } })) });
      textResponse(res);
    }); origin = mock.origin; t.after(() => mock.close());
    const opts = config(mock.origin); opts.providers.sap!.models[0]!.deployment = { selector: { scenario: 'foundation-models', model: 'mock-model' } };
    const snapshot = snapshotOf(opts);
    const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
    if (count === 1) { await collect(adapter.stream(request())); assert.equal(mock.inferenceRequests.length, 1); }
    else { await assert.rejects(async () => collect(adapter.stream(request())), { code: count === 0 ? 'DEPLOYMENT_NOT_READY' : 'AMBIGUOUS_DEPLOYMENT' }); assert.equal(mock.inferenceRequests.length, 0); }
  }
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    if (req.url.pathname.startsWith('/v2/lm')) return json(res, { error: 'forbidden' }, 403);
    textResponse(res);
  }); t.after(() => mock.close());
  const snapshot = snapshotOf(config(mock.origin));
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  await collect(adapter.stream(request())); assert.equal(mock.requests.some(r => r.url.pathname.startsWith('/v2/lm')), false);
});

test('S-T09: discovery checks every page before accepting uniqueness', async t => {
  let origin = '';
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    const i = Number(req.url.searchParams.get('$skip'));
    json(res, { count: 2, resources: [{ id: 'd' + i, status: 'RUNNING', scenarioId: 'foundation-models', deploymentUrl: origin + '/v2/inference/deployments/d' + i, details: { resources: { backend_details: { model: { name: 'mock-model' } } } } }] });
  }); origin = mock.origin; t.after(() => mock.close());
  const opts = config(mock.origin); opts.providers.sap!.models[0]!.deployment = { selector: { scenario: 'foundation-models', model: 'mock-model' }, pageSize: 1 };
  const snapshot = snapshotOf(opts); const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  await assert.rejects(async () => collect(adapter.stream(request())), { code: 'AMBIGUOUS_DEPLOYMENT' });
  assert.equal(mock.requests.filter(r => r.url.pathname === '/v2/lm/deployments').length, 2);
});

test('S-T09/S-T16: 404 invalidates discovery for the next attempt without switching during the failed attempt', async t => {
  let origin = '', discoveries = 0;
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
    if (req.url.pathname === '/v2/lm/deployments') {
      const id = 'd' + ++discoveries;
      return json(res, { count: 1, resources: [{ id, status: 'RUNNING', scenarioId: 'foundation-models', deploymentUrl: origin + '/v2/inference/deployments/' + id, details: { resources: { backendDetails: { model: { name: 'mock-model' } } } } }] });
    }
    if (req.url.pathname.includes('/d1/')) return json(res, { error: 'gone' }, 404);
    textResponse(res);
  }); origin = mock.origin; t.after(() => mock.close());
  const opts = config(mock.origin); opts.providers.sap!.models[0]!.deployment = { selector: { scenario: 'foundation-models', model: 'mock-model' } };
  const snapshot = snapshotOf(opts); const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
  await assert.rejects(async () => collect(adapter.stream(request())), { code: 'DEPLOYMENT_NOT_READY' });
  assert.equal(mock.inferenceRequests.length, 1); assert.equal(discoveries, 1);
  await collect(adapter.stream(request())); assert.equal(discoveries, 2); assert.equal(mock.inferenceRequests.length, 2);
});

test('S-T07/S-T16: direct 401/403/429/5xx calls never retry inside the adapter', async t => {
  for (const status of [401, 403, 429, 503]) {
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      res.setHeader('retry-after', '0.01'); json(res, { error: 'synthetic-secret' }, status);
    }); t.after(() => mock.close());
    const snapshot = snapshotOf(config(mock.origin)); const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
    await assert.rejects(async () => collect(adapter.stream(request())), error => { const e = error as { failure: { status: number; providerRetryAfterMs: number } }; assert.equal(e.failure.status, status); assert.equal(e.failure.providerRetryAfterMs, 10); assert.doesNotMatch(String(error), /synthetic-secret/); return true; });
    assert.equal(mock.authRequests.length, 1); assert.equal(mock.inferenceRequests.length, 1);
  }
});

test('S-T18: an HTTP redirect never forwards OAuth or inference credentials', async t => {
  const target = await mockServer(); t.after(() => target.close());
  for (const phase of ['auth', 'inference']) {
    const mock = await mockServer((req, res) => {
      if (phase !== 'auth' && req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      res.writeHead(307, { location: target.origin + '/capture' }); res.end();
    }); t.after(() => mock.close());
    const snapshot = snapshotOf(config(mock.origin)); const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
    await assert.rejects(async () => collect(adapter.stream(request())), { code: 'REDIRECT_REJECTED' });
  }
  assert.equal(target.requests.length, 0);
});

test('S-T14/S-T15: cancel discovery and time out inference headers without leaving live requests', async t => {
  for (const phase of ['deployment', 'inference'] as const) {
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'token', token_type: 'bearer', expires_in: 60 });
      // Deliberately send no response headers until the client closes this request.
    }); t.after(() => mock.close());
    const options = config(mock.origin);
    options.instances.demo!.network = { proxyMode: 'direct', requestTimeoutMs: phase === 'inference' ? 80 : 2000 };
    if (phase === 'deployment') options.providers.sap!.models[0]!.deployment = { selector: { scenario: 'foundation-models', model: 'mock-model' } };
    const snapshot = snapshotOf(options), controller = new AbortController();
    const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
    const pending = collect(adapter.stream({ ...request(), signal: controller.signal }));
    const rejected = assert.rejects(pending, { code: phase === 'deployment' ? 'ABORTED' : 'TIMEOUT' });
    await until(() => mock.requests.length === 2);
    if (phase === 'deployment') controller.abort();
    await rejected; await until(() => mock.closedResponses === 2);
    if (phase === 'deployment') assert.equal(mock.inferenceRequests.length, 0);
  }
});
