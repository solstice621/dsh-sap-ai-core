import type { Phase } from '../diagnostics/errors.js';
/** Race an uncancellable public credential operation without abandoning its rejection handler. */
export declare function waitFor<T>(promise: Promise<T>, signal?: AbortSignal, phase?: Phase): Promise<T>;
export declare class RequestScope {
    readonly controller: AbortController;
    readonly signal: AbortSignal;
    private readonly timer?;
    private readonly removers;
    constructor(signals: (AbortSignal | undefined)[], timeoutMs?: number, phase?: Phase);
    read<T>(operation: Promise<T>, idleMs: number, phase?: Phase): Promise<T>;
    dispose(): void;
}
