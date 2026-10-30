import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import LocalCredentials from '@deepseek-ai/dsh-credentials-local';
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import * as sap from '../index.js';
import { snapshotOf } from '../config.js';
import { SapAiCoreError, safeError } from './errors.js';

export interface HostOptions {
  credentialsFile?: string;
  /** Reads exactly this file; imports values into memory, never into settings or process.env. */
  serviceKeyFile?: string;
  serviceKeyInstance?: string;
  environment?: Readonly<Record<string, string | undefined>>;
  agents?: boolean;
}

export async function readConfigFile(path: string): Promise<unknown> {
  try {
    const bytes = await readFile(resolve(path));
    if (bytes.byteLength > 1024 * 1024) throw new Error();
    return JSON.parse(bytes.toString('utf8'));
  } catch { throw new SapAiCoreError('INVALID_CONFIG', 'config', 'cannot read the specified JSON configuration'); }
}

/** Isolated headless DSH host. Only declared refs are taken from the inherited environment. */
export async function createDiagnosticHost(input: unknown, options: HostOptions = {}) {
  const config = snapshotOf(input).config;
  const values: Record<string, string> = {};
  const environment = options.environment ?? process.env;
  for (const instance of Object.values(config.instances)) for (const ref of Object.values(instance.credentials)) {
    if (environment[ref] !== undefined) values[ref] = environment[ref]!;
  }
  if (options.serviceKeyFile) {
    const instance = options.serviceKeyInstance && config.instances[options.serviceKeyInstance];
    if (!instance) throw new SapAiCoreError('INVALID_CONFIG', 'credentials', 'service key import requires a configured instance ID');
    try {
      const bytes = await readFile(resolve(options.serviceKeyFile));
      if (bytes.byteLength > 128 * 1024) throw new Error();
      const key = JSON.parse(bytes.toString('utf8'));
      if (typeof key.clientid !== 'string' || typeof key.clientsecret !== 'string' || typeof key.url !== 'string' || typeof key.serviceurls?.AI_API_URL !== 'string') throw new Error();
      if (new URL(key.url.replace(/\/$/, '') + '/oauth/token').href !== instance.tokenUrl || new URL(key.serviceurls.AI_API_URL).href.replace(/\/$/, '') !== instance.apiBaseUrl) throw new Error();
      if (key.auth_placement !== undefined && key.auth_placement !== instance.oauth.clientAuthMethod) throw new Error();
      values[instance.credentials.clientIdRef] = key.clientid;
      values[instance.credentials.clientSecretRef] = key.clientsecret;
    } catch { throw new SapAiCoreError('INVALID_CREDENTIAL', 'credentials', 'specified service key is invalid or does not match the selected instance'); }
  } else if (options.serviceKeyInstance) throw new SapAiCoreError('INVALID_CONFIG', 'credentials', 'instance import selection requires a service key file');
  const directory = await mkdtemp(join(tmpdir(), 'dsh-sap-diagnostic-'));
  const ctx = new Context();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { await ctx.fiber.dispose(); } finally { await rm(directory, { recursive: true, force: true }); }
  };
  try {
    ctx.provide('launchEnvironment', createLaunchEnvironmentSnapshot([{ source: 'process', values }]));
    await ctx.plugin(LlmRuntime);
    await ctx.plugin(LocalCredentials, { path: options.credentialsFile ? resolve(options.credentialsFile) : join(directory, 'credentials.yaml'), watch: false });
    if (options.agents) {
      let modules;
      try {
        modules = await Promise.all([
          import('@deepseek-ai/dsh-session'), import('@deepseek-ai/dsh-session-projection'),
          import('@deepseek-ai/dsh-agent'), import('@deepseek-ai/dsh-tools'),
          import('@deepseek-ai/dsh-system-prompt'), import('@deepseek-ai/dsh-agent-loop'),
        ]);
      } catch { throw new SapAiCoreError('DIAGNOSTIC_UNAVAILABLE', 'config', 'install the documented optional DSH Agent peers for tools diagnostics'); }
      const [sessions, projections, agents, tools, prompts, loop] = modules;
      for (const plugin of [sessions.default, projections.default, agents.default, tools.default]) await ctx.plugin(plugin);
      await ctx.plugin(prompts.default, { includeHarnessIdentity: false, includeRuntimeContext: false });
      await ctx.plugin(loop.default, {});
    }
    const plugin = ctx.plugin(sap, structuredClone(config)); await plugin;
    if (options.agents) for (let i = 0; i < 5; i++) await new Promise<void>(done => setImmediate(done));
    return { ctx, plugin, close };
  } catch (error) { await close(); throw safeError(error, 'config'); }
}
