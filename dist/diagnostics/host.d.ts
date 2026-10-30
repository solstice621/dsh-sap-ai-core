import { Context } from '@deepseek-ai/cordis';
export interface HostOptions {
    credentialsFile?: string;
    /** Reads exactly this file; imports values into memory, never into settings or process.env. */
    serviceKeyFile?: string;
    serviceKeyInstance?: string;
    environment?: Readonly<Record<string, string | undefined>>;
    agents?: boolean;
}
export declare function readConfigFile(path: string): Promise<unknown>;
/** Isolated headless DSH host. Only declared refs are taken from the inherited environment. */
export declare function createDiagnosticHost(input: unknown, options?: HostOptions): Promise<{
    ctx: Context;
    plugin: import("@deepseek-ai/cordis").Fiber & PromiseLike<import("@deepseek-ai/cordis").Fiber>;
    close: () => Promise<void>;
}>;
