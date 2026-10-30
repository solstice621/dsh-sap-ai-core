import { z } from 'zod';
export declare const NetworkSchema: z.ZodDefault<z.ZodObject<{
    proxyMode: z.ZodDefault<z.ZodEnum<{
        environment: "environment";
        direct: "direct";
        url: "url";
    }>>;
    proxyUrl: z.ZodOptional<z.ZodString>;
    caFile: z.ZodOptional<z.ZodString>;
    connectTimeoutMs: z.ZodDefault<z.ZodNumber>;
    authTimeoutMs: z.ZodDefault<z.ZodNumber>;
    requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
    streamIdleTimeoutMs: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>>;
export declare const ConfigSchema: z.ZodObject<{
    instances: z.ZodRecord<z.ZodString, z.ZodObject<{
        apiBaseUrl: z.ZodString;
        tokenUrl: z.ZodString;
        credentials: z.ZodObject<{
            clientIdRef: z.ZodString;
            clientSecretRef: z.ZodString;
        }, z.core.$strict>;
        oauth: z.ZodObject<{
            clientAuthMethod: z.ZodEnum<{
                body: "body";
                basic: "basic";
            }>;
            scope: z.ZodOptional<z.ZodString>;
            audience: z.ZodOptional<z.ZodString>;
            refreshSkewMs: z.ZodDefault<z.ZodNumber>;
            refreshJitterRatio: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>;
        network: z.ZodDefault<z.ZodObject<{
            proxyMode: z.ZodDefault<z.ZodEnum<{
                environment: "environment";
                direct: "direct";
                url: "url";
            }>>;
            proxyUrl: z.ZodOptional<z.ZodString>;
            caFile: z.ZodOptional<z.ZodString>;
            connectTimeoutMs: z.ZodDefault<z.ZodNumber>;
            authTimeoutMs: z.ZodDefault<z.ZodNumber>;
            requestTimeoutMs: z.ZodDefault<z.ZodNumber>;
            streamIdleTimeoutMs: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        allowedDeploymentOrigins: z.ZodDefault<z.ZodArray<z.ZodString>>;
        allowInsecureLocalhost: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    providers: z.ZodRecord<z.ZodString, z.ZodObject<{
        instance: z.ZodString;
        displayName: z.ZodOptional<z.ZodString>;
        resourceGroup: z.ZodString;
        protocol: z.ZodLiteral<"openai-chat-completions">;
        apiVersion: z.ZodOptional<z.ZodString>;
        inferencePath: z.ZodDefault<z.ZodString>;
        headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        models: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            upstreamModel: z.ZodString;
            deployment: z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
            }, z.core.$strict>, z.ZodObject<{
                selector: z.ZodObject<{
                    scenario: z.ZodString;
                    model: z.ZodString;
                    version: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>;
                cacheTtlMs: z.ZodDefault<z.ZodNumber>;
                maxPages: z.ZodDefault<z.ZodNumber>;
                pageSize: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>]>;
            mode: z.ZodDefault<z.ZodEnum<{
                streaming: "streaming";
                buffered: "buffered";
            }>>;
            capabilities: z.ZodObject<{
                streaming: z.ZodDefault<z.ZodBoolean>;
                tools: z.ZodDefault<z.ZodBoolean>;
                parallelToolCalls: z.ZodDefault<z.ZodBoolean>;
                temperature: z.ZodDefault<z.ZodBoolean>;
                stop: z.ZodDefault<z.ZodBoolean>;
                reasoningContent: z.ZodDefault<z.ZodBoolean>;
                evidence: z.ZodObject<{
                    status: z.ZodEnum<{
                        verified: "verified";
                        experimental: "experimental";
                    }>;
                    reference: z.ZodString;
                }, z.core.$strict>;
            }, z.core.$strict>;
            compatibility: z.ZodDefault<z.ZodObject<{
                systemRole: z.ZodDefault<z.ZodEnum<{
                    system: "system";
                    developer: "developer";
                }>>;
                developerRole: z.ZodDefault<z.ZodEnum<{
                    system: "system";
                    developer: "developer";
                    reject: "reject";
                }>>;
                maxTokensField: z.ZodDefault<z.ZodEnum<{
                    max_tokens: "max_tokens";
                    max_completion_tokens: "max_completion_tokens";
                    unsupported: "unsupported";
                }>>;
                includeUsage: z.ZodDefault<z.ZodBoolean>;
                reasoningField: z.ZodDefault<z.ZodEnum<{
                    reasoning_content: "reasoning_content";
                    reasoning: "reasoning";
                }>>;
                replayReasoning: z.ZodDefault<z.ZodBoolean>;
                parameters: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
                reasoningEfforts: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
                    name: z.ZodString;
                    parameters: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>;
                }, z.core.$strict>>>;
                defaultReasoningEffort: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            contextWindow: z.ZodOptional<z.ZodNumber>;
            maxOutputTokens: z.ZodOptional<z.ZodNumber>;
            defaultMaxTokens: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        retryPolicy: z.ZodDefault<z.ZodObject<{
            maxRetries: z.ZodDefault<z.ZodNumber>;
            initialDelayMs: z.ZodDefault<z.ZodNumber>;
            maxDelayMs: z.ZodDefault<z.ZodNumber>;
            jitterRatio: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        authRecovery: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Options = z.input<typeof ConfigSchema>;
export type ResolvedConfig = z.output<typeof ConfigSchema>;
export type Instance = ResolvedConfig['instances'][string];
export type ProviderRoute = ResolvedConfig['providers'][string];
export type LogicalModel = ProviderRoute['models'][number];
export type Network = Instance['network'];
export interface Snapshot {
    readonly generation: number;
    readonly config: ResolvedConfig;
}
export interface ModelRoute {
    readonly snapshot: Snapshot;
    readonly providerId: string;
    readonly instanceId: string;
    readonly instance: Instance;
    readonly provider: ProviderRoute;
    readonly model: LogicalModel;
}
export declare function validateUrl(value: string, allowLocal?: boolean, originOnly?: boolean): URL;
export declare function freeze<T>(value: T): T;
export declare function snapshotOf(input: unknown, generation?: number): Snapshot;
export declare function routeOf(snapshot: Snapshot, providerId: string, modelId: string): ModelRoute;
