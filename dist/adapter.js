import { createHash, randomUUID } from 'node:crypto';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import { routeOf } from './config.js';
import { CredentialResolver } from './auth/credentials.js';
import { TokenManager } from './auth/token-manager.js';
import { DeploymentResolver } from './routing/deployments.js';
import { providerHeaders } from './routing/endpoints.js';
import { HttpClient, proxyEnvironment, readJson } from './transport/http.js';
import { RequestScope } from './transport/cancellation.js';
import { SapAiCoreError, aborted, checkAbort, safeError } from './diagnostics/errors.js';
import { buildRequest } from './protocol/request.js';
import { modelInfo } from './protocol/capabilities.js';
import { bufferedReply, streamReply } from './protocol/stream.js';
import { encodeRequest } from './protocol/orchestration.js';
export class SapAiCoreAdapter extends LlmAdapter {
    options;
    credentials;
    tokens = new TokenManager();
    deployments = new DeploymentResolver();
    lifetime = new AbortController();
    active = new Set();
    receipts = new Map();
    constructor(options) {
        super();
        this.options = options;
        this.credentials = new CredentialResolver(options.credentials);
    }
    route(provider, model) { return routeOf(this.options.snapshot(), provider, model); }
    providerInfo(provider) {
        const route = this.options.snapshot().config.providers[provider];
        if (!route)
            throw new SapAiCoreError('NO_ADAPTER', 'config', 'unknown provider route');
        return { id: provider, name: route.displayName ?? provider };
    }
    providerRetryPolicy(provider) {
        const route = this.options.snapshot().config.providers[provider];
        if (!route)
            throw new SapAiCoreError('NO_ADAPTER', 'config', 'unknown provider route');
        return { mode: 'normal', ...route.retryPolicy, retryableCodes: ['RATE_LIMIT', 'SERVER', 'TRANSPORT', 'TIMEOUT'] };
    }
    async listModels(provider) {
        const snapshot = this.options.snapshot();
        const route = snapshot.config.providers[provider];
        if (!route)
            return [];
        return route.models.map(model => modelInfo(routeOf(snapshot, provider, model.id)));
    }
    async resolveModel(provider, model, signal) {
        checkAbort(signal);
        return modelInfo(this.route(provider, model));
    }
    async prepareCall(provider, model, signal) {
        checkAbort(signal);
        const route = this.route(provider, model);
        return { model: modelInfo(route), stream: options => this.withRoute(options, route) };
    }
    stream(options) { return this.withRoute(options, this.route(options.provider, options.model)); }
    /** Read-only health and connection checks. No inspection level performs inference. */
    async inspect(provider, model, level, signal) {
        if (!['config', 'auth', 'deployment'].includes(level))
            throw new SapAiCoreError('INVALID_REQUEST', 'config', 'unknown inspection level');
        const route = this.route(provider, model);
        const scope = new RequestScope([signal, this.lifetime.signal], route.instance.network.requestTimeoutMs);
        let client;
        let lease;
        const cleanup = async () => { scope.controller.abort(); scope.dispose(); await client?.close(); };
        this.active.add(cleanup);
        try {
            checkAbort(scope.signal, 'config');
            const descriptions = await this.credentials.describe(route, scope.signal);
            const refs = [route.instance.credentials.clientIdRef, route.instance.credentials.clientSecretRef];
            const result = {
                ok: true, level, provider, model, configGeneration: route.snapshot.generation, mode: route.model.mode,
                credentials: descriptions.map((value, i) => ({ ref: refs[i], configured: value.configured, source: value.source })),
                network: { proxyMode: route.instance.network.proxyMode, tlsVerification: true },
            };
            if (descriptions.some(value => !value.configured))
                throw new SapAiCoreError('MISSING_CREDENTIAL', 'credentials', 'a configured credential reference is empty or absent');
            if (level === 'config')
                return result;
            const environment = proxyEnvironment();
            const credentials = await this.credentials.resolve(route, scope.signal);
            lease = await this.tokens.get(route, credentials, environment, scope.signal);
            result.token = { generation: lease.generation, expiresAt: lease.expiresAt, refreshAt: lease.refreshAt, remainingSeconds: Math.max(0, Math.floor((lease.expiresAt - Date.now()) / 1000)) };
            if (level === 'auth')
                return result;
            client = await HttpClient.open(route.instance.network, environment);
            await this.deployments.checkExplicit(route, lease, client, scope.signal);
            const deployment = await this.deployments.resolve(route, lease, client, scope.signal);
            result.deployment = { identity: createHash('sha256').update(deployment.id).digest('hex').slice(0, 12), status: 'RUNNING', selection: 'id' in route.model.deployment ? 'explicit' : 'discovery' };
            return result;
        }
        catch (error) {
            const safe = safeError(error, level === 'config' ? 'config' : level, scope.signal);
            if (lease && safe.failure.status === 401)
                this.tokens.invalidate(lease);
            throw safe;
        }
        finally {
            await cleanup();
            this.active.delete(cleanup);
        }
    }
    withRoute(options, route) {
        // Capture both the route and the wire projection synchronously, before any credential await.
        const body = buildRequest(options, route);
        return this.run(options, route, body, proxyEnvironment());
    }
    takeAuthReceipt(failure, provider, sessionId) {
        if (failure.code !== 'AUTH' || failure.status !== 401 || !failure.requestId)
            return undefined;
        const receipt = this.receipts.get(failure.requestId);
        if (!receipt || receipt.provider !== provider || receipt.sessionId !== sessionId || Date.now() - receipt.at > 300_000)
            return undefined;
        this.receipts.delete(failure.requestId);
        return receipt;
    }
    async *run(options, route, body, environment) {
        const scope = new RequestScope([options.signal, this.lifetime.signal], route.instance.network.requestTimeoutMs);
        const requestId = randomUUID();
        const started = performance.now();
        const diagnostic = { event: 'attempt', provider: route.providerId, model: route.model.id, configGeneration: route.snapshot.generation, attemptId: requestId, elapsedMs: 0, outcome: 'consumer-exit' };
        let client, reply, lease;
        const cleanup = async () => {
            scope.controller.abort();
            scope.dispose();
            await reply?.close();
            await client?.close();
        };
        this.active.add(cleanup);
        try {
            checkAbort(scope.signal);
            const credentials = await this.credentials.resolve(route, scope.signal);
            lease = await this.tokens.get(route, credentials, environment, scope.signal);
            diagnostic.tokenGeneration = lease.generation;
            checkAbort(scope.signal);
            client = await HttpClient.open(route.instance.network, environment);
            const deployment = await this.deployments.resolve(route, lease, client, scope.signal);
            diagnostic.deployment = createHash('sha256').update(deployment.id).digest('hex').slice(0, 12);
            checkAbort(scope.signal);
            reply = await client.request(deployment.url, { phase: 'inference', method: 'POST', headers: providerHeaders(route, lease.value, requestId, body.stream), body: JSON.stringify(encodeRequest(body, route)), signal: scope.signal, requestId });
            diagnostic.upstreamRequestId = reply.facts.upstreamRequestId;
            const chunks = body.stream ? streamReply(reply, route) : bufferedReply(await readJson(reply, 'inference'), route);
            for await (const chunk of chunks) {
                checkAbort(scope.signal);
                if (diagnostic.firstDeltaMs === undefined && ['text-delta', 'reasoning-delta', 'tool-call-delta'].includes(chunk.type))
                    diagnostic.firstDeltaMs = Math.round(performance.now() - started);
                if (chunk.type === 'usage')
                    diagnostic.usage = chunk.usage;
                if (chunk.type === 'finish')
                    diagnostic.outcome = 'success';
                yield chunk;
            }
        }
        catch (error) {
            const safe = safeError(error, 'inference', scope.signal);
            diagnostic.outcome = safe.code === 'ABORTED' ? 'aborted' : 'error';
            diagnostic.code = safe.code;
            diagnostic.phase = safe.phase;
            diagnostic.status = safe.failure.status;
            diagnostic.upstreamRequestId = safe.upstreamRequestId ?? diagnostic.upstreamRequestId;
            if (lease && safe.failure.status === 401) {
                this.tokens.invalidate(lease);
                // Receipt is created only for an observed pre-stream inference HTTP 401.
                if (safe.phase === 'inference' && route.provider.authRecovery && safe.failure.requestId) {
                    if (this.receipts.size >= 128)
                        this.receipts.delete(this.receipts.keys().next().value);
                    this.receipts.set(safe.failure.requestId, { provider: route.providerId, sessionId: options.sessionId, tokenGeneration: lease.generation, configGeneration: route.snapshot.generation, at: Date.now() });
                }
            }
            if (lease && (safe.failure.status === 404 || safe.failure.status === 410))
                this.deployments.invalidate(route, lease);
            throw safe;
        }
        finally {
            await cleanup();
            diagnostic.elapsedMs = Math.round(performance.now() - started);
            try {
                this.options.onDiagnostic?.(diagnostic);
            }
            catch { /* Observer failures cannot change a provider attempt. */ }
            this.active.delete(cleanup);
        }
    }
    async close() {
        this.lifetime.abort(aborted());
        this.receipts.clear();
        this.deployments.clear();
        await this.tokens.close();
        // A consumer may be paused at yield. Close its HTTP resources without waiting for next().
        await Promise.allSettled([...this.active].map(cleanup => cleanup()));
    }
}
//# sourceMappingURL=adapter.js.map