import { readFile } from 'node:fs/promises';
import { rootCertificates } from 'node:tls';
import { Agent, EnvHttpProxyAgent, ProxyAgent, fetch } from 'undici';
import { SapAiCoreError, checkAbort, httpError, retryAfter, safeError } from '../diagnostics/errors.js';
import { RequestScope } from './cancellation.js';
export function proxyEnvironment(env = process.env) {
    return Object.freeze({
        httpProxy: env.http_proxy || env.HTTP_PROXY || '',
        httpsProxy: env.https_proxy || env.HTTPS_PROXY || '',
        noProxy: env.no_proxy ?? env.NO_PROXY ?? '',
    });
}
/** A request-scoped dispatcher. No global fetch/dispatcher/proxy changes, and no retries. */
export class HttpClient {
    dispatcher;
    network;
    constructor(dispatcher, network) {
        this.dispatcher = dispatcher;
        this.network = network;
    }
    static async open(network, environment = proxyEnvironment()) {
        let ca;
        if (network.caFile) {
            try {
                ca = [...rootCertificates, await readFile(network.caFile, 'utf8')];
            }
            catch {
                throw new SapAiCoreError('INVALID_CONFIG', 'config', 'cannot read configured CA file');
            }
        }
        const connect = { timeout: network.connectTimeoutMs, rejectUnauthorized: true, ...(ca ? { ca } : {}) };
        const options = { connect, headersTimeout: network.requestTimeoutMs, bodyTimeout: 0 };
        let dispatcher;
        try {
            if (network.proxyMode === 'url') {
                dispatcher = new ProxyAgent({ ...options, uri: network.proxyUrl, requestTls: connect, proxyTls: connect });
            }
            else if (network.proxyMode === 'environment') {
                // Empty strings explicitly suppress ambient fallbacks after this snapshot was captured.
                dispatcher = new EnvHttpProxyAgent({ ...options, ...environment, requestTls: connect, proxyTls: connect });
            }
            else
                dispatcher = new Agent(options);
        }
        catch {
            throw new SapAiCoreError('INVALID_CONFIG', 'config', 'invalid request-level proxy configuration');
        }
        return new HttpClient(dispatcher, network);
    }
    async request(url, options) {
        checkAbort(options.signal, options.phase);
        const scope = new RequestScope([options.signal], options.phase === 'auth' ? this.network.authTimeoutMs : this.network.requestTimeoutMs, options.phase);
        try {
            const response = await fetch(url, {
                dispatcher: this.dispatcher, method: options.method ?? 'GET',
                headers: options.headers, body: options.body, signal: scope.signal, redirect: 'manual',
            });
            const upstreamId = response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id');
            const facts = {
                ...(options.requestId ? { requestId: options.requestId } : {}),
                ...(upstreamId && /^[A-Za-z0-9._:-]{1,128}$/.test(upstreamId) ? { upstreamRequestId: upstreamId } : {}),
                providerRetryAfterMs: retryAfter(response.headers.get('retry-after')),
            };
            if (!response.ok) {
                scope.controller.abort();
                await response.body?.cancel().catch(() => { });
                throw httpError(response.status, options.phase, facts);
            }
            return { response, scope, facts, close: async () => {
                    scope.controller.abort();
                    if (!response.body?.locked)
                        await response.body?.cancel().catch(() => { });
                    scope.dispose();
                } };
        }
        catch (error) {
            const safe = safeError(error, options.phase, scope.signal);
            scope.dispose();
            throw safe;
        }
    }
    async close() { await this.dispatcher.destroy().catch(() => { }); }
}
export async function readJson(reply, phase, limit = 2 * 1024 * 1024) {
    const { response, scope } = reply;
    let reader;
    const buffers = [];
    let length = 0;
    try {
        if (!/^application[/](?:[a-z0-9.+-]*\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? ''))
            throw new SapAiCoreError('INVALID_RESPONSE', phase, 'expected a JSON response', reply.facts);
        if (!response.body)
            throw new SapAiCoreError('INVALID_RESPONSE', phase, 'empty HTTP body', reply.facts);
        reader = response.body.getReader();
        while (true) {
            checkAbort(scope.signal, phase);
            const chunk = await reader.read();
            if (chunk.done)
                break;
            length += chunk.value.byteLength;
            if (length > limit)
                throw new SapAiCoreError('INVALID_RESPONSE', phase, 'JSON response exceeds size limit', reply.facts);
            buffers.push(chunk.value);
        }
        checkAbort(scope.signal, phase);
        try {
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(buffers)));
        }
        catch {
            throw new SapAiCoreError('INVALID_RESPONSE', phase, 'invalid JSON response', reply.facts);
        }
    }
    catch (error) {
        throw safeError(error, phase, scope.signal);
    }
    finally {
        reader?.releaseLock();
        await reply.close();
    }
}
//# sourceMappingURL=http.js.map