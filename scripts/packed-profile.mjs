// Copied into a new installation directory by test-pack.ts. Imports only installed packages.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { loadProfileDirectory, composeEntries } from '@deepseek-ai/dsh-app-boot';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { createDiagnosticHost } from 'dsh-sap-ai-core/diagnostic-host';

const requests = [];
const server = createServer(async (req, res) => {
  let text = ''; for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(req.url === '/oauth/token' ? '{}' : text) : {};
  requests.push({ url: req.url, body });
  if (req.url === '/oauth/token') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ access_token: 'synthetic-token', token_type: 'bearer', expires_in: 60 })); return; }
  const orchestration = req.url.endsWith('/v2/completion');
  const model = orchestration ? body.config.modules.prompt_templating.model.name : body.model;
  const messages = orchestration ? body.messages_history : body.messages;
  const tools = orchestration ? body.config.modules.prompt_templating.model.params.tools : body.tools;
  if (orchestration && messages.some(message => message.content === null)) { res.writeHead(400); res.end(); return; }
  const isTool = tools?.length && !messages.some(message => message.role === 'tool');
  const delta = isTool ? { tool_calls: [{ index: 0, id: 'packed-call', type: 'function', function: { name: 'sap_diagnostic_multiply', arguments: '{"a":12,"b":13}' } }] } : { content: tools?.length ? '156' : model };
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const values = [{ choices: [{ index: 0, delta, finish_reason: null }] }, { choices: [{ index: 0, delta: {}, finish_reason: isTool ? 'tool_calls' : 'stop' }] }, { choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }];
  if (orchestration && body.config.modules.prompt_templating.model.params.enable_thinking) {
    values.unshift({ choices: [{ index: 0, delta: { reasoning_content: [{ content: 'synthetic reasoning' }] }, finish_reason: null }] });
    values.at(-1).usage.completion_tokens_details = { reasoning_tokens: 2 };
  }
  res.end(values.map(value => 'data: ' + JSON.stringify(orchestration ? { request_id: 'packed-request', final_result: { ...value, model } } : value) + '\n\n').join('') + 'data: [DONE]\n\n');
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
  const bundleProfile = loadProfileDirectory('test-pack', process.cwd(), join(process.cwd(), 'package.json'), { userLayer: false });
  assert.deepEqual(bundleProfile.skippedBundles, []);
  const bundleEntries = composeEntries(bundleProfile.layers.map(layer => layer.patches));
  const sapEntry = bundleEntries.find(entry => entry.name === 'dsh-sap-ai-core');
  assert.ok(sapEntry, 'published dsh.bundle resolves to the plugin entry');
  const sapId = sapEntry.id;
  const profile = [
    { id: 'credentials', name: '@deepseek-ai/dsh-credentials-local', config: { path: join(process.cwd(), 'empty-credentials.yaml'), watch: false } },
    { id: 'llm', name: '@deepseek-ai/dsh-llm' },
    ...bundleEntries,
  ];
  await writeFile('profile.json', JSON.stringify(profile));
  await ctx.loader.root.update(JSON.parse(await readFile('profile.json', 'utf8'))); await ctx.loader.await();
  for (const entry of ctx.loader.entries()) { assert.ok(entry.fiber, 'profile entry imported'); await entry.fiber; }
  assert.deepEqual(ctx.llm.listProviders(), []);
  assert.equal(requests.length, 0, 'empty bundle configuration does not acquire credentials or call a model');
  await ctx.loader.update(sapId, { config }); await ctx.loader.await();
  assert.equal(ctx.llm.listProviders()[0].id, 'sap-pack');
  assert.equal((await ctx.llm.listModels('sap-pack'))[0].id, 'packed-model');
  assert.equal(ctx.llm.listConfigurableProviders()[0].settingsNs, sapId);
  const run = async () => {
    const chunks = [];
    for await (const chunk of ctx.llm.stream({ provider: 'sap-pack', model: 'packed-model', maxTokens: 64, messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic packed test' }] }] })) chunks.push(chunk);
    assert.equal(chunks.at(-1).type, 'finish'); assert.equal(chunks.at(-1).reason.kind, 'stop');
  };
  await run();
  const first = ctx.sapAiCore;
  const changed = structuredClone(config); changed.providers['sap-pack'].models[0].deployment.id = 'updated-deployment';
  await ctx.loader.update(sapId, { config: changed }); await ctx.loader.await();
  assert.equal(ctx.sapAiCore, first); await run();
  assert.match(requests.at(-1).url, /updated-deployment/);
  const example = JSON.parse(await readFile('node_modules/dsh-sap-ai-core/examples/cn40-qwen/multi-models.json', 'utf8'));
  const multi = structuredClone(config);
  multi.providers['sap-pack'].protocol = 'sap-orchestration-v2';
  multi.providers['sap-pack'].models = example.providers['sap-ai-core-demo'].models.map(model => ({ ...model, deployment: { id: 'shared-packed-deployment' } }));
  await ctx.loader.update(sapId, { config: multi }); await ctx.loader.await();
  const expectedModels = ['qwen3.6-plus', 'qwen3.6-flash', 'qwen3.7-plus', 'qwen3.7-max', 'qwen3.8-max'];
  assert.deepEqual((await ctx.llm.listModels('sap-pack')).map(model => model.id), expectedModels);
  for (const model of expectedModels) {
    const info = await ctx.llm.resolveModelInfo('sap-pack', model);
    assert.equal(info.id, model);
    assert.deepEqual(info.reasoning.efforts.map(effort => effort.id), ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
    assert.deepEqual(info.reasoning.efforts.map(effort => effort.name), ['关闭思考', '低', '中', '高', '极高', 'Max']);
    assert.equal(info.reasoning.defaultEffort, 'max');
    for (const [effort, budget] of [[undefined, 128000], ['low', 25600], ['medium', 51200], ['high', 76800], ['xhigh', 102400], ['max', 128000], ['off', undefined]]) {
      const chunks = [];
      for await (const chunk of ctx.llm.stream({ provider: 'sap-pack', model, ...(effort === undefined ? {} : { reasoningEffort: effort }), maxTokens: 32, messages: [{ role: 'user', content: [{ type: 'text', text: 'synthetic selection test' }] }] })) chunks.push(chunk);
      assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), model);
      assert.equal(chunks.at(-1).type, 'finish');
      assert.equal(chunks.some(chunk => chunk.type === 'reasoning-delta' && chunk.text === 'synthetic reasoning'), budget !== undefined);
      assert.equal(requests.at(-1).url, '/v2/inference/deployments/shared-packed-deployment/v2/completion');
      const params = requests.at(-1).body.config.modules.prompt_templating.model.params;
      assert.equal(params.thinking_budget, budget);
      assert.equal(params.enable_thinking, budget !== undefined);
    }
  }
  const fiber = ctx.loader.resolve(sapId).fiber;
  ctx.loader.remove(sapId); await fiber.dispose();
  assert.deepEqual(ctx.llm.listProviders(), []); assert.deepEqual(ctx.llm.listConfigurableProviders(), []);
  const id = await ctx.loader.create({ name: 'dsh-sap-ai-core', config }); await ctx.loader.resolve(id).fiber;
  assert.equal(ctx.llm.listProviders()[0].id, 'sap-pack');
  await run();
  await writeFile('plugin.json', JSON.stringify(config));
  if (process.argv.includes('--agents')) {
    for (const candidate of [config, multi]) {
      const host = await createDiagnosticHost(candidate, { environment, agents: true });
      try {
        const result = await host.ctx.sapAiCore.diagnose({ provider: 'sap-pack', model: candidate.providers['sap-pack'].models[0].id, level: 'tools', allowInference: true, maxRequests: 2 });
        assert.equal(result.toolExecutions, 1); assert.equal(result.requests, 2);
      } finally { await host.close(); }
    }
  }
  console.log(JSON.stringify({ installedProfile: true, bundleComposition: true, emptyConfiguration: true, registration: true, selection: true, fiveModelSelection: true, thinkingSelection: true, volatileUpdate: true, unloadReload: true, toolLoop: process.argv.includes('--agents'), orchestrationToolLoop: process.argv.includes('--agents') }));
} finally {
  await ctx.fiber.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
