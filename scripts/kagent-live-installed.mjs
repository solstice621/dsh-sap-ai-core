// Runs only from an isolated installation containing the two versioned tgz files.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { createParser } from 'eventsource-parser';
import LocalCredentials from '@deepseek-ai/dsh-credentials-local';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { createRuntime } from 'dsh-kagent/runtime';
import * as Kagent from 'dsh-kagent';
import * as Sap from 'dsh-sap-ai-core';

if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Explicit live opt-in is required.');
const connection = JSON.parse(await readFile(process.argv[2], 'utf8'));
const secret = JSON.parse(await readFile(connection.serviceKeyFile, 'utf8'));
assert.equal(new URL(secret.serviceurls.AI_API_URL).href.replace(/\/$/, ''), connection.apiBaseUrl);
assert.equal(new URL(secret.url.replace(/\/$/, '') + '/oauth/token').href, connection.tokenUrl);
assert.equal(connection.model, 'qwen3.6-plus');
const stateRoot = join(process.cwd(), 'runtime-state'); await mkdir(stateRoot, { recursive: true });
const tokenEnv = 'DSH_KAGENT_SAP_LIVE_TOKEN';
process.env[tokenEnv] = randomBytes(32).toString('hex');
let ctx;
const report = { scope: 'installed BYO HTTP bridge plus real cn40; platform UI/cluster not covered', status: 'running', maxRequests: 8, maxOutputTokensPerRequest: 128, requests: 0, toolExecutions: 0, attempts: [], results: [] };
const config = {
  instances: { cn40: {
    apiBaseUrl: connection.apiBaseUrl, tokenUrl: connection.tokenUrl,
    credentials: { clientIdRef: 'SAP_AICORE_CLIENT_ID', clientSecretRef: 'SAP_AICORE_CLIENT_SECRET' },
    oauth: { clientAuthMethod: connection.clientAuthMethod },
    network: { proxyMode: connection.proxyUrl ? 'url' : 'environment', ...(connection.proxyUrl ? { proxyUrl: connection.proxyUrl } : {}), requestTimeoutMs: 90000 },
  } },
  providers: { 'sap-joint': { instance: 'cn40', resourceGroup: connection.resourceGroup, protocol: 'openai-chat-completions', apiVersion: connection.apiVersion, retryPolicy: { maxRetries: 0 }, models: [{
    id: 'qwen-joint', upstreamModel: connection.model, deployment: { id: connection.deploymentId },
    capabilities: { streaming: true, tools: true, parallelToolCalls: true, evidence: { status: 'verified', reference: 'cn40 short acceptance 2026-10-31' } },
    compatibility: { systemRole: 'system', developerRole: 'system', maxTokensField: 'max_tokens', includeUsage: true, parameters: { enable_thinking: false } },
    maxOutputTokens: 128, defaultMaxTokens: 128,
  }] } },
};
try {
  ctx = await createRuntime({ stateRoot });
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values: { SAP_AICORE_CLIENT_ID: secret.clientid, SAP_AICORE_CLIENT_SECRET: secret.clientsecret } }]));
  await ctx.plugin(LocalCredentials, { path: join(stateRoot, 'empty-credentials.yaml'), watch: false });
  await ctx.plugin(Sap, config);
  ctx.on('sap-ai-core/attempt', event => report.attempts.push(event));
  ctx.on('agent/request', async (_payload, next) => ({ ...await next(), maxTokens: 128 }));
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (frame.type === 'start' && ++report.requests > report.maxRequests) agent.cancel({ kind: 'hook', reason: 'joint live budget exhausted' });
  });
  // The only authorized side effect in this synthetic test is a small file in its temp workspace.
  ctx.tools.guard(exec => {
    if (exec.name !== 'write') return 'Only the controlled write is enabled in this diagnostic.';
    const args = exec.arguments;
    const path = args.path ?? args.file_path;
    if (path !== 'joint-proof.txt' || args.content !== 'CN40_OK') return 'Unexpected diagnostic file or contents.';
    return undefined;
  });
  ctx.on('tools/result', (_exec, result) => { if (!result.isError) report.toolExecutions++; });
  await ctx.plugin(Kagent, { stateRoot, server: { host: '127.0.0.1', port: 0 }, identity: { principalId: 'sap-joint-diagnostic', tokenEnv }, agent: { preset: 'coding', provider: 'sap-joint', model: 'qwen-joint' } });
  const origin = 'http://127.0.0.1:' + ctx.kagent.port;
  const headers = { authorization: 'Bearer ' + process.env[tokenEnv], 'content-type': 'application/json' };
  const rpc = async (method, params) => {
    const response = await fetch(origin, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }), signal: AbortSignal.timeout(100000) });
    assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.error, undefined); return data.result;
  };
  const message = (contextId, text) => ({ kind: 'message', role: 'user', contextId, messageId: randomUUID(), parts: [{ kind: 'text', text }] });
  const exists = async path => { try { await access(path); return true; } catch { return false; } };
  const decide = async (task, approved) => {
    const part = task.status.message.parts.find(part => part.data?.name === 'adk_request_confirmation');
    assert.ok(part); const request = part.data;
    assert.equal(request.args.originalFunctionCall.name, 'write');
    assert.ok(request.id && request.args.originalFunctionCall.id);
    return rpc('message/send', { message: { ...message(task.contextId, ''), taskId: task.id, parts: [{ kind: 'data', data: { decision_type: approved ? 'approve' : 'reject', request_id: request.id, call_id: request.args.originalFunctionCall.id } }] } });
  };
  const prompt = '仅使用 write 工具，file_path 必须为 joint-proof.txt，content 必须为 CN40_OK，不要换行。不要使用其它工具。写入若被拒绝，不要重试，只回答“已拒绝”；成功则只回答“已完成”。';
  const tasks = [];
  for (const approved of [true, false]) {
    report.current = approved ? 'approve' : 'reject';
    const context = approved ? 'sap-joint-approved' : 'sap-joint-denied';
    const waiting = await rpc('message/send', { message: message(context, prompt) });
    assert.equal(waiting.status.state, 'input-required');
    const path = join(ctx.kagent.files.path(context, 'workspaces'), 'joint-proof.txt');
    assert.equal(await exists(path), false);
    const before = report.toolExecutions;
    const completed = await decide(waiting, approved); assert.equal(completed.status.state, 'completed');
    if (approved) { assert.equal(await readFile(path, 'utf8'), 'CN40_OK'); assert.equal(report.toolExecutions, before + 1); }
    else { assert.equal(await exists(path), false); assert.equal(report.toolExecutions, before); }
    const task = await rpc('tasks/get', { id: completed.id, historyLength: 100 });
    const parts = (task.history ?? []).flatMap(message => message.parts ?? []);
    const calls = parts.filter(part => part.metadata?.kagent_type === 'function_call' && part.data?.name === 'write');
    const returns = parts.filter(part => part.metadata?.kagent_type === 'function_response');
    assert.ok(calls.length >= 1); assert.ok(returns.some(part => part.data?.id === calls[0].data.id));
    report.results.push({ test: approved ? 'approved-write' : 'rejected-write', passed: true, confirmationBound: true, pairedToolResult: true, toolExecuted: approved });
    tasks.push(completed);
  }
  report.current = 'continuation';
  const continued = await rpc('message/send', { message: message(tasks[0].contextId, '不要调用工具。刚才写入的文件叫什么名字？只回答文件名。') });
  assert.equal(continued.status.state, 'completed'); assert.notEqual(continued.id, tasks[0].id);
  assert.match(continued.artifacts.flatMap(value => value.parts).map(part => part.text ?? '').join(''), /joint-proof.txt/);
  report.results.push({ test: 'same-context-new-task', passed: true });
  report.current = 'cancel';
  const response = await fetch(origin, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method: 'message/stream', params: { message: message('sap-joint-cancel', '不要调用任何工具。请写一篇很长的中文童话，至少两千字。') } }), signal: AbortSignal.timeout(100000) });
  assert.equal(response.status, 200); assert.ok(response.body);
  const pending = [];
  const parser = createParser({ onEvent: event => { if (event.data !== '[DONE]') pending.push(JSON.parse(event.data)); } });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let canceled = false;
  try {
    while (!canceled) {
      const chunk = await reader.read(); if (chunk.done) break;
      parser.feed(decoder.decode(chunk.value, { stream: true }));
      for (const event of pending.splice(0)) {
        const value = event.result;
        if (value?.kind !== 'artifact-update' || !value.artifact?.parts?.some(part => part.text)) continue;
        const canceledTask = await rpc('tasks/cancel', { id: value.taskId });
        assert.equal(canceledTask.status.state, 'canceled'); canceled = true; break;
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  assert.equal(canceled, true); assert.equal(report.attempts.at(-1).outcome, 'aborted');
  const afterCancel = await rpc('message/send', { message: message('sap-joint-after-cancel', '不要调用工具。只回答：可以继续。') });
  assert.equal(afterCancel.status.state, 'completed');
  report.results.push({ test: 'a2a-cancel-to-sap-http', passed: true, subsequentTaskSucceeded: true });
  assert.ok(report.requests <= report.maxRequests); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { code: typeof error?.code === 'string' ? error.code : 'JOINT_VALIDATION_FAILED', phase: error?.phase, reason: error?.reason };
  process.exitCode = 1;
} finally {
  await ctx?.fiber.dispose(); delete process.env[tokenEnv];
  await writeFile('joint-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, current: report.current, requests: report.requests, results: report.results, failure: report.failure }));
}
