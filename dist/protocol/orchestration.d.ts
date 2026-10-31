import type { ModelRoute } from '../config.js';
import type { WireRequest } from './request.js';
/** One shared SAP deployment selects the requested model in each immutable body. */
export declare function encodeRequest(body: WireRequest, route: ModelRoute): unknown;
/** Strip only the SAP envelope; all deltas and billing use the existing translator. */
export declare function responseProjection(route: ModelRoute): (value: unknown) => unknown;
