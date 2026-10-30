import { randomUUID } from 'node:crypto';
import { SapAiCoreError, checkAbort } from '../diagnostics/errors.js';
import { HttpClient, readJson } from '../transport/http.js';
import { inferenceUrl, providerHeaders } from './endpoints.js';
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
/** Model metadata comes from the validated foundation-models response, never configuration names. */
export function deploymentModel(value) {
    const resources = record(record(record(value).details).resources);
    const shapes = ['backendDetails', 'backend_details'].map(key => record(record(resources[key]).model));
    const names = shapes.map(v => v.name).filter((v) => typeof v === 'string');
    const versions = shapes.map(v => v.version).filter((v) => typeof v === 'string');
    if (new Set(names).size > 1 || new Set(versions).size > 1)
        throw new SapAiCoreError('ROUTING', 'deployment', 'conflicting deployment model metadata');
    return { name: names[0], version: versions[0] };
}
export class DeploymentResolver {
    clock;
    cache = new Map();
    constructor(clock = Date.now) {
        this.clock = clock;
    }
    key(route, lease) {
        return JSON.stringify([route.snapshot.generation, route.instanceId, route.providerId, route.provider.resourceGroup, route.model.id, route.model.deployment, lease.key]);
    }
    invalidate(route, lease) { this.cache.delete(this.key(route, lease)); }
    clear() { this.cache.clear(); }
    async resolve(route, lease, client, signal, force = false) {
        checkAbort(signal, 'deployment');
        const deployment = route.model.deployment;
        if ('id' in deployment)
            return { id: deployment.id, url: inferenceUrl(route, deployment.id) };
        const key = this.key(route, lease);
        const cached = this.cache.get(key);
        if (!force && cached && cached.expiresAt > this.clock())
            return { id: cached.route.id, url: new URL(cached.route.url) };
        const candidates = new Map();
        let skip = 0, complete = false;
        const seen = new Set();
        for (let page = 0; page < deployment.maxPages; page++) {
            const url = new URL(route.instance.apiBaseUrl + '/v2/lm/deployments');
            url.searchParams.set('$top', String(deployment.pageSize));
            url.searchParams.set('$skip', String(skip));
            const requestId = randomUUID();
            const reply = await client.request(url, { phase: 'deployment', headers: providerHeaders(route, lease.value, requestId), signal, requestId });
            const data = record(await readJson(reply, 'deployment'));
            if (!Array.isArray(data.resources))
                throw new SapAiCoreError('ROUTING', 'deployment', 'invalid deployment listing');
            const total = data.count;
            if (total !== undefined && (!Number.isSafeInteger(total) || total < 0))
                throw new SapAiCoreError('ROUTING', 'deployment', 'invalid deployment count');
            for (const raw of data.resources) {
                const item = record(raw);
                if (typeof item.id !== 'string' || !item.id.length || item.id.length > 256 || /^[.]{1,2}$/.test(item.id))
                    throw new SapAiCoreError('ROUTING', 'deployment', 'invalid deployment identifier');
                if (seen.has(item.id))
                    throw new SapAiCoreError('ROUTING', 'deployment', 'pagination returned repeated deployments');
                seen.add(item.id);
                if (item.status !== 'RUNNING' || item.scenarioId !== deployment.selector.scenario)
                    continue;
                const model = deploymentModel(item);
                if (model.name !== deployment.selector.model || (deployment.selector.version !== undefined && model.version !== deployment.selector.version))
                    continue;
                candidates.set(item.id, item);
            }
            skip += data.resources.length;
            if (total !== undefined ? skip >= total : data.resources.length < deployment.pageSize) {
                complete = true;
                break;
            }
            if (!data.resources.length)
                break;
        }
        if (!complete)
            throw new SapAiCoreError('ROUTING', 'deployment', 'incomplete deployment listing; cannot prove uniqueness');
        if (candidates.size === 0)
            throw new SapAiCoreError('DEPLOYMENT_NOT_READY', 'deployment', 'no matching RUNNING deployment');
        if (candidates.size !== 1)
            throw new SapAiCoreError('AMBIGUOUS_DEPLOYMENT', 'deployment', 'multiple matching RUNNING deployments; configure an explicit ID');
        const [id, value] = candidates.entries().next().value;
        if (typeof value.deploymentUrl !== 'string' || !value.deploymentUrl)
            throw new SapAiCoreError('DEPLOYMENT_NOT_READY', 'deployment', 'deployment has no inference URL');
        const selected = { id, url: inferenceUrl(route, id, value.deploymentUrl) };
        if (this.cache.size >= 128)
            this.cache.delete(this.cache.keys().next().value);
        this.cache.set(key, { route: selected, expiresAt: this.clock() + deployment.cacheTtlMs });
        return { id, url: new URL(selected.url) };
    }
    async checkExplicit(route, lease, client, signal) {
        if (!('id' in route.model.deployment)) {
            await this.resolve(route, lease, client, signal, true);
            return;
        }
        const requestId = randomUUID();
        const url = new URL(route.instance.apiBaseUrl + '/v2/lm/deployments/' + encodeURIComponent(route.model.deployment.id));
        const reply = await client.request(url, { phase: 'deployment', headers: providerHeaders(route, lease.value, requestId), signal, requestId });
        const deployment = record(await readJson(reply, 'deployment'));
        if (deployment.id !== route.model.deployment.id || deployment.status !== 'RUNNING')
            throw new SapAiCoreError('DEPLOYMENT_NOT_READY', 'deployment', 'explicit deployment is not RUNNING');
    }
}
//# sourceMappingURL=deployments.js.map