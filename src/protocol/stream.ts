import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { StreamChunk, FinishReason, TokenUsage } from '@deepseek-ai/dsh-llm';
import { createParser } from 'eventsource-parser';
import type { EventSourceMessage } from 'eventsource-parser';
import type { ModelRoute } from '../config.js';
import { SapAiCoreError, checkAbort, safeError } from '../diagnostics/errors.js';
import type { HttpReply } from '../transport/http.js';
import { mapUsage } from './usage.js';
import { replayState } from './replay.js';

type TextState = { kind: 'text' | 'reasoning'; index: number; parts: string[] };
type ToolState = { kind: 'tool-call'; index: number; id?: string; name: string; parts: string[]; pending: string[] };
type BlockState = TextState | ToolState;

function protocol(reason: string): never { throw new SapAiCoreError('PROTOCOL', 'stream', reason); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return protocol('expected an object in stream');
  return value as Record<string, unknown>;
}
function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return protocol('invalid string delta');
  return value;
}

export class ChatStreamTranslator {
  private readonly blocks: BlockState[] = [];
  private readonly tools = new Map<number, ToolState>();
  private text?: TextState;
  private reasoning?: TextState;
  private finishReason?: FinishReason;
  private usage?: TokenUsage;
  private usageEmitted = false;
  private ended = false;
  private bytes = 0;
  private responseId?: string;
  private responseModel?: string;
  constructor(private readonly route: ModelRoute) {}

  takeUsage(): StreamChunk[] {
    if (!this.usage || this.usageEmitted) return [];
    this.usageEmitted = true;
    return [{ type: 'usage', usage: this.usage }];
  }

  private account(text: string): void {
    this.bytes += Buffer.byteLength(text);
    if (this.bytes > 16 * 1024 * 1024) protocol('response content exceeds 16 MiB limit');
  }

  accept(raw: unknown): StreamChunk[] {
    if (this.ended) return protocol('event after terminal marker');
    const event = object(raw);
    if (event.error !== undefined) throw new SapAiCoreError('PROVIDER_ERROR', 'stream', 'upstream in-band error');
    for (const field of ['id', 'model'] as const) {
      const value = optionalString(event[field]);
      const previous = field === 'id' ? this.responseId : this.responseModel;
      if (previous !== undefined && value !== undefined && value !== previous) protocol('response identity changed during stream');
      if (field === 'id') this.responseId = value ?? previous; else this.responseModel = value ?? previous;
    }
    const usage = mapUsage(event.usage);
    if (usage) this.usage = usage; // Cumulative snapshots, not additive billing.
    if (!Array.isArray(event.choices)) protocol('missing choices array');
    if (event.choices.length === 0) return [];
    if (event.choices.length !== 1) protocol('multiple completion choices are unsupported');
    const choice = object(event.choices[0]);
    if (choice.index !== 0) protocol('unexpected completion choice index');
    const delta = object(choice.delta);
    if (delta.role !== undefined && delta.role !== 'assistant') protocol('unexpected response role');
    const out: StreamChunk[] = [];
    if (this.finishReason && Object.entries(delta).some(([key, value]) => key !== 'role' && value !== null && value !== undefined && value !== '')) protocol('content after finish_reason');
    const recognized = new Set(['role', 'content', 'tool_calls', this.route.model.compatibility.reasoningField]);
    for (const [key, value] of Object.entries(delta)) {
      if (!recognized.has(key) && value !== null && value !== undefined && value !== '') protocol('unsupported response delta field');
    }
    // Keep the upstream ordering of distinct delta fields within an event.
    for (const [key, value] of Object.entries(delta)) {
      if (key === 'content' || key === this.route.model.compatibility.reasoningField) {
        const text = optionalString(value);
        if (!text) continue;
        const kind = key === 'content' ? 'text' : 'reasoning';
        if (kind === 'reasoning' && !this.route.model.capabilities.reasoningContent) protocol('reasoning was not declared for this route');
        this.account(text);
        let state = kind === 'text' ? this.text : this.reasoning;
        if (!state) {
          state = { kind, index: this.blocks.length, parts: [] }; this.blocks.push(state);
          if (kind === 'text') this.text = state; else this.reasoning = state;
          out.push({ type: 'block-start', index: state.index, blockType: kind });
        }
        state.parts.push(text);
        out.push({ type: kind === 'text' ? 'text-delta' : 'reasoning-delta', index: state.index, text });
      } else if (key === 'tool_calls' && value !== null && value !== undefined) {
        if (!this.route.model.capabilities.tools || !Array.isArray(value)) protocol('unexpected tool calls');
        for (const item of value) {
          const call = object(item);
          if (!Number.isSafeInteger(call.index) || (call.index as number) < 0 || (call.index as number) > 127) protocol('invalid tool-call index');
          if (call.type !== undefined && call.type !== 'function') protocol('unsupported tool-call type');
          let state = this.tools.get(call.index as number);
          if (!state) {
            if (this.tools.size && !this.route.model.capabilities.parallelToolCalls) protocol('parallel tool calls were not declared for this route');
            state = { kind: 'tool-call', index: this.blocks.length, name: '', parts: [], pending: [] };
            this.tools.set(call.index as number, state); this.blocks.push(state);
            out.push({ type: 'block-start', index: state.index, blockType: 'tool-call' });
          }
          const id = optionalString(call.id);
          if (id) {
            if (state.id && state.id !== id) protocol('tool-call ID changed');
            if (id.length > 256 || /[\u0000-\u0020\u007f]/.test(id)) protocol('invalid tool-call ID');
            state.id = id;
          }
          const fn = call.function === undefined ? {} : object(call.function);
          const name = optionalString(fn.name);
          const args = optionalString(fn.arguments);
          if (name) { this.account(name); state.name += name; }
          if (args !== undefined) { this.account(args); state.parts.push(args); state.pending.push(args); }
          if (state.id) {
            if (state.pending.length === 0 && name) state.pending.push('');
            for (const part of state.pending.splice(0)) out.push({ type: 'tool-call-delta', index: state.index, id: ToolCallId(state.id), ...(state.name ? { name: state.name } : {}), argumentsDelta: part });
          }
        }
      }
    }
    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      if (this.finishReason) protocol('duplicate finish_reason');
      switch (choice.finish_reason) {
        case 'stop': this.finishReason = { kind: 'stop' }; break;
        case 'tool_calls': this.finishReason = { kind: 'tool-calls' }; break;
        case 'length': this.finishReason = { kind: 'max-tokens' }; break;
        case 'content_filter': throw new SapAiCoreError('CONTENT_FILTER', 'stream', 'upstream content filter ended the response');
        default: protocol('unknown finish_reason');
      }
    }
    return out;
  }

  finish(): StreamChunk[] {
    if (this.ended || !this.finishReason) return protocol('missing or repeated stream completion');
    this.ended = true;
    if (!this.blocks.length) protocol('empty completion');
    if (this.finishReason.kind === 'tool-calls' && !this.tools.size) protocol('tool finish without tool calls');
    if (this.tools.size && this.finishReason.kind !== 'tool-calls') protocol('tool calls without a tool finish');
    const out: StreamChunk[] = [];
    const ids = new Set<string>();
    for (const state of this.blocks) {
      if (state.kind === 'tool-call') {
        if (!state.id || ids.has(state.id) || !/^[A-Za-z0-9_-]{1,64}$/.test(state.name)) protocol('missing or duplicate tool ID/name');
        ids.add(state.id);
        const args = state.parts.join('');
        let parsed: unknown;
        try { parsed = JSON.parse(args); } catch { return protocol('incomplete tool arguments'); }
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) protocol('tool arguments must be a JSON object');
        out.push({ type: 'block-end', index: state.index, block: { type: 'tool-call', id: ToolCallId(state.id), name: state.name, arguments: args } });
      } else out.push({ type: 'block-end', index: state.index, block: { type: state.kind, text: state.parts.join('') } });
    }
    out.push(...this.takeUsage());
    const replay = replayState(this.route, this.reasoning?.parts.join('') ?? '');
    out.push({ type: 'finish', reason: this.finishReason, ...(replay === undefined ? {} : { replayState: replay }) });
    return out;
  }
}

export async function* streamReply(reply: HttpReply, route: ModelRoute): AsyncGenerator<StreamChunk> {
  const { response, scope } = reply;
  if (!/^text[/]event-stream(?:;|$)/i.test(response.headers.get('content-type') ?? '')) protocol('expected text/event-stream; buffered JSON is not streaming');
  if (!response.body) protocol('missing SSE body');
  const translator = new ChatStreamTranslator(route);
  const pending: EventSourceMessage[] = [];
  let pendingBytes = 0;
  const parser = createParser({
    onEvent(event) {
      if (Buffer.byteLength(event.data) > 2 * 1024 * 1024) protocol('SSE event exceeds 2 MiB');
      pending.push(event); pendingBytes = 0;
    },
    onComment() { pendingBytes = 0; },
    onError() { protocol('invalid SSE field'); },
  });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const reader = response.body.getReader();
  try {
    while (true) {
      const item = await scope.read(reader.read(), route.instance.network.streamIdleTimeoutMs);
      checkAbort(scope.signal, 'stream');
      if (item.done) protocol('stream ended before [DONE]');
      pendingBytes += item.value.byteLength;
      if (pendingBytes > 2 * 1024 * 1024) protocol('unterminated SSE event exceeds size limit');
      let text: string;
      try { text = decoder.decode(item.value, { stream: true }); } catch { return protocol('invalid UTF-8 stream'); }
      parser.feed(text);
      for (const event of pending.splice(0)) {
        if (event.event === 'error') throw new SapAiCoreError('PROVIDER_ERROR', 'stream', 'upstream in-band error');
        if (event.event && event.event !== 'message') protocol('unsupported SSE event type');
        if (!event.data.trim()) continue;
        if (event.data.trim() === '[DONE]') {
          for (const chunk of translator.finish()) { checkAbort(scope.signal, 'stream'); yield chunk; }
          return;
        }
        let data: unknown;
        try { data = JSON.parse(event.data); } catch { return protocol('invalid JSON in SSE event'); }
        for (const chunk of translator.accept(data)) { checkAbort(scope.signal, 'stream'); yield chunk; }
      }
    }
  } catch (error) {
    // Preserve already authoritative attempt usage on a failed stream. DSH then
    // normalizes the thrown error into its single failure finish.
    if (!scope.signal.aborted) for (const chunk of translator.takeUsage()) yield chunk;
    throw safeError(error, 'stream', scope.signal);
  }
  finally {
    scope.controller.abort();
    await reader.cancel().catch(() => {}); reader.releaseLock();
    await reply.close();
  }
}

/** One full response in explicit buffered mode; never counted as real streaming. */
export function bufferedReply(raw: unknown, route: ModelRoute): StreamChunk[] {
  const data = object(raw);
  if (data.error !== undefined) throw new SapAiCoreError('PROVIDER_ERROR', 'inference', 'upstream in-band error');
  if (!Array.isArray(data.choices) || data.choices.length !== 1) protocol('invalid buffered choices');
  const choice = object(data.choices[0]);
  const message = object(choice.message);
  const calls = message.tool_calls;
  const delta = { ...message, ...(Array.isArray(calls) ? { tool_calls: calls.map((value, index) => ({ ...object(value), index })) } : {}) };
  const translator = new ChatStreamTranslator(route);
  const chunks = translator.accept({ ...data, choices: [{ index: 0, delta, finish_reason: choice.finish_reason }] });
  return [...chunks, ...translator.finish()];
}
