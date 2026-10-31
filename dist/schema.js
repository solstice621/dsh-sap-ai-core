import s from '@deepseek-ai/schemastery';
// Cordis' serializable settings schema; snapshotOf is the strict cross-field validator.
const scalar = s.union([s.string(), s.number(), s.boolean()]);
const credentials = s.object({ clientIdRef: s.string().required(), clientSecretRef: s.string().required() });
const network = s.object({
    proxyMode: s.union(['environment', 'direct', 'url']), proxyUrl: s.string(), caFile: s.string(),
    connectTimeoutMs: s.number(), authTimeoutMs: s.number(), requestTimeoutMs: s.number(), streamIdleTimeoutMs: s.number(),
});
const instance = s.object({
    apiBaseUrl: s.string().required(), tokenUrl: s.string().required(), credentials: credentials.required(),
    oauth: s.object({
        clientAuthMethod: s.union(['body', 'basic']).required(), scope: s.string(), audience: s.string(),
        refreshSkewMs: s.number(), refreshJitterRatio: s.number(),
    }).required(),
    network, allowedDeploymentOrigins: s.array(s.string()), allowInsecureLocalhost: s.boolean(),
});
const model = s.object({
    id: s.string().required(), name: s.string(), upstreamModel: s.string().required(), upstreamModelVersion: s.string(),
    deployment: s.union([
        s.object({ id: s.string().required() }),
        s.object({
            selector: s.object({ scenario: s.string().required(), model: s.string(), version: s.string() }).required(),
            cacheTtlMs: s.number(), maxPages: s.number(), pageSize: s.number(),
        }),
    ]).required(),
    mode: s.union(['streaming', 'buffered']),
    capabilities: s.object({
        streaming: s.boolean(), tools: s.boolean(), parallelToolCalls: s.boolean(), temperature: s.boolean(),
        stop: s.boolean(), reasoningContent: s.boolean(),
        evidence: s.object({ status: s.union(['verified', 'experimental']).required(), reference: s.string().required() }).required(),
    }).required(),
    compatibility: s.object({
        systemRole: s.union(['system', 'developer']), developerRole: s.union(['developer', 'system', 'reject']),
        maxTokensField: s.union(['max_tokens', 'max_completion_tokens', 'unsupported']), includeUsage: s.boolean(),
        reasoningField: s.union(['reasoning_content', 'reasoning']), replayReasoning: s.boolean(),
        parameters: s.dict(scalar),
        reasoningEfforts: s.dict(s.object({ name: s.string().required(), parameters: s.dict(scalar).required() })),
        defaultReasoningEffort: s.string(),
    }),
    contextWindow: s.number(), maxOutputTokens: s.number(), defaultMaxTokens: s.number(),
});
const provider = s.object({
    instance: s.string().required(), displayName: s.string(), resourceGroup: s.string().required(),
    protocol: s.union(['openai-chat-completions', 'sap-orchestration-v2']).required(), apiVersion: s.string(), inferencePath: s.string(),
    headers: s.dict(s.string()), models: s.array(model).required(),
    retryPolicy: s.object({ maxRetries: s.number(), initialDelayMs: s.number(), maxDelayMs: s.number(), jitterRatio: s.number() }),
    authRecovery: s.boolean(),
});
export const Config = s.object({ instances: s.dict(instance).required().volatile(), providers: s.dict(provider).required().volatile() });
//# sourceMappingURL=schema.js.map