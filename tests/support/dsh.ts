import { Context } from '@deepseek-ai/cordis';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { CredentialKey, CredentialRecord, CredentialRef } from '@deepseek-ai/dsh-credentials';
import SessionStore from '@deepseek-ai/dsh-session';
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection';
import AgentRegistry from '@deepseek-ai/dsh-agent';
import AgentLoop from '@deepseek-ai/dsh-agent-loop';
import Tools from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import * as retry from '@deepseek-ai/dsh-llm-retry';
import * as sap from '../../src/index.js';
import type { Options } from '../../src/config.js';

export class MemoryCredentials extends CredentialProvider {
  readonly values = new Map<string, string>([['TEST_CLIENT_ID', 'synthetic-client'], ['TEST_CLIENT_SECRET', 'synthetic-secret']]);
  private records = new Map<CredentialKey, CredentialRecord>();
  constructor(ctx: Context) { super(ctx); }
  async resolve(ref: CredentialRef) { const value = this.values.get(ref); return value ? { value, source: 'synthetic-memory' } : undefined; }
  async describe(ref: CredentialRef) { return { configured: !!this.values.get(ref), writable: true, source: 'synthetic-memory' }; }
  async set(ref: CredentialRef, value: string) { this.values.set(ref, value); this.notifyUpdated(ref); }
  async unset(ref: CredentialRef) { this.values.delete(ref); this.notifyUpdated(ref); }
  async readRecord(key: CredentialKey) { return this.records.get(key); }
  async describeRecord(key: CredentialKey) { return { configured: this.records.has(key), kind: this.records.get(key)?.kind, writable: true }; }
  async listRecords() { return [...this.records].map(([key, value]) => ({ key, kind: value.kind })); }
  async modifyRecord(key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) { const value = await mutate(this.records.get(key)); if (value) this.records.set(key, value); return this.records.get(key); }
  async deleteRecord(key: CredentialKey) { this.records.delete(key); }
}

export async function harness(options: Options, agents = false, retryFirst = false) {
  const ctx = new Context();
  const fibers = [];
  fibers.push(ctx.plugin(LlmRuntime), ctx.plugin(MemoryCredentials));
  if (agents) {
    fibers.push(ctx.plugin(SessionStore), ctx.plugin(SessionProjectionRegistry), ctx.plugin(AgentRegistry), ctx.plugin(Tools));
    fibers.push(ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false }));
    fibers.push(ctx.plugin(AgentLoop, {}));
  }
  for (const fiber of fibers) await fiber;
  if (agents && retryFirst) await ctx.plugin(retry);
  const plugin = ctx.plugin(sap, options); await plugin;
  if (agents && !retryFirst) await ctx.plugin(retry);
  // Resolve optional injection's dynamically imported public Agent integration.
  if (agents) for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  return { ctx, plugin, async close() { await ctx.fiber.dispose(); } };
}
