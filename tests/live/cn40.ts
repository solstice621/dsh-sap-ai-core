import assert from 'node:assert/strict';
import { liveArguments, liveHost, liveAgent, arithmeticTool, sourceFingerprint, saveReport, failureFacts } from './support.js';

let host: Awaited<ReturnType<typeof liveHost>> | undefined;
let output: string | undefined;
const report: Record<string, unknown> = { suite: 'cn40-qwen-short', startedAt: new Date().toISOString(), status: 'running', requestBudget: 12, maxOutputTokensPerRequest: 128, enableThinking: false, results: [] };
const results = report.results as unknown[];
try {
  const args = liveArguments('.local/cn40-live-report.json'); output = args.out;
  report.sourceSha256 = await sourceFingerprint();
  host = await liveHost(args.connection, 12);
  const app = host;
  const run = async (id: string, action: () => Promise<unknown>) => {
    report.currentTest = id;
    const started = performance.now();
    const evidence = await action();
    results.push({ id, status: 'passed', elapsedMs: Math.round(performance.now() - started), evidence });
    report.requests = app.requests; await saveReport(args.out, report);
    process.stdout.write(id + ' passed\n');
  };
  await run('S-L08', async () => {
    const a = await liveAgent(app), b = await liveAgent(app);
    try {
      const values = await Promise.all([a.followup('仅回答：青竹'), b.followup('仅回答：白鹭')]);
      assert.match(values[0]!.text, /青竹/); assert.match(values[1]!.text, /白鹭/);
      assert.doesNotMatch(values[0]!.text, /白鹭/); assert.doesNotMatch(values[1]!.text, /青竹/);
      const stats = app.ctx.sapAiCore.adapter.tokens.stats;
      assert.equal(stats.acquisitions, 1); assert.ok(stats.sharedWaits >= 1);
      return { sessions: 2, acquisitions: stats.acquisitions, sharedWaits: stats.sharedWaits, separatedResponses: true };
    } finally { await a.dispose(); await b.dispose(); }
  });
  await run('S-L01', async () => {
    const value = await app.ctx.sapAiCore.diagnose({ provider: app.provider, model: app.model, level: 'deployment' });
    assert.ok('deployment' in value && value.deployment?.status === 'RUNNING');
    return value;
  });
  await run('S-L02', async () => {
    const agent = await liveAgent(app);
    try {
      await agent.followup('请记住本次对话暗号是“松间明月”。现在只回复“已记住”。');
      const value = await agent.followup('刚才告诉你的暗号是什么？只回答暗号。');
      assert.match(value.text, /松间明月/);
      return { turns: 2, contextRetained: true, finalCharacters: value.text.length, usage: value.usage };
    } finally { await agent.dispose(); }
  });
  await run('S-L03', async () => {
    app.claim();
    return app.ctx.sapAiCore.diagnose({ provider: app.provider, model: app.model, level: 'stream', allowInference: true, maxOutputTokens: 128 });
  });
  await run('S-L04', () => app.ctx.sapAiCore.diagnose({ provider: app.provider, model: app.model, level: 'tools', allowInference: true, maxRequests: 2, maxOutputTokens: 128 }));
  await run('S-L05', async () => {
    let add = 0, multiply = 0;
    const agent = await liveAgent(app, ctx => {
      arithmeticTool(ctx, 'sap_live_add', 'add', () => add++);
      arithmeticTool(ctx, 'sap_live_multiply', 'multiply', () => multiply++);
    });
    try {
      const value = await agent.followup('必须在同一轮同时调用 sap_live_add 和 sap_live_multiply，两个工具的参数都设为 a=12、b=13。收到两个工具结果后，只回答两个结果。');
      assert.equal(add, 1); assert.equal(multiply, 1); assert.equal(value.toolResults, 2);
      assert.match(value.text, /25/); assert.match(value.text, /156/);
      return { toolCalls: value.toolCalls, toolResults: value.toolResults, sameResponseToolCalls: value.parallelCalls, usage: value.usage };
    } finally { await agent.dispose(); }
  });
  await run('S-L06', async () => {
    const agent = await liveAgent(app);
    try {
      const value = await agent.followup('请从一数到一百，每个数字单独一行。', 2);
      assert.ok(value.textDeltas >= 2); assert.equal(value.end, 'aborted'); assert.equal(value.cancelCause, 'user');
      assert.equal(app.attempts.at(-1)!.outcome, 'aborted');
      const next = await agent.followup('仅回答：可以继续'); assert.match(next.text, /可以继续/);
      return { canceledAfterDeltas: value.textDeltas, idleAfterCancel: true, subsequentTurnSucceeded: true };
    } finally { await agent.dispose(); }
  });
  report.status = 'passed'; report.tokenStats = { ...app.ctx.sapAiCore.adapter.tokens.stats };
} catch (error) {
  report.status = 'failed'; report.failure = failureFacts(error); process.exitCode = 1;
  process.stderr.write(JSON.stringify(report.failure) + '\n');
} finally {
  report.finishedAt = new Date().toISOString(); report.requests = host?.requests;
  report.attempts = host?.attempts;
  await host?.close();
  if (output) await saveReport(output, report);
}
