import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDiagnosticHost } from '../../src/diagnostics/host.js';
import { config, mockServer, json, textResponse, sse, event } from '../support/mock.js';
import { harness } from '../support/dsh.js';

test('S4: config/auth/deployment diagnostics never perform inference; paid levels are opt-in', async t => {
  const mock = await mockServer((req, res) => {
    if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'synthetic-token', token_type: 'bearer', expires_in: 60 });
    if (req.method === 'GET') return json(res, { id: 'test-deployment', status: 'RUNNING' });
    textResponse(res);
  }); t.after(() => mock.close());
  const app = await harness(config(mock.origin)); t.after(() => app.close());
  const run = (level: 'config' | 'auth' | 'deployment' | 'chat' | 'stream' | 'tools') => app.ctx.sapAiCore.diagnose({ level, provider: 'sap', model: 'chat' });
  const local = await run('config'); assert.equal(mock.requests.length, 0); assert.equal(local.ok, true);
  const auth = await run('auth'); assert.equal(mock.authRequests.length, 1); assert.equal('token' in auth && auth.token!.generation, 1);
  const deployment = await run('deployment'); assert.equal('deployment' in deployment && deployment.deployment!.status, 'RUNNING');
  assert.equal(mock.inferenceRequests.length, 0);
  for (const level of ['chat', 'stream', 'tools'] as const) await assert.rejects(run(level), { code: 'INFERENCE_OPT_IN_REQUIRED' });
  assert.equal(mock.inferenceRequests.length, 0);
  assert.doesNotMatch(JSON.stringify([local, auth, deployment]), /synthetic-secret|synthetic-token/);
});

test('S4: isolated host reads only explicit refs or a matching specified service key', async t => {
  const mock = await mockServer(); t.after(() => mock.close());
  const directory = await mkdtemp(join(tmpdir(), 'sap-host-test-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'synthetic-key.json');
  await writeFile(file, JSON.stringify({ clientid: 'synthetic-client', clientsecret: 'synthetic-secret', url: mock.origin, serviceurls: { AI_API_URL: mock.origin }, auth_placement: 'body' }), { mode: 0o600 });
  const app = await createDiagnosticHost(config(mock.origin), { serviceKeyFile: file, serviceKeyInstance: 'demo', environment: {} }); t.after(() => app.close());
  await app.ctx.sapAiCore.diagnose({ level: 'auth', provider: 'sap', model: 'chat' });
  assert.equal(mock.authRequests.length, 1);
  const invalid = config(mock.origin); invalid.instances.demo!.apiBaseUrl = 'http://127.0.0.1:1';
  await assert.rejects(createDiagnosticHost(invalid, { serviceKeyFile: file, serviceKeyInstance: 'demo' }), { code: 'INVALID_CREDENTIAL' });
  assert.equal(mock.authRequests.length, 1);
});

test('S4: tools diagnostic uses only its scoped DSH tool, validates the result, and enforces request budget', async t => {
  for (const repeat of [false, true]) {
    let count = 0, foreign = 0;
    const mock = await mockServer((req, res) => {
      if (req.url.pathname === '/oauth/token') return json(res, { access_token: 'synthetic-token', token_type: 'bearer', expires_in: 60 });
      const body = JSON.parse(req.body);
      assert.deepEqual(body.tools.map((tool: { function: { name: string } }) => tool.function.name), ['sap_diagnostic_multiply']);
      if (++count === 1 || repeat) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.end(sse([event({ tool_calls: [{ index: 0, id: 'call-' + count, type: 'function', function: { name: 'sap_diagnostic_multiply', arguments: '{"a":12,"b":13}' } }] }), event({}, 'tool_calls')])); return;
      }
      assert.equal(body.messages.find((message: { role: string }) => message.role === 'tool').content, '156');
      textResponse(res, '156');
    }); t.after(() => mock.close());
    const app = await harness(config(mock.origin), true); t.after(() => app.close());
    app.ctx.tools.register({ name: 'foreign_tool', description: 'must remain invisible', parameters: { type: 'object' }, output: { schema: { type: 'integer' }, render: () => [] }, async execute() { foreign++; return 1; } });
    const operation = app.ctx.sapAiCore.diagnose({ level: 'tools', provider: 'sap', model: 'chat', allowInference: true, maxRequests: 2 });
    if (repeat) await assert.rejects(operation, { code: 'DIAGNOSTIC_BUDGET' });
    else { const result = await operation; assert.equal('toolExecutions' in result && result.toolExecutions, 1); }
    assert.equal(count, 2); assert.equal(foreign, 0);
  }
});
