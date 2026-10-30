import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import * as sap from '../../src/index.js';
import { MemoryCredentials } from '../support/dsh.js';
import { config, mockServer, collect, request, json, sse, event, textResponse, until } from '../support/mock.js';

test('S-T01/S-T15: real Loader volatile updates preserve active calls, reject conflicts, and release streams on restart', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'synthetic-token', token_type: 'bearer', expires_in: 60 });
    if (req.url.pathname.includes('/paused/')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(sse([event({ content: 'paused' })], false)); return;
    }
    textResponse(res);
  }); t.after(() => mock.close());
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime); await ctx.plugin(MemoryCredentials);
  await ctx.plugin(Loader);
  const loader = ctx.loader; loader.enableLogs = false; loader.builtins.sap = sap;
  const options = config(mock.origin);
  await loader.root.update([{ id: 'sap-plugin', name: 'cordis:sap', config: options }]); await loader.await();
  const fiber = loader.resolve('sap-plugin').fiber!; assert.ok(fiber); await fiber;
  const runtime = ctx.sapAiCore;
  assert.equal(ctx.llm.listProviders()[0]!.id, 'sap');
  const prepared = await runtime.adapter.prepareCall('sap', 'chat');
  const changed = structuredClone(options); changed.providers.sap!.models[0]!.deployment = { id: 'second' };
  await loader.update('sap-plugin', { config: changed }); await loader.await();
  assert.equal(loader.resolve('sap-plugin').fiber, fiber); assert.equal(ctx.sapAiCore, runtime);
  assert.equal(runtime.snapshot.generation, 2);
  await collect(prepared.stream(request())); await collect(runtime.adapter.stream(request()));
  assert.match(mock.inferenceRequests[0]!.url.pathname, /test-deployment/);
  assert.match(mock.inferenceRequests[1]!.url.pathname, /second/);
  const externalOptions = config(mock.origin); externalOptions.providers.taken = externalOptions.providers.sap!;
  const external = new sap.SapAiCoreAdapter({ snapshot: () => sap.snapshotOf(externalOptions), credentials: ctx.credentials }); t.after(() => external.close());
  const release = ctx.llm.registerAdapter(['taken'], external); t.after(release);
  const conflict = structuredClone(changed); conflict.providers.taken = structuredClone(conflict.providers.sap!);
  await loader.update('sap-plugin', { config: conflict }); await loader.await();
  assert.equal(runtime.snapshot.generation, 2); assert.deepEqual(Object.keys(runtime.snapshot.config.providers), ['sap']);
  const invalid = structuredClone(changed); invalid.providers.sap!.headers = { Authorization: 'synthetic-secret' };
  await loader.update('sap-plugin', { config: invalid }); await loader.await();
  assert.equal(runtime.snapshot.generation, 2);
  const paused = structuredClone(changed); paused.providers.sap!.models[0]!.deployment = { id: 'paused' };
  await loader.update('sap-plugin', { config: paused }); await loader.await();
  const iterator = runtime.adapter.stream(request())[Symbol.asyncIterator](); await iterator.next();
  const closedBefore = mock.closedResponses;
  await fiber.restart(); await loader.await();
  await until(() => mock.closedResponses > closedBefore);
  assert.notEqual(ctx.sapAiCore, runtime);
  await assert.rejects(async () => { while (!(await iterator.next()).done) {} }, { code: 'ABORTED' });
  release(); loader.remove('sap-plugin'); await loader.await();
  assert.deepEqual(ctx.llm.listProviders(), []); assert.deepEqual(ctx.llm.listConfigurableProviders(), []);
});
