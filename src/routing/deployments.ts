import { randomUUID } from 'node:crypto';
import type { ModelRoute } from '../config.js';
import { SapAiCoreError, checkAbort } from '../diagnostics/errors.js';
import type { TokenLease } from '../auth/token-manager.js';
import { HttpClient, readJson } from '../transport/http.js';
import { inferenceUrl, providerHeaders } from './endpoints.js';

export interface DeploymentRoute { readonly id: string; readonly url: URL }
interface Cached { route: DeploymentRoute; expiresAt: number }
type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}

/** Model metadata comes from the validated foundation-models response, never configuration names. */
export function deploymentModel(value: unknown): { name?: string; version?: string } {
  const resources = record(record(record(value).details).resources);
  const shapes = ['backendDetails', 'backend_details'].map(key => record(record(resources[key]).model));
  const names = shapes.map(v => v.name).filter((v): v is string => typeof v === 'string');
  const versions = shapes.map(v => v.version).filter((v): v is string => typeof v === 'string');
  if (new Set(names).size > 1 || new Set(versions).size > 1) throw new SapAiCoreError('ROUTING', 'deployment', 'conflicting deployment model metadata');
  return { name: names[0], version: versions[0] };
}

export class DeploymentResolver {
  private readonly cache = new Map<string, Cached>();
  constructor(private readonly clock = Date.now) {}

  private key(route: ModelRoute, lease: TokenLease): string {
    return JSON.stringify([route.snapshot.generation, route.instanceId, route.providerId, route.provider.resourceGroup, route.model.id, route.model.deployment, lease.key]);
  }

  invalidate(route: ModelRoute, lease: TokenLease): void { this.cache.delete(this.key(route, lease)); }
  clear(): void { this.cache.clear(); }

  async resolve(route: ModelRoute, lease: TokenLease, client: HttpClient, signal: AbortSignal, force = false): Promise<DeploymentRoute> {
    checkAbort(signal, 'deployment');
    const deployment = route.model.deployment;
    if ('id' in deployment) return { id: deployment.id, url: inferenceUrl(route, deployment.id) };
    const key = this.key(route, lease);
    const cached = this.cache.get(key);
    if (!force && cached && cached.expiresAt > this.clock()) return { id: cached.route.id, url: new URL(cached.route.url) };
    const candidates = new Map<string, RecordValue>();
    let skip = 0, complete = false;
    const seen = new Set<string>();
    for (let page = 0; page < deployment.maxPages; page++) {
      const url = new URL(route.instance.apiBaseUrl + '/v2/lm/deployments');
      url.searchParams.set('$top', String(deployment.pageSize)); url.searchParams.set('$skip', String(skip));
      const requestId = randomUUID();
      const reply = await client.request(url, { phase: 'deployment', headers: providerHeaders(route, lease.value, requestId), signal, requestId });
      const data = record(await readJson(reply, 'deployment'));
      if (!Array.isArray(data.resources)) throw new SapAiCoreError('ROUTING', 'deployment', 'invalid deployment listing');
      const total = data.count;
      if (total !== undefined && (!Number.isSafeInteger(total) || (total as number) < 0)) throw new SapAiCoreError('ROUTING', 'deployment', 'invalid deployment count');
      for (const raw of data.resources) {
        const item = record(raw);
        if (typeof item.id !== 'string' || !item.id.length || item.id.length > 256 || /^[.]{1,2}$/.test(item.id)) throw new SapAiCoreError('ROUTING', 'deployment', 'invalid deployment identifier');
        if (seen.has(item.id)) throw new SapAiCoreError('ROUTING', 'deployment', 'pagination returned repeated deployments');
        seen.add(item.id);
        if (item.status !== 'RUNNING' || item.scenarioId !== deployment.selector.scenario) continue;
        const model = deploymentModel(item);
        if (model.name !== deployment.selector.model || (deployment.selector.version !== undefined && model.version !== deployment.selector.version)) continue;
        candidates.set(item.id, item);
      }
      skip += data.resources.length;
      if (total !== undefined ? skip >= (total as number) : data.resources.length < deployment.pageSize) { complete = true; break; }
      if (!data.resources.length) break;
    }
    if (!complete) throw new SapAiCoreError('ROUTING', 'deployment', 'incomplete deployment listing; cannot prove uniqueness');
    if (candidates.size === 0) throw new SapAiCoreError('DEPLOYMENT_NOT_READY', 'deployment', 'no matching RUNNING deployment');
    if (candidates.size !== 1) throw new SapAiCoreError('AMBIGUOUS_DEPLOYMENT', 'deployment', 'multiple matching RUNNING deployments; configure an explicit ID');
    const [id, value] = candidates.entries().next().value!;
    if (typeof value.deploymentUrl !== 'string' || !value.deploymentUrl) throw new SapAiCoreError('DEPLOYMENT_NOT_READY', 'deployment', 'deployment has no inference URL');
    const selected = { id, url: inferenceUrl(route, id, value.deploymentUrl) };
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { route: selected, expiresAt: this.clock() + deployment.cacheTtlMs });
    return { id, url: new URL(selected.url) };
  }

  async checkExplicit(route: ModelRoute, lease: TokenLease, client: HttpClient, signal: AbortSignal): Promise<void> {
    if (!('id' in route.model.deployment)) { await this.resolve(route, lease, client, signal, true); return; }
    const requestId = randomUUID();
    const url = new URL(route.instance.apiBaseUrl + '/v2/lm/deployments/' + encodeURIComponent(route.model.deployment.id));
    const reply = await client.request(url, { phase: 'deployment', headers: providerHeaders(route, lease.value, requestId), signal, requestId });
    const deployment = record(await readJson(reply, 'deployment'));
    if (deployment.id !== route.model.deployment.id || deployment.status !== 'RUNNING') throw new SapAiCoreError('DEPLOYMENT_NOT_READY', 'deployment', 'explicit deployment is not RUNNING');
  }
}
