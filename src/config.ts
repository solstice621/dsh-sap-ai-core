import { z } from 'zod';
import { SapAiCoreError } from './diagnostics/errors.js';

const id = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const ref = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const duration = z.number().int().min(1).max(2_147_483_647);
const nonempty = z.string().min(1).max(1024);
const scalar = z.union([z.string(), z.number().finite(), z.boolean()]);

export const NetworkSchema = z.object({
  proxyMode: z.enum(['environment', 'direct', 'url']).default('environment'),
  proxyUrl: nonempty.optional(),
  caFile: nonempty.optional(),
  connectTimeoutMs: duration.default(10_000),
  authTimeoutMs: duration.default(20_000),
  requestTimeoutMs: duration.default(180_000),
  streamIdleTimeoutMs: duration.default(30_000),
}).strict().default({
  proxyMode: 'environment', connectTimeoutMs: 10_000, authTimeoutMs: 20_000,
  requestTimeoutMs: 180_000, streamIdleTimeoutMs: 30_000,
});

const InstanceSchema = z.object({
  apiBaseUrl: nonempty,
  tokenUrl: nonempty,
  credentials: z.object({ clientIdRef: ref, clientSecretRef: ref }).strict(),
  oauth: z.object({
    clientAuthMethod: z.enum(['body', 'basic']),
    scope: nonempty.optional(),
    audience: nonempty.optional(),
    refreshSkewMs: z.number().int().min(0).max(300_000).default(30_000),
    refreshJitterRatio: z.number().min(0).max(0.5).default(0.1),
  }).strict(),
  network: NetworkSchema,
  allowedDeploymentOrigins: z.array(nonempty).default([]),
  allowInsecureLocalhost: z.boolean().default(false),
}).strict();

const SelectorSchema = z.object({
  scenario: nonempty, model: nonempty, version: nonempty.optional(),
}).strict();
const DeploymentSchema = z.union([
  z.object({ id: z.string().min(1).max(256) }).strict(),
  z.object({
    selector: SelectorSchema,
    cacheTtlMs: z.number().int().min(0).max(300_000).default(30_000),
    maxPages: z.number().int().min(1).max(100).default(10),
    pageSize: z.number().int().min(1).max(1000).default(100),
  }).strict(),
]);

const CapabilitiesSchema = z.object({
  streaming: z.boolean().default(false),
  tools: z.boolean().default(false),
  parallelToolCalls: z.boolean().default(false),
  temperature: z.boolean().default(false),
  stop: z.boolean().default(false),
  reasoningContent: z.boolean().default(false),
  // Evidence belongs to this exact configured route/model, never a global model-name heuristic.
  evidence: z.object({ status: z.enum(['verified', 'experimental']), reference: nonempty }).strict(),
}).strict();

const CompatibilitySchema = z.object({
  systemRole: z.enum(['system', 'developer']).default('system'),
  developerRole: z.enum(['developer', 'system', 'reject']).default('reject'),
  maxTokensField: z.enum(['max_tokens', 'max_completion_tokens', 'unsupported']).default('unsupported'),
  includeUsage: z.boolean().default(false),
  reasoningField: z.enum(['reasoning_content', 'reasoning']).default('reasoning_content'),
  replayReasoning: z.boolean().default(false),
  // Explicitly verified vendor parameters only; identity/routing parameters are forbidden.
  parameters: z.record(z.string(), scalar).default({}),
  reasoningEfforts: z.record(id, z.object({
    name: nonempty, parameters: z.record(z.string(), scalar),
  }).strict()).default({}),
  defaultReasoningEffort: id.optional(),
}).strict().default({
  systemRole: 'system', developerRole: 'reject', maxTokensField: 'unsupported',
  includeUsage: false, reasoningField: 'reasoning_content', replayReasoning: false,
  parameters: {}, reasoningEfforts: {},
});

const ModelSchema = z.object({
  id, name: nonempty.optional(), upstreamModel: nonempty, deployment: DeploymentSchema,
  mode: z.enum(['streaming', 'buffered']).default('streaming'),
  capabilities: CapabilitiesSchema, compatibility: CompatibilitySchema,
  contextWindow: z.number().int().positive().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  defaultMaxTokens: z.number().int().positive().optional(),
}).strict();

const RetrySchema = z.object({
  maxRetries: z.number().int().min(0).max(3).default(3),
  initialDelayMs: duration.default(1000),
  maxDelayMs: duration.default(30_000),
  jitterRatio: z.number().min(0).max(1).default(0.2),
}).strict().default({ maxRetries: 3, initialDelayMs: 1000, maxDelayMs: 30_000, jitterRatio: 0.2 });

const ProviderSchema = z.object({
  instance: id, displayName: nonempty.optional(), resourceGroup: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  protocol: z.literal('openai-chat-completions'), apiVersion: nonempty.optional(),
  inferencePath: nonempty.default('/v2/inference/deployments/{deploymentId}'),
  headers: z.record(z.string(), z.string()).default({}),
  models: z.array(ModelSchema).min(1), retryPolicy: RetrySchema,
  authRecovery: z.boolean().default(true),
}).strict();

export const ConfigSchema = z.object({
  instances: z.record(id, InstanceSchema), providers: z.record(id, ProviderSchema),
}).strict();

export type Options = z.input<typeof ConfigSchema>;
export type ResolvedConfig = z.output<typeof ConfigSchema>;
export type Instance = ResolvedConfig['instances'][string];
export type ProviderRoute = ResolvedConfig['providers'][string];
export type LogicalModel = ProviderRoute['models'][number];
export type Network = Instance['network'];
export interface Snapshot { readonly generation: number; readonly config: ResolvedConfig }
export interface ModelRoute {
  readonly snapshot: Snapshot; readonly providerId: string; readonly instanceId: string;
  readonly instance: Instance; readonly provider: ProviderRoute; readonly model: LogicalModel;
}

const reservedHeaders = new Set([
  'authorization', 'proxy-authorization', 'ai-resource-group', 'content-type', 'accept',
  'host', 'content-length', 'transfer-encoding', 'connection', 'cookie', 'set-cookie',
  'x-request-id', 'http-referer', 'x-title', 'openai-organization', 'openai-project',
]);
const reservedParameters = new Set([
  'model', 'messages', 'tools', 'tool_choice', 'functions', 'function_call', 'stream',
  'stream_options', 'max_tokens', 'max_completion_tokens', 'temperature', 'stop',
  'n', 'response_format', 'user', 'headers', 'url', 'base_url', 'api_key', 'parallel_tool_calls',
]);

function invalid(reason: string): never { throw new SapAiCoreError('INVALID_CONFIG', 'config', reason); }

export function validateUrl(value: string, allowLocal = false, originOnly = false): URL {
  let url: URL;
  try { url = new URL(value); } catch { return invalid('invalid endpoint URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocal && local && url.protocol === 'http:')) invalid('HTTPS is required (HTTP requires explicit loopback opt-in)');
  if (url.username || url.password || url.search || url.hash) invalid('endpoint credentials, query, and fragment are forbidden');
  if (originOnly && url.pathname !== '/') invalid('deployment allowlist entries must be origins');
  if (/\\|[\u0000-\u0020]/.test(value)) invalid('invalid characters in endpoint URL');
  return url;
}

export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}

export function snapshotOf(input: unknown, generation = 1): Snapshot {
  const result = ConfigSchema.safeParse(input);
  if (!result.success) invalid('schema validation failed; check field types, required fields, and unknown options');
  const config = result.data;
  for (const instance of Object.values(config.instances)) {
    instance.apiBaseUrl = validateUrl(instance.apiBaseUrl, instance.allowInsecureLocalhost).href.replace(/\/$/, '');
    instance.tokenUrl = validateUrl(instance.tokenUrl, instance.allowInsecureLocalhost).href;
    instance.allowedDeploymentOrigins = instance.allowedDeploymentOrigins.map(value => validateUrl(value, instance.allowInsecureLocalhost, true).origin);
    const net = instance.network;
    if ((net.proxyMode === 'url') !== (net.proxyUrl !== undefined)) invalid('proxyUrl is required only for proxyMode=url');
    if (net.proxyUrl) {
      let proxy: URL;
      try { proxy = new URL(net.proxyUrl); } catch { return invalid('invalid proxy URL'); }
      if (!['http:', 'https:'].includes(proxy.protocol) || proxy.username || proxy.password || proxy.search || proxy.hash || proxy.pathname !== '/') invalid('proxy must be an HTTP(S) origin without credentials');
    }
  }
  for (const provider of Object.values(config.providers)) {
    if (!Object.hasOwn(config.instances, provider.instance)) invalid('provider refers to an unknown instance');
    const path = provider.inferencePath;
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\s]/.test(path) || path.includes('/chat/completions') || path.split('/').some(p => p === '.' || p === '..') || path.split('{deploymentId}').length !== 2 || /[{}]/.test(path.replace('{deploymentId}', ''))) invalid('invalid deployment path template');
    const headers = new Set<string>();
    for (const [key, value] of Object.entries(provider.headers)) {
      const lower = key.toLowerCase();
      if (reservedHeaders.has(lower) || headers.has(lower) || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(key) || /[^\x20-\x7e]/.test(value)) invalid('invalid, duplicate, or reserved custom header');
      headers.add(lower);
    }
    if (provider.retryPolicy.initialDelayMs > provider.retryPolicy.maxDelayMs) invalid('retry initial delay exceeds maximum');
    const models = new Set<string>();
    for (const model of provider.models) {
      if (models.has(model.id)) invalid('duplicate logical model ID');
      models.add(model.id);
      if ('id' in model.deployment && (/^[.]{1,2}$/.test(model.deployment.id) || /[\u0000-\u001f\u007f]/.test(model.deployment.id))) invalid('invalid Deployment ID');
      if ('selector' in model.deployment && model.deployment.selector.model !== model.upstreamModel) invalid('selector model must equal upstreamModel');
      if (model.mode === 'streaming' && !model.capabilities.streaming) invalid('streaming mode requires an explicit capability declaration');
      if (model.capabilities.parallelToolCalls && !model.capabilities.tools) invalid('parallel tools require tools capability');
      if (model.compatibility.replayReasoning && !model.capabilities.reasoningContent) invalid('reasoning replay requires reasoning content capability');
      if (model.defaultMaxTokens !== undefined && (model.compatibility.maxTokensField === 'unsupported' || model.maxOutputTokens === undefined || model.defaultMaxTokens > model.maxOutputTokens)) invalid('defaultMaxTokens requires a validated limit and supported field');
      if (model.compatibility.defaultReasoningEffort && !Object.hasOwn(model.compatibility.reasoningEfforts, model.compatibility.defaultReasoningEffort)) invalid('unknown default reasoning effort');
      for (const params of [model.compatibility.parameters, ...Object.values(model.compatibility.reasoningEfforts).map(e => e.parameters)]) {
        for (const key of Object.keys(params)) {
          if (reservedParameters.has(key) || !/^[a-z][a-z0-9_]*$/.test(key)) invalid('reserved or invalid compatibility parameter');
        }
      }
    }
  }
  return freeze({ generation, config });
}

export function routeOf(snapshot: Snapshot, providerId: string, modelId: string): ModelRoute {
  const provider = Object.hasOwn(snapshot.config.providers, providerId) ? snapshot.config.providers[providerId] : undefined;
  const model = provider?.models.find(m => m.id === modelId);
  const instance = provider && snapshot.config.instances[provider.instance];
  if (!provider || !model || !instance) throw new SapAiCoreError('NO_MODEL', 'config', 'unknown provider or logical model');
  return { snapshot, providerId, instanceId: provider.instance, provider, model, instance };
}
