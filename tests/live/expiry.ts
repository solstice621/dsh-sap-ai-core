import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { liveArguments, liveHost, liveAgent, arithmeticTool, sourceFingerprint, saveReport, failureFacts } from './support.js';

let host: Awaited<ReturnType<typeof liveHost>> | undefined;
let output: string | undefined;
const stop = new AbortController();
const cancel = () => stop.abort();
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
const report: Record<string, unknown> = { id: 'S-L07', startedAt: new Date().toISOString(), pid: process.pid, status: 'starting', requestBudget: 4, maxOutputTokensPerRequest: 128, enableThinking: false };
try {
  const args = liveArguments('.local/cn40-expiry-report.json'); output = args.out;
  report.sourceSha256 = await sourceFingerprint();
  host = await liveHost(args.connection, 4);
  const app = host;
  let executions = 0;
  const agent = await liveAgent(app, ctx => arithmeticTool(ctx, 'sap_expiry_multiply', 'multiply', () => executions++));
  stop.signal.addEventListener('abort', () => agent.agent.cancel({ kind: 'user' }), { once: true });
  try {
    const first = await agent.followup('必须调用 sap_expiry_multiply，参数 a=12、b=13。收到工具结果后仅回答结果。');
    assert.equal(executions, 1); assert.equal(first.toolResults, 1); assert.match(first.text, /156/);
    const before = await app.ctx.sapAiCore.adapter.inspect(app.provider, app.model, 'auth', stop.signal);
    assert.ok(before.token);
    // Use the authoritative expires_in lifetime, plus 60s for response/clock rounding.
    const resumeAt = before.token.expiresAt + 60_000;
    report.status = 'waiting-for-natural-expiry'; report.initialToken = before.token;
    report.resumeAt = new Date(resumeAt).toISOString(); report.toolExecutionsBefore = executions;
    report.requests = app.requests;
    process.stdout.write(JSON.stringify({ status: report.status, pid: process.pid, resumeAt: report.resumeAt }) + '\n');
    while (Date.now() < resumeAt) {
      report.heartbeatAt = new Date().toISOString(); report.remainingSeconds = Math.ceil((resumeAt - Date.now()) / 1000);
      await saveReport(args.out, report);
      await delay(Math.min(60_000, resumeAt - Date.now()), undefined, { signal: stop.signal });
    }
    stop.signal.throwIfAborted();
    report.status = 'validating-after-expiry'; await saveReport(args.out, report);
    const afterTurn = await agent.followup('不要再次调用工具。上次工具已经成功计算了什么结果？只回答那个整数。');
    assert.match(afterTurn.text, /156/); assert.equal(executions, 1); assert.equal(afterTurn.toolCalls, 0);
    const after = await app.ctx.sapAiCore.adapter.inspect(app.provider, app.model, 'auth', stop.signal);
    assert.ok(after.token); assert.ok(after.token.generation > before.token.generation);
    assert.ok(Date.now() > before.token.expiresAt); assert.equal(app.ctx.sapAiCore.adapter.tokens.stats.acquisitions, 2);
    report.status = 'passed'; report.finalToken = after.token; report.toolExecutionsAfter = executions;
    report.tokenStats = { ...app.ctx.sapAiCore.adapter.tokens.stats }; report.noToolReplay = true;
  } finally { await agent.dispose(); }
} catch (error) {
  report.status = stop.signal.aborted ? 'aborted' : 'failed'; report.failure = failureFacts(error); process.exitCode = 1;
  process.stderr.write(JSON.stringify(report.failure) + '\n');
} finally {
  report.finishedAt = new Date().toISOString(); report.requests = host?.requests; report.attempts = host?.attempts;
  await host?.close(); if (output) await saveReport(output, report);
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
