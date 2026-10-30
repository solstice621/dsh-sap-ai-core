import { randomUUID } from 'node:crypto';
import { HttpClient, readJson } from '../transport/http.js';
import { SapAiCoreError, aborted, checkAbort } from '../diagnostics/errors.js';
/** Single-flight refresh with independent waiter cancellation and generation-aware rejection. */
export class TokenManager {
    clock;
    random;
    cache = new Map();
    flights = new Map();
    generation = 0;
    disposed = false;
    stats = { acquisitions: 0, cacheHits: 0, sharedWaits: 0 };
    constructor(clock = Date.now, random = Math.random) {
        this.clock = clock;
        this.random = random;
    }
    get(route, credentials, environment, signal) {
        checkAbort(signal, 'auth');
        if (this.disposed)
            return Promise.reject(aborted('auth'));
        const key = credentials.key;
        const cached = this.cache.get(key);
        if (cached && this.clock() < cached.refreshAt && this.clock() < cached.expiresAt) {
            this.stats.cacheHits++;
            return Promise.resolve(cached);
        }
        let flight = this.flights.get(key);
        if (!flight) {
            const controller = new AbortController();
            const current = { controller, waiters: 0, promise: Promise.resolve(undefined) };
            current.promise = Promise.resolve().then(async () => {
                const lease = await this.acquire(route, credentials, environment, controller.signal);
                if (!controller.signal.aborted && this.flights.get(key) === current && !this.disposed) {
                    // Bounded process-local cache; evicting a lease does not affect its in-flight users.
                    if (this.cache.size >= 128)
                        this.cache.delete(this.cache.keys().next().value);
                    this.cache.set(key, lease);
                }
                return lease;
            }).finally(() => { if (this.flights.get(key) === current)
                this.flights.delete(key); });
            void current.promise.catch(() => { });
            flight = current;
            this.flights.set(key, current);
        }
        else
            this.stats.sharedWaits++;
        const shared = flight;
        shared.waiters++;
        return new Promise((resolve, reject) => {
            let settled = false;
            const release = () => {
                signal?.removeEventListener('abort', cancel);
                shared.waiters--;
                if (shared.waiters === 0 && this.flights.get(key) === shared) {
                    this.flights.delete(key);
                    shared.controller.abort(aborted('auth'));
                }
            };
            const cancel = () => { if (!settled) {
                settled = true;
                release();
                reject(signal?.reason instanceof SapAiCoreError ? signal.reason : aborted('auth'));
            } };
            signal?.addEventListener('abort', cancel, { once: true });
            shared.promise.then(lease => {
                if (!settled) {
                    settled = true;
                    release();
                    resolve(lease);
                }
            }, error => { if (!settled) {
                settled = true;
                release();
                reject(error);
            } });
            if (signal?.aborted)
                cancel();
        });
    }
    invalidate(rejected) {
        if (this.cache.get(rejected.key)?.generation !== rejected.generation)
            return false;
        return this.cache.delete(rejected.key);
    }
    async acquire(route, credentials, environment, signal) {
        checkAbort(signal, 'auth');
        this.stats.acquisitions++;
        const client = await HttpClient.open(route.instance.network, environment);
        const form = new URLSearchParams({ grant_type: 'client_credentials' });
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
        const oauth = route.instance.oauth;
        if (oauth.clientAuthMethod === 'body') {
            form.set('client_id', credentials.clientId);
            form.set('client_secret', credentials.clientSecret);
        }
        else {
            // RFC 6749 section 2.3.1: encode each identifier before constructing HTTP Basic.
            const encode = (value) => new URLSearchParams({ v: value }).toString().slice(2);
            headers.Authorization = `Basic ${Buffer.from(`${encode(credentials.clientId)}:${encode(credentials.clientSecret)}`).toString('base64')}`;
        }
        if (oauth.scope)
            form.set('scope', oauth.scope);
        if (oauth.audience)
            form.set('audience', oauth.audience);
        // Conservative expiry: count lifetime from request start, not from receipt of the response.
        const started = this.clock();
        try {
            const reply = await client.request(new URL(route.instance.tokenUrl), { phase: 'auth', method: 'POST', headers, body: form.toString(), signal, requestId: randomUUID() });
            const raw = await readJson(reply, 'auth', 128 * 1024);
            if (!raw || typeof raw !== 'object')
                throw new SapAiCoreError('AUTH', 'auth', 'invalid OAuth response');
            const data = raw;
            if (typeof data.access_token !== 'string' || !/^[A-Za-z0-9._~+\/-]+=*$/.test(data.access_token) || typeof data.token_type !== 'string' || data.token_type.toLowerCase() !== 'bearer' || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 31_536_000) {
                throw new SapAiCoreError('AUTH', 'auth', 'invalid access_token, token_type, or expires_in');
            }
            const life = data.expires_in * 1000;
            const expiresAt = started + life;
            if (expiresAt <= this.clock())
                throw new SapAiCoreError('AUTH', 'auth', 'token already expired on receipt');
            const skew = Math.min(life / 2, oauth.refreshSkewMs * (1 - oauth.refreshJitterRatio + this.random() * oauth.refreshJitterRatio));
            checkAbort(signal, 'auth');
            return Object.freeze({ key: credentials.key, generation: ++this.generation, value: data.access_token, expiresAt, refreshAt: expiresAt - skew });
        }
        finally {
            await client.close();
        }
    }
    async close() {
        this.disposed = true;
        this.cache.clear();
        const flights = [...this.flights.values()];
        this.flights.clear();
        for (const flight of flights)
            flight.controller.abort(aborted('auth'));
        await Promise.allSettled(flights.map(f => f.promise));
    }
}
//# sourceMappingURL=token-manager.js.map