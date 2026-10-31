import type { ModelRoute } from '../config.js';
import { SapAiCoreError } from '../diagnostics/errors.js';
import type { WireRequest } from './request.js';

/** One shared SAP deployment selects the requested model in each immutable body. */
export function encodeRequest(body: WireRequest, route: ModelRoute): unknown {
  if (route.provider.protocol !== 'sap-orchestration-v2') return body;
  const { model, messages, stream, ...params } = body;
  return {
    // History is literal. User text and tool JSON must never become prompt templates.
    messages_history: messages.map(({ content, ...message }) => {
      // SAP accepts omitted content for a tool-call message, but rejects null.
      return {
        ...message,
        ...(message.role === 'assistant' && content === null && message.tool_calls?.length ? {} : { content }),
        ...(message.reasoning_content === undefined ? {} : { reasoning_content: [{ content: message.reasoning_content }] }),
      };
    }),
    config: {
      modules: { prompt_templating: { model: {
        name: model,
        ...(route.model.upstreamModelVersion === undefined ? {} : { version: route.model.upstreamModelVersion }),
        params,
        // The SAP service defaults to two model retries. DSH owns that budget.
        max_retries: 0,
      } } },
      ...(stream ? { stream: { enabled: true, chunk_size: 1 } } : {}),
    },
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SapAiCoreError('PROTOCOL', 'stream', 'invalid Orchestration response');
  return value as Record<string, unknown>;
}

function reasoningMessage(value: unknown): unknown {
  const message = object(value);
  if (!Array.isArray(message.reasoning_content)) return message;
  const text = message.reasoning_content.map(raw => {
    const block = object(raw);
    // Signed or opaque reasoning requires a different replay contract.
    if ((block.signature !== undefined && block.signature !== null && block.signature !== '') || Object.keys(block).some(key => key !== 'content' && key !== 'signature')) {
      throw new SapAiCoreError('UNSUPPORTED_OPTION', 'stream', 'signed or opaque Orchestration reasoning is unsupported');
    }
    if (block.content !== undefined && typeof block.content !== 'string') throw new SapAiCoreError('PROTOCOL', 'stream', 'invalid Orchestration reasoning content');
    return block.content ?? '';
  }).join('');
  return { ...message, reasoning_content: text };
}

/** Strip only the SAP envelope; all deltas and billing use the existing translator. */
export function responseProjection(route: ModelRoute): (value: unknown) => unknown {
  if (route.provider.protocol !== 'sap-orchestration-v2') return value => value;
  let requestId: string | undefined;
  return value => {
    const envelope = object(value);
    if (envelope.error !== undefined || (typeof envelope.code === 'number' && envelope.code >= 400)) {
      throw new SapAiCoreError('PROVIDER_ERROR', 'stream', 'Orchestration returned an in-band error');
    }
    if (envelope.intermediate_failures !== undefined && (!Array.isArray(envelope.intermediate_failures) || envelope.intermediate_failures.length)) {
      throw new SapAiCoreError('PROVIDER_ERROR', 'stream', 'unexpected Orchestration fallback or module failure');
    }
    if (typeof envelope.request_id !== 'string' || !envelope.request_id || (requestId !== undefined && envelope.request_id !== requestId)) {
      throw new SapAiCoreError('PROTOCOL', 'stream', 'missing or changed Orchestration request identity');
    }
    requestId = envelope.request_id;
    if (envelope.final_result === undefined) {
      object(envelope.intermediate_results);
      return undefined;
    }
    const result = object(envelope.final_result);
    if (result.model !== undefined && result.model !== '' && result.model !== route.model.upstreamModel) {
      throw new SapAiCoreError('PROTOCOL', 'stream', 'Orchestration returned a different model');
    }
    // The templating prelude contains empty model/id fields before the first LLM delta.
    // Intermediate LLM results duplicate final_result; consume final_result only.
    const { id, model, ...rest } = result;
    return {
      ...rest, ...(id === '' ? {} : { id }), ...(model === '' ? {} : { model }),
      ...(Array.isArray(rest.choices) ? { choices: rest.choices.map(raw => {
        const choice = object(raw);
        return { ...choice,
          ...(choice.delta === undefined ? {} : { delta: reasoningMessage(choice.delta) }),
          ...(choice.message === undefined ? {} : { message: reasoningMessage(choice.message) }),
        };
      }) } : {}),
    };
  };
}
