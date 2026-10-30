import type { ModelRoute } from '../config.js';
export declare function inferenceUrl(route: ModelRoute, deploymentId: string, discoveredUrl?: string): URL;
export declare function providerHeaders(route: ModelRoute, token: string, requestId: string, stream?: boolean): Record<string, string>;
