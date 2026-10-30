import type { ModelRoute } from '../config.js';
import type { CredentialSnapshot } from './credentials.js';
import type { ProxyEnvironment } from '../transport/http.js';
export interface TokenLease {
    readonly key: string;
    readonly generation: number;
    readonly value: string;
    readonly expiresAt: number;
    readonly refreshAt: number;
}
export interface TokenStats {
    acquisitions: number;
    cacheHits: number;
    sharedWaits: number;
}
/** Single-flight refresh with independent waiter cancellation and generation-aware rejection. */
export declare class TokenManager {
    private readonly clock;
    private readonly random;
    private readonly cache;
    private readonly flights;
    private generation;
    private disposed;
    readonly stats: TokenStats;
    constructor(clock?: () => number, random?: () => number);
    get(route: ModelRoute, credentials: CredentialSnapshot, environment: ProxyEnvironment, signal?: AbortSignal): Promise<TokenLease>;
    invalidate(rejected: TokenLease): boolean;
    private acquire;
    close(): Promise<void>;
}
