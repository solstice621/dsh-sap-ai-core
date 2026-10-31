import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { createDiagnosticHost } from '../../src/diagnostics/host.js';
import type { AttemptDiagnostic } from '../../src/adapter.js';
import { snapshotOf } from '../../src/config.js';
import { failureFacts, saveReport, sourceFingerprint } from './support.js';
import { verifyToolRoundtrip } from './model-tools.js';

if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Set SAP_AICORE_LIVE=1 for this budgeted live test.');
const { values } = parseArgs({ options: {
  config: { type: 'string' }, provider: { type: 'string' }, 'service-key': { type: 'string' }, instance: { type: 'string' },
  out: { type: 'string', default: '.local/cn40-thinking-live-report.json' },
}, strict: true, allowPositionals: false });
assert.ok(values.config && values.provider && values['service-key'] && values.instance);
const input = JSON.parse(await readFile(values.config, 'utf8'));
const provider = values.provider;
const efforts = ['off', 'low', 'medium', 'high', 'xhigh', 'max'];
const configured = snapshotOf(input).config.providers[provider];
assert.ok(configured && configured.protocol === 'sap-orchestration-v2' && configured.models.length === 5);
assert.deepEqual(configured.models.map(model => model.upstreamModel).sort(), ['qwen3.6-flash', 'qwen3.6-plus', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.8-max']);
assert.equal(configured.retryPolicy.maxRetries, 0);
// Use the daily answer-limit semantics. SAP requires max_completion_tokens to
// exceed thinking_budget, so a tiny combined limit cannot validate larger presets.
for (const model of input.providers[provider].models) {
  model.maxOutputTokens = 256; model.defaultMaxTokens = 256;
  model.compatibility.maxTokensField = 'max_tokens';
  model.compatibility.reasoningEfforts.probe = { name: 'Budget probe', parameters: { enable_thinking: true, thinking_budget: 64 } };
}
const report: Record<string, unknown> = { suite: 'cn40-thinking-efforts', startedAt: new Date().toISOString(), sourceSha256: await sourceFingerprint(), status: 'running', requestBudget: 40, maxAnswerTokens: 32, toolMaxAnswerTokens: 128, outputCharacterGuard: 4096, knownOutputTokenBudget: 12000, results: [] };
report.thinkingPresets = configured.models.map(model => ({ model: model.upstreamModel, defaultEffort: model.compatibility.defaultReasoningEffort, budgets: Object.fromEntries(Object.entries(model.compatibility.reasoningEfforts).map(([effort, setting]) => [effort, setting.parameters.thinking_budget ?? null])) }));
const results: Record<string, unknown>[] = [], attempts: AttemptDiagnostic[] = [];
const host = await createDiagnosticHost(input, { serviceKeyFile: values['service-key'], serviceKeyInstance: values.instance, environment: {}, agents: true });
host.ctx.on('sap-ai-core/attempt', event => attempts.push(event));
let failed = false;
try {
  for (const model of configured.models) {
    assert.deepEqual(Object.keys(model.compatibility.reasoningEfforts), efforts);
    assert.equal(model.compatibility.defaultReasoningEffort, 'max');
  }
  for (const effort of efforts) {
    await Promise.all(configured.models.map(async model => {
      const value: Record<string, unknown> = { model: model.upstreamModel, level: 'thinking', effort, ok: false };
      let reasoningDeltas = 0, reasoningCharacters = 0, textCharacters = 0, finished = false;
      try {
        for await (const chunk of host.ctx.sapAiCore.adapter.stream({ provider, model: model.id, reasoningEffort: ReasoningEffortId(effort), maxTokens: 32, signal: AbortSignal.timeout(45_000), messages: [{ role: 'user', content: [{ type: 'text', text: '计算 37 × 48，最后只给出结果。' }] }] })) {
          if (chunk.type === 'reasoning-delta') { reasoningDeltas++; reasoningCharacters += chunk.text.length; }
          if (chunk.type === 'text-delta') textCharacters += chunk.text.length;
          assert.ok(reasoningCharacters + textCharacters <= 4096, 'Live output guard reached');
          if (chunk.type === 'usage') value.usage = chunk.usage;
          if (chunk.type === 'finish') { assert.notEqual(chunk.reason.kind, 'error'); value.finish = chunk.reason.kind; finished = true; }
        }
        assert.ok(finished);
        assert.ok(textCharacters > 0);
        if (effort === 'off') assert.equal(reasoningCharacters, 0);
        value.ok = true;
      } catch (error) { failed = true; Object.assign(value, failureFacts(error)); }
      results.push({ ...value, reasoningDeltas, reasoningCharacters, textCharacters });
    }));
    report.results = results; await saveReport(values.out, { ...report, attempts });
    assert.ok(attempts.reduce((sum, attempt) => sum + (attempt.usage?.outputTokens ?? 0), 0) <= 12000, 'Known output budget exceeded');
  }
  // Individual simple responses may use zero reasoning tokens; each model must
  // still demonstrate reasoning output in at least one enabled setting.
  for (const model of configured.models) assert.ok(results.some(result => result.model === model.upstreamModel && result.effort !== 'off' && typeof result.reasoningCharacters === 'number' && result.reasoningCharacters > 0), 'No reasoning output observed for model');
  for (const model of configured.models) {
    try {
      const result = await verifyToolRoundtrip(host.ctx, provider, model.id, 128, 'probe');
      results.push({ ...result, model: model.upstreamModel, thinkingBudget: 64 });
    } catch (error) { failed = true; results.push({ model: model.upstreamModel, level: 'tools', thinkingBudget: 64, ok: false, ...failureFacts(error) }); }
    report.results = results; await saveReport(values.out, { ...report, attempts });
    assert.ok(attempts.reduce((sum, attempt) => sum + (attempt.usage?.outputTokens ?? 0), 0) <= 12000, 'Known output budget exceeded');
  }
  assert.ok(attempts.length <= 40); assert.equal(failed, false);
  assert.ok(attempts.every(attempt => attempt.usage?.outputTokens !== undefined));
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = failureFacts(error); process.exitCode = 1; }
finally {
  await host.close(); report.results = results; report.attempts = attempts; report.requests = attempts.length; report.finishedAt = new Date().toISOString();
  await saveReport(values.out, report); console.log(JSON.stringify({ status: report.status, requests: attempts.length, results: results.map(({ model, level, effort, ok }) => ({ model, level, effort, ok })), report: values.out }));
}
