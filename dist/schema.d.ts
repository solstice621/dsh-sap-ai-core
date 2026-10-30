import s from '@deepseek-ai/schemastery';
export declare const Config: s<Schemastery.ObjectS<NoInfer<{
    instances: s<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
        apiBaseUrl?: string | null | undefined;
        tokenUrl?: string | null | undefined;
        credentials?: ({
            clientIdRef?: string | null | undefined;
            clientSecretRef?: string | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        oauth?: ({
            clientAuthMethod?: "body" | "basic" | null | undefined;
            scope?: string | null | undefined;
            audience?: string | null | undefined;
            refreshSkewMs?: number | null | undefined;
            refreshJitterRatio?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        network?: ({
            proxyMode?: "environment" | "direct" | "url" | null | undefined;
            proxyUrl?: string | null | undefined;
            caFile?: string | null | undefined;
            connectTimeoutMs?: number | null | undefined;
            authTimeoutMs?: number | null | undefined;
            requestTimeoutMs?: number | null | undefined;
            streamIdleTimeoutMs?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        allowedDeploymentOrigins?: string[] | null | undefined;
        allowInsecureLocalhost?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        apiBaseUrl: s<string, string, "defined">;
        tokenUrl: s<string, string, "defined">;
        credentials: s<Schemastery.ObjectS<NoInfer<{
            clientIdRef: s<string, string, "defined">;
            clientSecretRef: s<string, string, "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            clientIdRef: s<string, string, "defined">;
            clientSecretRef: s<string, string, "defined">;
        }>>, "defined">;
        oauth: s<Schemastery.ObjectS<NoInfer<{
            clientAuthMethod: s<"body" | "basic", "body" | "basic", "defined">;
            scope: s<string, string, "plain">;
            audience: s<string, string, "plain">;
            refreshSkewMs: s<number, number, "plain">;
            refreshJitterRatio: s<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            clientAuthMethod: s<"body" | "basic", "body" | "basic", "defined">;
            scope: s<string, string, "plain">;
            audience: s<string, string, "plain">;
            refreshSkewMs: s<number, number, "plain">;
            refreshJitterRatio: s<number, number, "plain">;
        }>>, "defined">;
        network: s<Schemastery.ObjectS<NoInfer<{
            proxyMode: s<"environment" | "direct" | "url", "environment" | "direct" | "url", "plain">;
            proxyUrl: s<string, string, "plain">;
            caFile: s<string, string, "plain">;
            connectTimeoutMs: s<number, number, "plain">;
            authTimeoutMs: s<number, number, "plain">;
            requestTimeoutMs: s<number, number, "plain">;
            streamIdleTimeoutMs: s<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            proxyMode: s<"environment" | "direct" | "url", "environment" | "direct" | "url", "plain">;
            proxyUrl: s<string, string, "plain">;
            caFile: s<string, string, "plain">;
            connectTimeoutMs: s<number, number, "plain">;
            authTimeoutMs: s<number, number, "plain">;
            requestTimeoutMs: s<number, number, "plain">;
            streamIdleTimeoutMs: s<number, number, "plain">;
        }>>, "plain">;
        allowedDeploymentOrigins: s<string[], string[], "plain">;
        allowInsecureLocalhost: s<boolean, boolean, "plain">;
    }>>, string>>, "volatile-defined">;
    providers: s<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
        instance?: string | null | undefined;
        displayName?: string | null | undefined;
        resourceGroup?: string | null | undefined;
        protocol?: "openai-chat-completions" | null | undefined;
        apiVersion?: string | null | undefined;
        inferencePath?: string | null | undefined;
        headers?: import("@deepseek-ai/cosmokit").Dict<string, string> | null | undefined;
        models?: ({
            id?: string | null | undefined;
            name?: string | null | undefined;
            upstreamModel?: string | null | undefined;
            deployment?: ({
                id?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | ({
                selector?: ({
                    scenario?: string | null | undefined;
                    model?: string | null | undefined;
                    version?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
                cacheTtlMs?: number | null | undefined;
                maxPages?: number | null | undefined;
                pageSize?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            mode?: "streaming" | "buffered" | null | undefined;
            capabilities?: ({
                streaming?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                parallelToolCalls?: boolean | null | undefined;
                temperature?: boolean | null | undefined;
                stop?: boolean | null | undefined;
                reasoningContent?: boolean | null | undefined;
                evidence?: ({
                    status?: "verified" | "experimental" | null | undefined;
                    reference?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            compatibility?: ({
                systemRole?: "system" | "developer" | null | undefined;
                developerRole?: "system" | "developer" | "reject" | null | undefined;
                maxTokensField?: "max_tokens" | "max_completion_tokens" | "unsupported" | null | undefined;
                includeUsage?: boolean | null | undefined;
                reasoningField?: "reasoning_content" | "reasoning" | null | undefined;
                replayReasoning?: boolean | null | undefined;
                parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                reasoningEfforts?: import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string> | null | undefined;
                defaultReasoningEffort?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            contextWindow?: number | null | undefined;
            maxOutputTokens?: number | null | undefined;
            defaultMaxTokens?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
        retryPolicy?: ({
            maxRetries?: number | null | undefined;
            initialDelayMs?: number | null | undefined;
            maxDelayMs?: number | null | undefined;
            jitterRatio?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        authRecovery?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        instance: s<string, string, "defined">;
        displayName: s<string, string, "plain">;
        resourceGroup: s<string, string, "defined">;
        protocol: s<"openai-chat-completions", "openai-chat-completions", "defined">;
        apiVersion: s<string, string, "plain">;
        inferencePath: s<string, string, "plain">;
        headers: s<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "plain">;
        models: s<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            upstreamModel?: string | null | undefined;
            deployment?: ({
                id?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | ({
                selector?: ({
                    scenario?: string | null | undefined;
                    model?: string | null | undefined;
                    version?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
                cacheTtlMs?: number | null | undefined;
                maxPages?: number | null | undefined;
                pageSize?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            mode?: "streaming" | "buffered" | null | undefined;
            capabilities?: ({
                streaming?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                parallelToolCalls?: boolean | null | undefined;
                temperature?: boolean | null | undefined;
                stop?: boolean | null | undefined;
                reasoningContent?: boolean | null | undefined;
                evidence?: ({
                    status?: "verified" | "experimental" | null | undefined;
                    reference?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            compatibility?: ({
                systemRole?: "system" | "developer" | null | undefined;
                developerRole?: "system" | "developer" | "reject" | null | undefined;
                maxTokensField?: "max_tokens" | "max_completion_tokens" | "unsupported" | null | undefined;
                includeUsage?: boolean | null | undefined;
                reasoningField?: "reasoning_content" | "reasoning" | null | undefined;
                replayReasoning?: boolean | null | undefined;
                parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                reasoningEfforts?: import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string> | null | undefined;
                defaultReasoningEffort?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            contextWindow?: number | null | undefined;
            maxOutputTokens?: number | null | undefined;
            defaultMaxTokens?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: s<string, string, "defined">;
            name: s<string, string, "plain">;
            upstreamModel: s<string, string, "defined">;
            deployment: s<({
                id?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | ({
                selector?: ({
                    scenario?: string | null | undefined;
                    model?: string | null | undefined;
                    version?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
                cacheTtlMs?: number | null | undefined;
                maxPages?: number | null | undefined;
                pageSize?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict), Schemastery.ObjectT<NoInfer<{
                id: s<string, string, "defined">;
            }>> | Schemastery.ObjectT<NoInfer<{
                selector: s<Schemastery.ObjectS<NoInfer<{
                    scenario: s<string, string, "defined">;
                    model: s<string, string, "defined">;
                    version: s<string, string, "plain">;
                }>>, Schemastery.ObjectT<NoInfer<{
                    scenario: s<string, string, "defined">;
                    model: s<string, string, "defined">;
                    version: s<string, string, "plain">;
                }>>, "defined">;
                cacheTtlMs: s<number, number, "plain">;
                maxPages: s<number, number, "plain">;
                pageSize: s<number, number, "plain">;
            }>>, "defined">;
            mode: s<"streaming" | "buffered", "streaming" | "buffered", "plain">;
            capabilities: s<Schemastery.ObjectS<NoInfer<{
                streaming: s<boolean, boolean, "plain">;
                tools: s<boolean, boolean, "plain">;
                parallelToolCalls: s<boolean, boolean, "plain">;
                temperature: s<boolean, boolean, "plain">;
                stop: s<boolean, boolean, "plain">;
                reasoningContent: s<boolean, boolean, "plain">;
                evidence: s<Schemastery.ObjectS<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, Schemastery.ObjectT<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, "defined">;
            }>>, Schemastery.ObjectT<NoInfer<{
                streaming: s<boolean, boolean, "plain">;
                tools: s<boolean, boolean, "plain">;
                parallelToolCalls: s<boolean, boolean, "plain">;
                temperature: s<boolean, boolean, "plain">;
                stop: s<boolean, boolean, "plain">;
                reasoningContent: s<boolean, boolean, "plain">;
                evidence: s<Schemastery.ObjectS<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, Schemastery.ObjectT<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, "defined">;
            }>>, "defined">;
            compatibility: s<Schemastery.ObjectS<NoInfer<{
                systemRole: s<"system" | "developer", "system" | "developer", "plain">;
                developerRole: s<"system" | "developer" | "reject", "system" | "developer" | "reject", "plain">;
                maxTokensField: s<"max_tokens" | "max_completion_tokens" | "unsupported", "max_tokens" | "max_completion_tokens" | "unsupported", "plain">;
                includeUsage: s<boolean, boolean, "plain">;
                reasoningField: s<"reasoning_content" | "reasoning", "reasoning_content" | "reasoning", "plain">;
                replayReasoning: s<boolean, boolean, "plain">;
                parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "plain">;
                reasoningEfforts: s<import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
                    name: s<string, string, "defined">;
                    parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "defined">;
                }>>, string>, "plain">;
                defaultReasoningEffort: s<string, string, "plain">;
            }>>, Schemastery.ObjectT<NoInfer<{
                systemRole: s<"system" | "developer", "system" | "developer", "plain">;
                developerRole: s<"system" | "developer" | "reject", "system" | "developer" | "reject", "plain">;
                maxTokensField: s<"max_tokens" | "max_completion_tokens" | "unsupported", "max_tokens" | "max_completion_tokens" | "unsupported", "plain">;
                includeUsage: s<boolean, boolean, "plain">;
                reasoningField: s<"reasoning_content" | "reasoning", "reasoning_content" | "reasoning", "plain">;
                replayReasoning: s<boolean, boolean, "plain">;
                parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "plain">;
                reasoningEfforts: s<import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
                    name: s<string, string, "defined">;
                    parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "defined">;
                }>>, string>, "plain">;
                defaultReasoningEffort: s<string, string, "plain">;
            }>>, "plain">;
            contextWindow: s<number, number, "plain">;
            maxOutputTokens: s<number, number, "plain">;
            defaultMaxTokens: s<number, number, "plain">;
        }>>[], "defined">;
        retryPolicy: s<Schemastery.ObjectS<NoInfer<{
            maxRetries: s<number, number, "plain">;
            initialDelayMs: s<number, number, "plain">;
            maxDelayMs: s<number, number, "plain">;
            jitterRatio: s<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            maxRetries: s<number, number, "plain">;
            initialDelayMs: s<number, number, "plain">;
            maxDelayMs: s<number, number, "plain">;
            jitterRatio: s<number, number, "plain">;
        }>>, "plain">;
        authRecovery: s<boolean, boolean, "plain">;
    }>>, string>>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    instances: s<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
        apiBaseUrl?: string | null | undefined;
        tokenUrl?: string | null | undefined;
        credentials?: ({
            clientIdRef?: string | null | undefined;
            clientSecretRef?: string | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        oauth?: ({
            clientAuthMethod?: "body" | "basic" | null | undefined;
            scope?: string | null | undefined;
            audience?: string | null | undefined;
            refreshSkewMs?: number | null | undefined;
            refreshJitterRatio?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        network?: ({
            proxyMode?: "environment" | "direct" | "url" | null | undefined;
            proxyUrl?: string | null | undefined;
            caFile?: string | null | undefined;
            connectTimeoutMs?: number | null | undefined;
            authTimeoutMs?: number | null | undefined;
            requestTimeoutMs?: number | null | undefined;
            streamIdleTimeoutMs?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        allowedDeploymentOrigins?: string[] | null | undefined;
        allowInsecureLocalhost?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        apiBaseUrl: s<string, string, "defined">;
        tokenUrl: s<string, string, "defined">;
        credentials: s<Schemastery.ObjectS<NoInfer<{
            clientIdRef: s<string, string, "defined">;
            clientSecretRef: s<string, string, "defined">;
        }>>, Schemastery.ObjectT<NoInfer<{
            clientIdRef: s<string, string, "defined">;
            clientSecretRef: s<string, string, "defined">;
        }>>, "defined">;
        oauth: s<Schemastery.ObjectS<NoInfer<{
            clientAuthMethod: s<"body" | "basic", "body" | "basic", "defined">;
            scope: s<string, string, "plain">;
            audience: s<string, string, "plain">;
            refreshSkewMs: s<number, number, "plain">;
            refreshJitterRatio: s<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            clientAuthMethod: s<"body" | "basic", "body" | "basic", "defined">;
            scope: s<string, string, "plain">;
            audience: s<string, string, "plain">;
            refreshSkewMs: s<number, number, "plain">;
            refreshJitterRatio: s<number, number, "plain">;
        }>>, "defined">;
        network: s<Schemastery.ObjectS<NoInfer<{
            proxyMode: s<"environment" | "direct" | "url", "environment" | "direct" | "url", "plain">;
            proxyUrl: s<string, string, "plain">;
            caFile: s<string, string, "plain">;
            connectTimeoutMs: s<number, number, "plain">;
            authTimeoutMs: s<number, number, "plain">;
            requestTimeoutMs: s<number, number, "plain">;
            streamIdleTimeoutMs: s<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            proxyMode: s<"environment" | "direct" | "url", "environment" | "direct" | "url", "plain">;
            proxyUrl: s<string, string, "plain">;
            caFile: s<string, string, "plain">;
            connectTimeoutMs: s<number, number, "plain">;
            authTimeoutMs: s<number, number, "plain">;
            requestTimeoutMs: s<number, number, "plain">;
            streamIdleTimeoutMs: s<number, number, "plain">;
        }>>, "plain">;
        allowedDeploymentOrigins: s<string[], string[], "plain">;
        allowInsecureLocalhost: s<boolean, boolean, "plain">;
    }>>, string>>, "volatile-defined">;
    providers: s<NoInfer<import("@deepseek-ai/cosmokit").Dict<{
        instance?: string | null | undefined;
        displayName?: string | null | undefined;
        resourceGroup?: string | null | undefined;
        protocol?: "openai-chat-completions" | null | undefined;
        apiVersion?: string | null | undefined;
        inferencePath?: string | null | undefined;
        headers?: import("@deepseek-ai/cosmokit").Dict<string, string> | null | undefined;
        models?: ({
            id?: string | null | undefined;
            name?: string | null | undefined;
            upstreamModel?: string | null | undefined;
            deployment?: ({
                id?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | ({
                selector?: ({
                    scenario?: string | null | undefined;
                    model?: string | null | undefined;
                    version?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
                cacheTtlMs?: number | null | undefined;
                maxPages?: number | null | undefined;
                pageSize?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            mode?: "streaming" | "buffered" | null | undefined;
            capabilities?: ({
                streaming?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                parallelToolCalls?: boolean | null | undefined;
                temperature?: boolean | null | undefined;
                stop?: boolean | null | undefined;
                reasoningContent?: boolean | null | undefined;
                evidence?: ({
                    status?: "verified" | "experimental" | null | undefined;
                    reference?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            compatibility?: ({
                systemRole?: "system" | "developer" | null | undefined;
                developerRole?: "system" | "developer" | "reject" | null | undefined;
                maxTokensField?: "max_tokens" | "max_completion_tokens" | "unsupported" | null | undefined;
                includeUsage?: boolean | null | undefined;
                reasoningField?: "reasoning_content" | "reasoning" | null | undefined;
                replayReasoning?: boolean | null | undefined;
                parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                reasoningEfforts?: import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string> | null | undefined;
                defaultReasoningEffort?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            contextWindow?: number | null | undefined;
            maxOutputTokens?: number | null | undefined;
            defaultMaxTokens?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[] | null | undefined;
        retryPolicy?: ({
            maxRetries?: number | null | undefined;
            initialDelayMs?: number | null | undefined;
            maxDelayMs?: number | null | undefined;
            jitterRatio?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
        authRecovery?: boolean | null | undefined;
    } & import("@deepseek-ai/cosmokit").Dict, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
        instance: s<string, string, "defined">;
        displayName: s<string, string, "plain">;
        resourceGroup: s<string, string, "defined">;
        protocol: s<"openai-chat-completions", "openai-chat-completions", "defined">;
        apiVersion: s<string, string, "plain">;
        inferencePath: s<string, string, "plain">;
        headers: s<import("@deepseek-ai/cosmokit").Dict<string, string>, import("@deepseek-ai/cosmokit").Dict<string, string>, "plain">;
        models: s<({
            id?: string | null | undefined;
            name?: string | null | undefined;
            upstreamModel?: string | null | undefined;
            deployment?: ({
                id?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | ({
                selector?: ({
                    scenario?: string | null | undefined;
                    model?: string | null | undefined;
                    version?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
                cacheTtlMs?: number | null | undefined;
                maxPages?: number | null | undefined;
                pageSize?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            mode?: "streaming" | "buffered" | null | undefined;
            capabilities?: ({
                streaming?: boolean | null | undefined;
                tools?: boolean | null | undefined;
                parallelToolCalls?: boolean | null | undefined;
                temperature?: boolean | null | undefined;
                stop?: boolean | null | undefined;
                reasoningContent?: boolean | null | undefined;
                evidence?: ({
                    status?: "verified" | "experimental" | null | undefined;
                    reference?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            compatibility?: ({
                systemRole?: "system" | "developer" | null | undefined;
                developerRole?: "system" | "developer" | "reject" | null | undefined;
                maxTokensField?: "max_tokens" | "max_completion_tokens" | "unsupported" | null | undefined;
                includeUsage?: boolean | null | undefined;
                reasoningField?: "reasoning_content" | "reasoning" | null | undefined;
                replayReasoning?: boolean | null | undefined;
                parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                reasoningEfforts?: import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string> | null | undefined;
                defaultReasoningEffort?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
            contextWindow?: number | null | undefined;
            maxOutputTokens?: number | null | undefined;
            defaultMaxTokens?: number | null | undefined;
        } & import("@deepseek-ai/cosmokit").Dict)[], Schemastery.ObjectT<NoInfer<{
            id: s<string, string, "defined">;
            name: s<string, string, "plain">;
            upstreamModel: s<string, string, "defined">;
            deployment: s<({
                id?: string | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict) | ({
                selector?: ({
                    scenario?: string | null | undefined;
                    model?: string | null | undefined;
                    version?: string | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict) | null | undefined;
                cacheTtlMs?: number | null | undefined;
                maxPages?: number | null | undefined;
                pageSize?: number | null | undefined;
            } & import("@deepseek-ai/cosmokit").Dict), Schemastery.ObjectT<NoInfer<{
                id: s<string, string, "defined">;
            }>> | Schemastery.ObjectT<NoInfer<{
                selector: s<Schemastery.ObjectS<NoInfer<{
                    scenario: s<string, string, "defined">;
                    model: s<string, string, "defined">;
                    version: s<string, string, "plain">;
                }>>, Schemastery.ObjectT<NoInfer<{
                    scenario: s<string, string, "defined">;
                    model: s<string, string, "defined">;
                    version: s<string, string, "plain">;
                }>>, "defined">;
                cacheTtlMs: s<number, number, "plain">;
                maxPages: s<number, number, "plain">;
                pageSize: s<number, number, "plain">;
            }>>, "defined">;
            mode: s<"streaming" | "buffered", "streaming" | "buffered", "plain">;
            capabilities: s<Schemastery.ObjectS<NoInfer<{
                streaming: s<boolean, boolean, "plain">;
                tools: s<boolean, boolean, "plain">;
                parallelToolCalls: s<boolean, boolean, "plain">;
                temperature: s<boolean, boolean, "plain">;
                stop: s<boolean, boolean, "plain">;
                reasoningContent: s<boolean, boolean, "plain">;
                evidence: s<Schemastery.ObjectS<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, Schemastery.ObjectT<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, "defined">;
            }>>, Schemastery.ObjectT<NoInfer<{
                streaming: s<boolean, boolean, "plain">;
                tools: s<boolean, boolean, "plain">;
                parallelToolCalls: s<boolean, boolean, "plain">;
                temperature: s<boolean, boolean, "plain">;
                stop: s<boolean, boolean, "plain">;
                reasoningContent: s<boolean, boolean, "plain">;
                evidence: s<Schemastery.ObjectS<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, Schemastery.ObjectT<NoInfer<{
                    status: s<"verified" | "experimental", "verified" | "experimental", "defined">;
                    reference: s<string, string, "defined">;
                }>>, "defined">;
            }>>, "defined">;
            compatibility: s<Schemastery.ObjectS<NoInfer<{
                systemRole: s<"system" | "developer", "system" | "developer", "plain">;
                developerRole: s<"system" | "developer" | "reject", "system" | "developer" | "reject", "plain">;
                maxTokensField: s<"max_tokens" | "max_completion_tokens" | "unsupported", "max_tokens" | "max_completion_tokens" | "unsupported", "plain">;
                includeUsage: s<boolean, boolean, "plain">;
                reasoningField: s<"reasoning_content" | "reasoning", "reasoning_content" | "reasoning", "plain">;
                replayReasoning: s<boolean, boolean, "plain">;
                parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "plain">;
                reasoningEfforts: s<import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
                    name: s<string, string, "defined">;
                    parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "defined">;
                }>>, string>, "plain">;
                defaultReasoningEffort: s<string, string, "plain">;
            }>>, Schemastery.ObjectT<NoInfer<{
                systemRole: s<"system" | "developer", "system" | "developer", "plain">;
                developerRole: s<"system" | "developer" | "reject", "system" | "developer" | "reject", "plain">;
                maxTokensField: s<"max_tokens" | "max_completion_tokens" | "unsupported", "max_tokens" | "max_completion_tokens" | "unsupported", "plain">;
                includeUsage: s<boolean, boolean, "plain">;
                reasoningField: s<"reasoning_content" | "reasoning", "reasoning_content" | "reasoning", "plain">;
                replayReasoning: s<boolean, boolean, "plain">;
                parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "plain">;
                reasoningEfforts: s<import("@deepseek-ai/cosmokit").Dict<{
                    name?: string | null | undefined;
                    parameters?: import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string> | null | undefined;
                } & import("@deepseek-ai/cosmokit").Dict, string>, import("@deepseek-ai/cosmokit").Dict<Schemastery.ObjectT<NoInfer<{
                    name: s<string, string, "defined">;
                    parameters: s<import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, import("@deepseek-ai/cosmokit").Dict<string | number | boolean, string>, "defined">;
                }>>, string>, "plain">;
                defaultReasoningEffort: s<string, string, "plain">;
            }>>, "plain">;
            contextWindow: s<number, number, "plain">;
            maxOutputTokens: s<number, number, "plain">;
            defaultMaxTokens: s<number, number, "plain">;
        }>>[], "defined">;
        retryPolicy: s<Schemastery.ObjectS<NoInfer<{
            maxRetries: s<number, number, "plain">;
            initialDelayMs: s<number, number, "plain">;
            maxDelayMs: s<number, number, "plain">;
            jitterRatio: s<number, number, "plain">;
        }>>, Schemastery.ObjectT<NoInfer<{
            maxRetries: s<number, number, "plain">;
            initialDelayMs: s<number, number, "plain">;
            maxDelayMs: s<number, number, "plain">;
            jitterRatio: s<number, number, "plain">;
        }>>, "plain">;
        authRecovery: s<boolean, boolean, "plain">;
    }>>, string>>, "volatile-defined">;
}>>, "plain">;
export type PluginConfig = ReturnType<typeof Config>;
