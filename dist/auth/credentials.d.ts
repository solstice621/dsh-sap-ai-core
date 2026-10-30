import type { CredentialProvider, CredentialInfo } from '@deepseek-ai/dsh-credentials';
import type { ModelRoute } from '../config.js';
export type CredentialAccess = Pick<CredentialProvider, 'resolve' | 'describe'>;
export interface CredentialSnapshot {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly key: string;
    readonly sources: readonly string[];
}
export declare class CredentialResolver {
    private readonly credentials;
    private readonly salt;
    constructor(credentials: CredentialAccess);
    resolve(route: ModelRoute, signal?: AbortSignal): Promise<CredentialSnapshot>;
    describe(route: ModelRoute, signal?: AbortSignal): Promise<readonly CredentialInfo[]>;
}
