import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createConnection } from 'node:net';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import { createDiagnosticHost } from '../../src/diagnostics/host.js';
import { SapAiCoreError, safeError } from '../../src/diagnostics/errors.js';
import type { Options } from '../../src/config.js';
import type { AttemptDiagnostic } from '../../src/adapter.js';

const Connection = z.object({
  serviceKeyFile: z.string().min(1), proxyUrl: z.string().url().optional(), apiBaseUrl: z.string().url(),
  tokenUrl: z.string().url(), clientAuthMethod: z.enum(['body', 'basic']), resourceGroup: z.string(),
  deploymentId: z.string().min(1), model: z.literal('qwen3.6-plus'), apiVersion: z.string().optional(),
}).strict();

export function liveArguments(defaultOutput: string) {
  if (process.env.SAP_AICORE_LIVE !== '1') throw new SapAiCoreError('INFERENCE_OPT_IN_REQUIRED', 'config', 'set SAP_AICORE_LIVE=1 to run the budgeted live test');
  const { values } = parseArgs({ options: { connection: { type: 'string' }, out: { type: 'string', default: defaultOutput } }, allowPositionals: false, strict: true });
  if (!values.connection) throw new SapAiCoreError('INVALID_CONFIG', 'config', 'specify --connection with the authorized connection document');
  return { connection: resolve(values.connection), out: resolve(values.out) };
}

export async function sourceFingerprint() {
  async function files(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
  }
  const paths = [...await files('src'), 'package.json', 'package-lock.json'].sort();
  const hash = createHash('sha256');
  for (const path of paths) { hash.update(path); hash.update(await readFile(path)); }
  return hash.digest('hex');
}

export async function saveReport(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = path + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, path);
}

export function failureFacts(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ASSERTION') return { code: 'TEST_ASSERTION', phase: 'validation', reason: 'live acceptance assertion failed' };
  const safe = safeError(error, 'inference');
  return { code: safe.code, phase: safe.phase, reason: safe.reason, status: safe.failure.status };
}

export async function liveHost(connectionFile: string, maxRequests: number) {
  let connection;
  try { connection = Connection.parse(JSON.parse(await readFile(connectionFile, 'utf8'))); }
  catch { throw new SapAiCoreError('INVALID_CONFIG', 'config', 'invalid explicit live connection document'); }
  if (connection.proxyUrl) {
    const proxy = new URL(connection.proxyUrl);
    await new Promise<void>((yes, no) => {
      const socket = createConnection({ host: proxy.hostname, port: Number(proxy.port || (proxy.protocol === 'https:' ? 443 : 80)) });
      socket.setTimeout(5000);
      socket.once('connect', () => { socket.destroy(); yes(); });
      const fail = () => { socket.destroy(); no(new SapAiCoreError('TRANSPORT', 'config', 'configured proxy is not reachable')); };
      socket.once('error', fail); socket.once('timeout', fail);
    });
  }
  const config: Options = {
    instances: { cn40: {
      apiBaseUrl: connection.apiBaseUrl, tokenUrl: connection.tokenUrl,
      credentials: { clientIdRef: 'SAP_AICORE_CLIENT_ID', clientSecretRef: 'SAP_AICORE_CLIENT_SECRET' },
      oauth: { clientAuthMethod: connection.clientAuthMethod },
      network: { proxyMode: connection.proxyUrl ? 'url' : 'environment', ...(connection.proxyUrl ? { proxyUrl: connection.proxyUrl } : {}), requestTimeoutMs: 90_000, streamIdleTimeoutMs: 30_000 },
    } },
    providers: { 'sap-ai-core-cn40': {
      instance: 'cn40', resourceGroup: connection.resourceGroup, protocol: 'openai-chat-completions', apiVersion: connection.apiVersion,
      retryPolicy: { maxRetries: 0 },
      models: [{
        id: 'qwen-cn40', upstreamModel: connection.model, deployment: { id: connection.deploymentId },
        capabilities: { streaming: true, tools: true, parallelToolCalls: true, evidence: { status: 'experimental', reference: 'budgeted live acceptance probe; see generated report' } },
        compatibility: { systemRole: 'system', developerRole: 'system', maxTokensField: 'max_tokens', includeUsage: true, parameters: { enable_thinking: false } },
        // This is the tested local request ceiling, not a claimed provider context limit.
        maxOutputTokens: 256, defaultMaxTokens: 128,
      }],
    } },
  };
  const host = await createDiagnosticHost(config, { serviceKeyFile: connection.serviceKeyFile, serviceKeyInstance: 'cn40', environment: {}, agents: true });
  const attempts: AttemptDiagnostic[] = [];
  host.ctx.on('sap-ai-core/attempt', event => attempts.push(event));
  let requests = 0, exceeded = false;
  const claim = () => {
    if (requests >= maxRequests) { exceeded = true; throw new SapAiCoreError('DIAGNOSTIC_BUDGET', 'inference', 'live request budget exhausted'); }
    requests++;
  };
  host.ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (frame.type !== 'start') return;
    try { claim(); } catch { agent.cancel({ kind: 'hook', reason: 'live request budget exhausted' }); }
  });
  return { ...host, config, provider: 'sap-ai-core-cn40', model: 'qwen-cn40', attempts, claim,
    get requests() { return requests; }, assertBudget() { assert.equal(exceeded, false, 'live request budget'); },
  };
}
export type LiveHost = Awaited<ReturnType<typeof liveHost>>;

export interface TurnStats {
  text: string;
  textDeltas: number;
  toolCalls: number;
  parallelCalls: number;
  toolResults: number;
  end?: string;
  cancelCause?: string;
  usage: TokenUsage[];
}

export async function liveAgent(host: LiveHost, setup?: (ctx: Context) => void) {
  let current: TurnStats = { text: '', textDeltas: 0, toolCalls: 0, parallelCalls: 0, toolResults: 0, usage: [] };
  let cancelAt: number | undefined;
  const handle = await host.ctx.agents.create({
    sessionId: SessionId(randomUUID()), agentOptions: { provider: host.provider, model: host.model, maxTokens: 128 },
    setup(ctx) {
      ctx.tools.restrict({ allow: [] });
      ctx.on('agent/assistant-stream', ({ agent, frame }) => {
        if (frame.type !== 'chunk') return;
        if (frame.chunk.type === 'text-delta' && ++current.textDeltas === cancelAt) agent.cancel({ kind: 'user' });
        if (frame.chunk.type === 'usage') current.usage.push(frame.chunk.usage);
      });
      ctx.on('session/event', (_session, event) => {
        if (event.type === 'assistant/message' && !event.data.interrupted) {
          current.text += event.data.message.content.filter(block => block.type === 'text').map(block => block.text).join('');
          const calls = event.data.message.content.filter(block => block.type === 'tool-call').length;
          current.toolCalls += calls;
          if (calls > 1) current.parallelCalls += calls;
        }
        if (event.type === 'tool/result' && !event.data.message.isError) current.toolResults++;
        if (event.type === 'turn/end') {
          current.end = event.data.reason.kind;
          if (event.data.reason.kind === 'aborted') current.cancelCause = event.data.reason.reason.kind;
        }
      });
      setup?.(ctx);
    },
  });
  return { ...handle,
    async followup(text: string, cancelAfterDeltas?: number): Promise<TurnStats> {
      current = { text: '', textDeltas: 0, toolCalls: 0, parallelCalls: 0, toolResults: 0, usage: [] }; cancelAt = cancelAfterDeltas;
      const timer = setTimeout(() => handle.agent.cancel({ kind: 'hook', reason: 'live turn deadline' }), 100_000);
      try {
        handle.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text }] }));
        await handle.agent.whenIdle(); host.assertBudget();
        assert.notEqual(current.end, 'error', 'live turn failed');
        return current;
      } finally { clearTimeout(timer); }
    },
  };
}

export function arithmeticTool(ctx: Context, name: string, operation: 'add' | 'multiply', executed: () => void) {
  ctx.tools.register({
    name, description: operation === 'add' ? 'Add two small integers.' : 'Multiply two small integers.',
    parameters: { type: 'object', properties: { a: { type: 'integer', minimum: 0, maximum: 100 }, b: { type: 'integer', minimum: 0, maximum: 100 } }, required: ['a', 'b'], additionalProperties: false },
    output: { schema: { type: 'integer' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args) { executed(); const { a, b } = args as { a: number; b: number }; assert.equal(a, 12); assert.equal(b, 13); return operation === 'add' ? a + b : a * b; },
  });
}
