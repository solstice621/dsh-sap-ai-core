import type { Response } from 'undici';
import type { Network } from '../config.js';
import type { ErrorFacts, Phase } from '../diagnostics/errors.js';
import { RequestScope } from './cancellation.js';
export interface ProxyEnvironment {
    httpProxy: string;
    httpsProxy: string;
    noProxy: string;
}
export declare function proxyEnvironment(env?: NodeJS.ProcessEnv): ProxyEnvironment;
export interface HttpReply {
    response: Response;
    scope: RequestScope;
    facts: ErrorFacts;
    close(): Promise<void>;
}
/** A request-scoped dispatcher. No global fetch/dispatcher/proxy changes, and no retries. */
export declare class HttpClient {
    private readonly dispatcher;
    readonly network: Network;
    private constructor();
    static open(network: Network, environment?: ProxyEnvironment): Promise<HttpClient>;
    request(url: URL, options: {
        phase: Phase;
        method?: 'GET' | 'POST';
        headers: Record<string, string>;
        body?: string;
        signal?: AbortSignal;
        requestId?: string;
    }): Promise<HttpReply>;
    close(): Promise<void>;
}
export declare function readJson(reply: HttpReply, phase: Phase, limit?: number): Promise<unknown>;
