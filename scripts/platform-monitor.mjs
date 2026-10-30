// Synthetic platform acceptance only. Loaded through the installed DSH public plugin API.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';

export const name = 'sap-platform-acceptance';
export const inject = ['tools', 'llm'];

export async function apply(ctx, config) {
  if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Platform acceptance requires explicit live opt-in.');
  if (!Number.isSafeInteger(config.maxRequests) || config.maxRequests < 1 || config.maxRequests > 12) throw new Error('Invalid platform request budget.');
  if (!Array.isArray(config.credentialRefs) || config.credentialRefs.length !== 2) throw new Error('Two explicit credential references are required.');
  const values = {};
  for (const ref of config.credentialRefs) {
    if (typeof ref !== 'string' || !process.env[ref]) throw new Error('Missing platform credential reference.');
    values[ref] = process.env[ref];
  }
  ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values }]));
  const output = '/var/lib/dsh/sap-acceptance.json';
  const report = { startedAt: new Date().toISOString(), requestBudget: config.maxRequests, maxOutputTokensPerRequest: 128, requests: 0, deniedAttempts: 0, toolExecutions: 0, attempts: [] };
  try {
    const previous = JSON.parse(await readFile(output, 'utf8'));
    if (previous.requestBudget !== config.maxRequests || previous.maxOutputTokensPerRequest !== 128 || !Number.isSafeInteger(previous.requests) || previous.requests < 0 || previous.requests > config.maxRequests || !Array.isArray(previous.attempts)) throw new Error('Invalid persisted acceptance budget.');
    for (const field of ['startedAt','requests','deniedAttempts','toolExecutions','attempts']) report[field] = previous[field];
    report.restarts = (previous.restarts ?? 0) + 1;
    report.lastStartedAt = new Date().toISOString();
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot safely restore the persisted platform acceptance budget.');
  }
  let pending = Promise.resolve();
  const persist = () => {
    const bytes = JSON.stringify({ ...report, updatedAt: new Date().toISOString() }, null, 2) + String.fromCharCode(10);
    pending = pending.then(async () => {
      await writeFile(output + '.tmp', bytes, { mode: 0o600 });
      await rename(output + '.tmp', output);
    }).catch(() => { ctx.logger.error('Unable to save the sanitized platform acceptance report.'); });
    return pending;
  };
  await mkdir(dirname(output), { recursive: true });
  await persist();
  ctx.on('agent/request', async (_payload, next) => ({ ...await next(), maxTokens: 128 }));
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (frame.type !== 'start') return;
    if (report.requests >= config.maxRequests) {
      report.deniedAttempts++;
      agent.cancel({ kind: 'hook', reason: 'platform acceptance request budget exhausted' });
    } else report.requests++;
    void persist();
  });
  ctx.on('sap-ai-core/attempt', event => { report.attempts.push(event); void persist(); });
  ctx.tools.guard(exec => {
    if (exec.name !== 'write') return 'Only the controlled platform acceptance write is enabled.';
    const args = exec.arguments;
    if (!args || (args.path ?? args.file_path) !== 'sap-cn40-proof.txt' || args.content !== 'CN40_OK') return 'Unexpected acceptance file or contents.';
    return undefined;
  });
  ctx.on('tools/result', (_exec, result) => { if (!result.isError) report.toolExecutions++; void persist(); });
  ctx.effect(() => () => persist());
}
