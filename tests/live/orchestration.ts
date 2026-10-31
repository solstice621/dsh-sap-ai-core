import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { RequestMessage } from '@deepseek-ai/dsh-llm';
import { createDiagnosticHost } from '../../src/diagnostics/host.js';
import { snapshotOf } from '../../src/config.js';
import { safeError } from '../../src/diagnostics/errors.js';
import { failureFacts, saveReport, sourceFingerprint } from './support.js';
import { verifyToolRoundtrip } from './model-tools.js';
import type { AttemptDiagnostic } from '../../src/adapter.js';

if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Set SAP_AICORE_LIVE=1 for this budgeted live test.');
const { values } = parseArgs({ options: {
  config: { type: 'string' }, provider: { type: 'string' }, 'service-key': { type: 'string' }, instance: { type: 'string' },
  out: { type: 'string', default: '.local/cn40-orchestration-live-report.json' },
}, strict: true, allowPositionals: false });
assert.ok(values.config && values.provider && values['service-key'] && values.instance);
const input = JSON.parse(await readFile(values.config, 'utf8'));
const snapshot = snapshotOf(input), route = snapshot.config.providers[values.provider];
assert.ok(route && route.protocol === 'sap-orchestration-v2');
const expected = ['qwen3.6-plus', 'qwen3.6-flash', 'qwen3.7-plus', 'qwen3.7-max', 'qwen3.8-max'];
assert.deepEqual(route.models.map(model => model.upstreamModel).sort(), [...expected].sort());
assert.equal(route.retryPolicy.maxRetries, 0, 'Live acceptance disables generic retries.');
const report: Record<string, unknown> = {
  suite: 'cn40-five-models-orchestration', startedAt: new Date().toISOString(), status: 'running',
  sourceSha256: await sourceFingerprint(), requestBudget: 24, maxOutputTokensPerRequest: 128, results: [],
};
const results: Record<string, unknown>[] = [], attempts: AttemptDiagnostic[] = [];
const host = await createDiagnosticHost(input, { serviceKeyFile: values['service-key'], serviceKeyInstance: values.instance, environment: {}, agents: true });
host.ctx.on('sap-ai-core/attempt', event => attempts.push(event));
let failed = false;
try {
  const models = await host.ctx.llm.listModels(values.provider);
  assert.equal(models.length, 5);
  report.registeredModels = models.map(model => ({ id: model.id, name: model.name }));
  const streams = route.models.map(async model => {
    try {
      const stream = await host.ctx.sapAiCore.diagnose({ provider: values.provider!, model: model.id, level: 'stream', allowInference: true, maxRequests: 1, maxOutputTokens: 64, timeoutMs: 45_000 });
      results.push({ upstreamModel: model.upstreamModel, ...stream });
    } catch (error) {
      const safe = safeError(error, 'inference'); failed = true;
      results.push({ model: model.upstreamModel, level: 'stream', ok: false, code: safe.code, phase: safe.phase, status: safe.failure.status });
    }
  });
  await Promise.all(streams);
  report.concurrentAuth = { ...host.ctx.sapAiCore.adapter.tokens.stats };
  assert.equal(host.ctx.sapAiCore.adapter.tokens.stats.acquisitions, 1);
  for (const model of route.models) {
    try {
      const tools = await verifyToolRoundtrip(host.ctx, values.provider!, model.id);
      results.push({ upstreamModel: model.upstreamModel, ...tools });
    } catch (error) {
      failed = true;
      results.push({ model: model.upstreamModel, level: 'tools', ok: false, ...failureFacts(error) });
    }
    report.results = results; await saveReport(values.out, { ...report, attempts });
  }
  const flash = route.models.find(model => model.upstreamModel === 'qwen3.6-flash')!;
  const plus = route.models.find(model => model.upstreamModel === 'qwen3.6-plus')!;
  const history: RequestMessage[] = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '请记住本次对话暗号是“松间明月”。现在只回复“已记住”。' }] })];
  const answer = async (model: string) => {
    let text = '', finished = false;
    for await (const chunk of host.ctx.llm.stream({ provider: values.provider!, model, messages: history, maxTokens: 32, signal: AbortSignal.timeout(45_000) })) {
      if (chunk.type === 'text-delta') text += chunk.text;
      if (chunk.type === 'finish') { assert.notEqual(chunk.reason.kind, 'error'); finished = true; }
    }
    assert.ok(finished && text.length);
    return text;
  };
  const firstAnswer = await answer(plus.id);
  history.push(createAssistantMessage({ source: { provider: values.provider, model: plus.id }, content: [{ type: 'text', text: firstAnswer }] }));
  history.push(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '刚才告诉你的暗号是什么？只回答暗号。' }] }));
  const nextAnswer = await answer(flash.id);
  assert.match(nextAnswer, /松间明月/);
  results.push({ level: 'model-switch', ok: true, from: plus.upstreamModel, to: flash.upstreamModel, turns: 2, contextRetained: true });
  const controller = new AbortController();
  let deltas = 0;
  await assert.rejects(async () => {
    for await (const chunk of host.ctx.sapAiCore.adapter.stream({
      provider: values.provider!, model: flash.id, signal: controller.signal, maxTokens: 128,
      messages: [{ role: 'user', content: [{ type: 'text', text: '请用中文逐项介绍从一到二十的数字。' }] }],
    })) if (chunk.type === 'text-delta' && ++deltas === 2) controller.abort();
  }, { code: 'ABORTED' });
  assert.equal(deltas, 2);
  const recovered = await host.ctx.sapAiCore.diagnose({ provider: values.provider, model: flash.id, level: 'stream', allowInference: true, maxRequests: 1, maxOutputTokens: 32, timeoutMs: 45_000 });
  results.push({ level: 'cancel-and-recover', ok: true, canceledAtDeltas: deltas, recovery: recovered });
  assert.ok(attempts.length <= 24, 'Live attempt budget exceeded.');
  assert.equal(failed, false, 'A model failed acceptance; inspect the redacted report.');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = failureFacts(error); process.exitCode = 1;
} finally {
  await host.close();
  report.results = results; report.attempts = attempts; report.requests = attempts.length; report.finishedAt = new Date().toISOString();
  await saveReport(values.out, report);
  console.log(JSON.stringify({ status: report.status, requests: attempts.length, results: results.map(({ model, upstreamModel, level, ok }) => ({ model: upstreamModel ?? model, level, ok })), report: values.out }));
}
