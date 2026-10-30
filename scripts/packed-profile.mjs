// Copied into a new installation directory by test-pack.ts. Imports only installed packages.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { createDiagnosticHost } from 'dsh-sap-ai-core/diagnostic-host';

const requests = [];
const server = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(req.url === '/oauth/token' ? '{}' : text) : {};
  requests.push({ url: req.url, body });
  if (req.url === '/oauth/token') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'bearer', expires_in: 60 })); return; }
  const isTool = body.tools?.length && !body.messages.some(message => message.role === 'tool');
  const delta = isTool ? { tool_calls: [{ index: 0, id: 'packed-call', type: 'function', function: { name: 'sap_diagnostic_multiply', arguments: '{"a":12,"b":13}' } }] } : { content: body.tools?.length ? '156' : 'packed installation works' };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const values = [{ choices: [{ index: 0, delta, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: isTool ? 'tool_calls' : 'stop' }] }, { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }];
  res.end(values.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join('') + 'data: [DONE]\n\n');
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const config = {
  instances: { test: { apiBaseUrl: origin, tokenUrl: origin + '/oauth/token', credentials: { clientIdRef: 'PACK_CLIENT_ID', clientSecretRef: 'PACK_CLIENT_SECRET' }, oauth: { clientAuthMethod: 'body' }, network: { proxyMode: 'direct' }, allowInsecureLocalhost: true } },
  providers: { 'sap-pack': { instance: 'test', resourceGroup: 'default', protocol: 'openai-chat-completions', models: [{ id: 'packed-model', upstreamModel: 'synthetic-model', deployment: { id: 'packed-deployment' }, capabilities: { streaming: true, tools: true, evidence: { status: 'verified', reference: 'synthetic packed-package test' } }, compatibility: { maxTokensField: 'max_tokens', includeUsage: true }, defaultMaxTokens: 64, maxOutputTokens: 256 }] } },
};
const environment = { PACK_CLIENT_ID: 'synthetic-client', PACK_CLIENT_SECRET: 'synthetic-secret' };
const ctx = new Context();
try {
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: environment }]));
  await ctx.plugin(Loader, { baseUrl: pathToFileURL(process.cwd() + '/').href });
  ctx.loader.enableLogs = false;
  const profile = [
    { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', config: { path: join(process.cwd(), 'empty-credentials.yaml'), watch: false } },
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    { id: 'sap-ai-core', name: 'dsh-sap-ai-core', config },
  ];
  await writeFile('profile.json', JSON.stringify(profile));
  await ctx.loader.root.update(JSON.parse(await readFile('profile.json', 'utf8'))); await ctx.loader.await();
  for (const entry of ctx.loader.entries()) { assert.ok(entry.fiber, 'profile entry imported'); await entry.fiber; }
  assert.equal(ctx.llm.listProviders()[0].id, 'sap-pack');
  assert.equal((await ctx.llm.listModels('sap-pack'))[0].id, 'packed-model');
  assert.equal(ctx.llm.listConfigurableProviders()[0].settingsNs, 'sap-ai-core');
  const run = async () => {
    const chunks = [];
    for await (const chunk of ctx.llm.stream({ provider: 'sap-pack', model: 'packed-model', maxTokens: 64, messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic packed test' }] }] })) chunks.push(chunk);
    assert.equal(chunks.at(-1).type, 'finish'); assert.equal(chunks.at(-1).reason.kind, 'stop');
  };
  await run();
  const first = ctx.sapAiCore;
  const changed = structuredClone(config); changed.providers['sap-pack'].models[0].deployment.id = 'updated-deployment';
  await ctx.loader.update('sap-ai-core', { config: changed }); await ctx.loader.await();
  assert.equal(ctx.sapAiCore, first); await run();
  assert.match(requests.at(-1).url, /updated-deployment/);
  const fiber = ctx.loader.resolve('sap-ai-core').fiber;
  ctx.loader.remove('sap-ai-core'); await fiber.dispose();
  assert.deepEqual(ctx.llm.listProviders(), []); assert.deepEqual(ctx.llm.listConfigurableProviders(), []);
  const id = await ctx.loader.create({ name: 'dsh-sap-ai-core', config }); await ctx.loader.resolve(id).fiber;
  assert.equal(ctx.llm.listProviders()[0].id, 'sap-pack');
  await run();
  await writeFile('plugin.json', JSON.stringify(config));
  if (process.argv.includes('--agents')) {
    const host = await createDiagnosticHost(config, { environment, agents: true });
    try {
      const result = await host.ctx.sapAiCore.diagnose({ provider: 'sap-pack', model: 'packed-model', level: 'tools', allowInference: true, maxRequests: 2 });
      assert.equal(result.toolExecutions, 1); assert.equal(result.requests, 2);
    } finally { await host.close(); }
  }
  console.log(JSON.stringify({ installedProfile: true, registration: true, selection: true, volatileUpdate: true, unloadReload: true, toolLoop: process.argv.includes('--agents') }));
} finally {
  await ctx.fiber.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
