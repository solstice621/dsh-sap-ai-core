import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotOf, routeOf } from '../../src/config.js';
import { CredentialResolver } from '../../src/auth/credentials.js';
import { TokenManager } from '../../src/auth/token-manager.js';
import { SapAiCoreAdapter } from '../../src/adapter.js';
import { config, credentialAccess, deferred, json, mockServer, collect, request, until } from '../support/mock.js';

const env = { httpProxy: '', httpsProxy: '', noProxy: '' };

test('S-T02: missing/blank credentials fail before any network request', async t => {
  const mock = await mockServer(); t.after(() => mock.close());
  const credentials = credentialAccess();
  const snapshot = snapshotOf(config(mock.origin));
  const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentials.access }); t.after(() => adapter.close());
  for (const value of [undefined, '', '   ', '\n']) {
    if (value === undefined) credentials.values.delete('TEST_CLIENT_SECRET'); else credentials.values.set('TEST_CLIENT_SECRET', value);
    await assert.rejects(async () => collect(adapter.stream(request())), e => ['MISSING_CREDENTIAL', 'INVALID_CREDENTIAL'].includes((e as { code: string }).code));
  }
  assert.equal(mock.requests.length, 0);
});

test('S-T03: exactly one configured body/basic OAuth form with RFC encoding', async t => {
  for (const method of ['body', 'basic'] as const) {
    const mock = await mockServer(); t.after(() => mock.close());
    const options = config(mock.origin); options.instances.demo!.oauth.clientAuthMethod = method;
    const creds = credentialAccess(); creds.values.set('TEST_CLIENT_ID', 'id: ü'); creds.values.set('TEST_CLIENT_SECRET', 'secret +&=');
    const route = routeOf(snapshotOf(options), 'sap', 'chat');
    const captured = await new CredentialResolver(creds.access).resolve(route);
    const manager = new TokenManager(); t.after(() => manager.close());
    await manager.get(route, captured, env);
    assert.equal(mock.authRequests.length, 1);
    const wire = mock.authRequests[0]!; const form = new URLSearchParams(wire.body);
    assert.equal(form.get('grant_type'), 'client_credentials');
    if (method === 'body') { assert.equal(form.get('client_id'), 'id: ü'); assert.equal(form.get('client_secret'), 'secret +&='); assert.equal(wire.headers.authorization, undefined); }
    else {
      assert.equal(form.get('client_id'), null); assert.equal(form.get('client_secret'), null);
      assert.equal(Buffer.from(wire.headers.authorization!.slice(6), 'base64').toString(), 'id%3A+%C3%BC:secret+%2B%26%3D');
    }
  }
});

test('S-T04/S-T06: concurrent expiry shares one refresh; late 401 cannot evict a new generation', async t => {
  let calls = 0;
  const mock = await mockServer((_req, res) => json(res, { access_token: 'token-' + ++calls, token_type: 'bearer', expires_in: 60 })); t.after(() => mock.close());
  let now = Date.now(); const manager = new TokenManager(() => now, () => 0); t.after(() => manager.close());
  const route = routeOf(snapshotOf(config(mock.origin)), 'sap', 'chat');
  const credentials = await new CredentialResolver(credentialAccess().access).resolve(route);
  const first = await manager.get(route, credentials, env);
  now += 61_000;
  const next = await Promise.all(Array.from({ length: 24 }, () => manager.get(route, credentials, env)));
  assert.equal(calls, 2); assert.equal(new Set(next.map(t => t.generation)).size, 1);
  assert.notEqual(first.generation, next[0]!.generation);
  assert.equal(manager.invalidate(first), false);
  assert.equal((await manager.get(route, credentials, env)).generation, next[0]!.generation); assert.equal(calls, 2);
});

test('S-T05: canceling one shared waiter leaves the other waiter and refresh alive', async t => {
  const gate = deferred();
  const mock = await mockServer(async (_req, res) => { await gate.promise; json(res, { access_token: 'shared-token', token_type: 'bearer', expires_in: 60 }); }); t.after(() => mock.close());
  const manager = new TokenManager(); t.after(() => manager.close());
  const route = routeOf(snapshotOf(config(mock.origin)), 'sap', 'chat');
  const credentials = await new CredentialResolver(credentialAccess().access).resolve(route);
  const controller = new AbortController();
  const canceled = manager.get(route, credentials, env, controller.signal);
  const canceledCheck = assert.rejects(canceled, { code: 'ABORTED' });
  const survivor = manager.get(route, credentials, env);
  await until(() => mock.authRequests.length === 1); controller.abort(); await canceledCheck;
  assert.equal(mock.authRequests.length, 1); gate.resolve();
  assert.equal((await survivor).value, 'shared-token'); assert.equal(manager.stats.acquisitions, 1);
});

test('S-T05/S-T15: all abandoned waiters release the connection and allow a new refresh', async t => {
  let calls = 0;
  const mock = await mockServer((_req, res) => { if (++calls > 1) json(res, { access_token: 'new-token', token_type: 'bearer', expires_in: 60 }); }); t.after(() => mock.close());
  const manager = new TokenManager(); t.after(() => manager.close());
  const route = routeOf(snapshotOf(config(mock.origin)), 'sap', 'chat');
  const credentials = await new CredentialResolver(credentialAccess().access).resolve(route);
  const controller = new AbortController(); const pending = manager.get(route, credentials, env, controller.signal);
  const check = assert.rejects(pending, { code: 'ABORTED' });
  await until(() => calls === 1); controller.abort(); await check;
  await until(() => mock.closedResponses >= 1);
  assert.equal((await manager.get(route, credentials, env)).value, 'new-token'); assert.equal(calls, 2);
});

test('S-T06: secret rotation is detected per operation and remains instance-isolated', async t => {
  const mock = await mockServer(); t.after(() => mock.close());
  const access = credentialAccess(); const resolver = new CredentialResolver(access.access);
  const options = config(mock.origin);
  options.instances.second = structuredClone(options.instances.demo!);
  options.providers.second = { ...structuredClone(options.providers.sap!), instance: 'second' };
  const snapshot = snapshotOf(options), route = routeOf(snapshot, 'sap', 'chat');
  const manager = new TokenManager(); t.after(() => manager.close());
  const old = await manager.get(route, await resolver.resolve(route), env);
  access.values.set('TEST_CLIENT_SECRET', 'rotated-secret');
  const rotated = await manager.get(route, await resolver.resolve(route), env);
  const other = routeOf(snapshot, 'second', 'chat');
  const isolated = await manager.get(other, await resolver.resolve(other), env);
  assert.notEqual(old.key, rotated.key); assert.notEqual(rotated.key, isolated.key);
  manager.invalidate(old);
  assert.equal((await manager.get(route, await resolver.resolve(route), env)).generation, rotated.generation);
  assert.equal(mock.authRequests.length, 3);
  assert.equal(new URLSearchParams(mock.authRequests[1]!.body).get('client_secret'), 'rotated-secret');
});

test('S-T07: malformed OAuth lifetimes never reach inference; no assumed eternal token', async t => {
  for (const expires of [undefined, null, '3600', 0, -1]) {
    const mock = await mockServer((_req, res) => json(res, { access_token: 'token', token_type: 'bearer', expires_in: expires })); t.after(() => mock.close());
    const snapshot = snapshotOf(config(mock.origin));
    const adapter = new SapAiCoreAdapter({ snapshot: () => snapshot, credentials: credentialAccess().access }); t.after(() => adapter.close());
    await assert.rejects(async () => collect(adapter.stream(request())), { code: 'AUTH' });
    assert.equal(mock.authRequests.length, 1); assert.equal(mock.inferenceRequests.length, 0);
  }
});
