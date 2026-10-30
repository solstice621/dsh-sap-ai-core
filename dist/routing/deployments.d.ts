import type { ModelRoute } from '../config.js';
import type { TokenLease } from '../auth/token-manager.js';
import { HttpClient } from '../transport/http.js';
export interface DeploymentRoute {
    readonly id: string;
    readonly url: URL;
}
/** Model metadata comes from the validated foundation-models response, never configuration names. */
export declare function deploymentModel(value: unknown): {
    name?: string;
    version?: string;
};
export declare class DeploymentResolver {
    private readonly clock;
    private readonly cache;
    constructor(clock?: () => number);
    private key;
    invalidate(route: ModelRoute, lease: TokenLease): void;
    clear(): void;
    resolve(route: ModelRoute, lease: TokenLease, client: HttpClient, signal: AbortSignal, force?: boolean): Promise<DeploymentRoute>;
    checkExplicit(route: ModelRoute, lease: TokenLease, client: HttpClient, signal: AbortSignal): Promise<void>;
}
