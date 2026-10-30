import { LlmError, ProviderRequestId } from '@deepseek-ai/dsh-llm';

export type Phase = 'config' | 'credentials' | 'auth' | 'deployment' | 'inference' | 'stream';
export interface ErrorFacts {
  status?: number;
  requestId?: string;
  upstreamRequestId?: string;
  providerRetryAfterMs?: number;
}

/** Only locally authored reasons enter errors. Never retain an upstream body/cause. */
export class SapAiCoreError extends LlmError {
  readonly phase: Phase;
  readonly reason: string;
  readonly upstreamRequestId?: string;

  constructor(code: string, phase: Phase, reason: string, facts: ErrorFacts = {}) {
    super(`SAP AI Core ${phase}: ${reason}`, code, {
      ...(facts.status === undefined ? {} : { status: facts.status }),
      ...(facts.requestId === undefined ? {} : { requestId: ProviderRequestId(facts.requestId) }),
      ...(facts.providerRetryAfterMs === undefined ? {} : { providerRetryAfterMs: facts.providerRetryAfterMs }),
    });
    this.name = 'SapAiCoreError';
    this.phase = phase;
    this.reason = reason;
    this.upstreamRequestId = facts.upstreamRequestId;
  }
}

export function aborted(phase: Phase = 'inference'): SapAiCoreError {
  return new SapAiCoreError('ABORTED', phase, 'operation canceled');
}

export function checkAbort(signal?: AbortSignal, phase: Phase = 'inference'): void {
  if (signal?.aborted) {
    if (signal.reason instanceof SapAiCoreError) throw signal.reason;
    throw aborted(phase);
  }
}

export function safeError(error: unknown, phase: Phase, signal?: AbortSignal): SapAiCoreError {
  if (error instanceof SapAiCoreError) return error;
  if (signal?.aborted) {
    return signal.reason instanceof SapAiCoreError ? signal.reason : aborted(phase);
  }
  const codes = new Set<string>();
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === 'object'; i++) {
    const e = current as { code?: unknown; cause?: unknown };
    if (typeof e.code === 'string') codes.add(e.code);
    current = e.cause;
  }
  if (['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT'].some(c => codes.has(c))) {
    return new SapAiCoreError('TIMEOUT', phase, 'network timeout');
  }
  if (['ENOTFOUND', 'EAI_AGAIN'].some(c => codes.has(c))) return new SapAiCoreError('TRANSPORT', phase, 'DNS lookup failed');
  if (['CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].some(c => codes.has(c))) {
    return new SapAiCoreError('TRANSPORT', phase, 'TLS certificate validation failed');
  }
  if (codes.has('UND_ERR_PRX_TLS') || codes.has('UND_ERR_PROXY')) return new SapAiCoreError('TRANSPORT', phase, 'proxy connection failed');
  return new SapAiCoreError('TRANSPORT', phase, 'network operation failed');
}

export function retryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const delay = /^\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) && delay > 0 ? delay : undefined;
}

export function httpError(status: number, phase: Phase, facts: ErrorFacts): SapAiCoreError {
  const code = status === 401 || status === 403 ? 'AUTH'
    : status === 402 ? 'QUOTA'
      : status === 429 ? 'RATE_LIMIT'
        : status >= 500 ? 'SERVER'
          : status >= 300 && status < 400 ? 'REDIRECT_REJECTED'
            : status === 404 || status === 410 ? 'DEPLOYMENT_NOT_READY' : 'INVALID_REQUEST';
  return new SapAiCoreError(code, phase, status === 403 ? 'permission denied' : `HTTP ${status}`, { ...facts, status });
}
