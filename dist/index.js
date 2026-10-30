import { SapAiCoreAdapter } from './adapter.js';
import { snapshotOf } from './config.js';
import { Config } from './schema.js';
import { SapAiCoreError } from './diagnostics/errors.js';
import { diagnose } from './diagnostics/run.js';
export { Config, SapAiCoreAdapter, snapshotOf };
export { ConfigSchema, routeOf } from './config.js';
export { SapAiCoreError } from './diagnostics/errors.js';
export const name = 'sap-ai-core';
export const inject = ['llm', 'credentials'];
export class SapAiCoreRuntime {
    ctx;
    namespace;
    adapter;
    current;
    registration;
    directory;
    toolsContext;
    closed = false;
    constructor(ctx, input, namespace = name) {
        this.ctx = ctx;
        this.namespace = namespace;
        this.current = snapshotOf(input);
        this.adapter = new SapAiCoreAdapter({
            snapshot: () => this.current, credentials: ctx.credentials,
            onDiagnostic: event => { ctx.logger.debug('sap-ai-core %s', JSON.stringify(event)); ctx.emit('sap-ai-core/attempt', event); },
        });
        this.commit(this.current);
    }
    get snapshot() { return this.current; }
    diagnose(input) {
        if (input.level === 'tools' && !this.toolsContext && input.allowInference)
            throw new SapAiCoreError('DIAGNOSTIC_UNAVAILABLE', 'config', 'tools diagnostics require DSH Agent and tools services');
        return diagnose(this.toolsContext ?? this.ctx, this.adapter, this.current, input);
    }
    useToolsContext(ctx) {
        this.toolsContext = ctx;
        return () => { if (this.toolsContext === ctx)
            this.toolsContext = undefined; };
    }
    validate(input) {
        if (this.closed)
            throw new SapAiCoreError('ABORTED', 'config', 'plugin is disposed');
        const candidate = snapshotOf(input, this.current.generation + 1);
        const owned = new Set(Object.keys(this.current.config.providers));
        const proposed = new Set(Object.keys(candidate.config.providers));
        for (const provider of this.ctx.llm.listProviders()) {
            if (proposed.has(provider.id) && !owned.has(provider.id))
                throw new SapAiCoreError('DUPLICATE_ADAPTER', 'config', 'provider route is already registered');
        }
        for (const entry of this.ctx.llm.listConfigurableProviders()) {
            if (proposed.has(entry.provider) && !owned.has(entry.provider))
                throw new SapAiCoreError('DUPLICATE_ADAPTER', 'config', 'provider directory entry is already registered');
        }
        return candidate;
    }
    update(input) { this.commit(this.validate(input)); }
    entries(snapshot) {
        return Object.entries(snapshot.config.providers).map(([provider, route]) => ({
            provider, displayName: route.displayName ?? provider, settingsNs: this.namespace,
            settingsPath: ['providers', provider], declared: true,
            nativeAuth: { env: Object.values(snapshot.config.instances[route.instance].credentials), oauth: false },
        }));
    }
    commit(candidate) {
        const previous = this.current;
        this.current = candidate;
        const providers = Object.keys(candidate.config.providers);
        try {
            if (this.registration)
                this.registration.replace(providers);
            else if (providers.length)
                this.registration = this.ctx.llm.registerAdapter(providers, this.adapter);
            if (this.directory)
                this.directory.replace(this.entries(candidate));
            else if (providers.length)
                this.directory = this.ctx.llm.registerConfigurableProviders(this.entries(candidate));
        }
        catch (error) {
            this.current = previous;
            // Initial failure withdraws our newly acquired routes. Updates restore all previous facts.
            if (candidate === previous) {
                this.registration?.();
                this.directory?.();
            }
            else {
                this.registration?.replace(Object.keys(previous.config.providers));
                this.directory?.replace(this.entries(previous));
            }
            throw error;
        }
    }
    async close() {
        if (this.closed)
            return;
        this.closed = true;
        this.registration?.();
        this.directory?.();
        await this.adapter.close();
    }
}
export function apply(ctx, config) {
    const plain = () => ({ ...config, instances: config.instances.get(), providers: config.providers.get() });
    const runtime = new SapAiCoreRuntime(ctx, plain(), ctx.fiber.entry?.options.id ?? name);
    ctx.provide('sapAiCore', runtime);
    ctx.effect(() => () => runtime.close(), 'sap-ai-core: close active requests and provider routes');
    ctx.on('internal/config', function (_input, next) {
        const raw = next();
        if (this === ctx.fiber) {
            // Validate raw input before Schemastery can apply defaults or normalize UI values.
            runtime.validate(raw);
        }
        return raw;
    });
    ctx.on('loader/volatile-update', () => {
        try {
            runtime.update(plain());
        }
        catch {
            ctx.logger.warn('sap-ai-core: configuration rejected; retaining the last valid route snapshot');
        }
    });
    ctx.inject(['agents', 'sessionProjections'], async (child) => {
        const { registerAuthRecovery } = await import('./auth/recovery.js');
        registerAuthRecovery(child, runtime.adapter);
    });
    ctx.inject(['agents', 'tools'], child => { child.effect(() => runtime.useToolsContext(child)); });
}
//# sourceMappingURL=index.js.map