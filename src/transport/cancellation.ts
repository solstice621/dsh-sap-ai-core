import { SapAiCoreError, aborted, checkAbort } from '../diagnostics/errors.js';
import type { Phase } from '../diagnostics/errors.js';

/** Race an uncancellable public credential operation without abandoning its rejection handler. */
export function waitFor<T>(promise: Promise<T>, signal?: AbortSignal, phase: Phase = 'credentials'): Promise<T> {
  // The operation may have been created just before the signal became aborted.
  // Its rejection must remain observed even when the preflight check throws.
  void promise.catch(() => {});
  checkAbort(signal, phase);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(signal.reason instanceof SapAiCoreError ? signal.reason : aborted(phase)); };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}

export class RequestScope {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly timer?: ReturnType<typeof setTimeout>;
  private readonly removers: (() => void)[] = [];

  constructor(signals: (AbortSignal | undefined)[], timeoutMs?: number, phase: Phase = 'inference') {
    for (const signal of signals) {
      if (!signal) continue;
      const abort = () => this.controller.abort(signal.reason instanceof SapAiCoreError ? signal.reason : aborted(phase));
      if (signal.aborted) abort();
      else { signal.addEventListener('abort', abort, { once: true }); this.removers.push(() => signal.removeEventListener('abort', abort)); }
    }
    if (timeoutMs !== undefined) {
      this.timer = setTimeout(() => this.controller.abort(new SapAiCoreError('TIMEOUT', phase, 'request deadline exceeded')), timeoutMs);
      this.timer.unref();
    }
  }

  async read<T>(operation: Promise<T>, idleMs: number, phase: Phase = 'stream'): Promise<T> {
    const timer = setTimeout(() => this.controller.abort(new SapAiCoreError('TIMEOUT', phase, 'stream idle timeout')), idleMs);
    timer.unref();
    try { return await waitFor(operation, this.signal, phase); } finally { clearTimeout(timer); }
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const remove of this.removers.splice(0)) remove();
  }
}
