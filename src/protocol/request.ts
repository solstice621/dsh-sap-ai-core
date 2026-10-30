import { projectToolUpdates } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, RequestMessage, ToolCallBlock } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
import { SapAiCoreError } from '../diagnostics/errors.js';
import { unsupported } from './capabilities.js';
import { restoreReasoning } from './replay.js';

export interface WireMessage {
  role: string; content: string | null; tool_call_id?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  reasoning_content?: string; reasoning?: string;
}
export interface WireRequest {
  model: string; messages: WireMessage[]; stream: boolean; [key: string]: unknown;
}
const optionKeys = new Set(['provider', 'model', 'messages', 'system', 'tools', 'toolHistory', 'temperature', 'maxTokens', 'stop', 'reasoningEffort', 'signal', 'sessionId', 'purpose']);

function invalid(reason: string): never { throw new SapAiCoreError('INVALID_REQUEST', 'inference', reason); }
export function validateToolArguments(value: string): void {
  let object: unknown;
  try { object = JSON.parse(value); } catch { return invalid('tool arguments must contain complete JSON'); }
  if (object === null || typeof object !== 'object' || Array.isArray(object)) invalid('tool arguments must be a JSON object');
}

function messageToWire(message: RequestMessage, route: ModelRoute): WireMessage {
  let role: string = message.role;
  if (role === 'system') role = route.model.compatibility.systemRole;
  if (role === 'developer') {
    const strategy = route.model.compatibility.developerRole;
    if (strategy === 'reject') unsupported('developer role');
    role = strategy;
  }
  const text: string[] = [];
  const calls: ToolCallBlock[] = [];
  for (const block of message.content) {
    switch (block.type) {
      case 'text': text.push(block.text); break;
      case 'tool-call':
        if (message.role !== 'assistant' || !route.model.capabilities.tools) unsupported('tool-call history');
        validateToolArguments(block.arguments); calls.push(block); break;
      case 'reasoning':
        if (message.role !== 'assistant') unsupported('reasoning input');
        // Only tagged replay state, never a name heuristic, restores native reasoning.
        break;
      default: unsupported(block.type);
    }
  }
  const wire: WireMessage = { role, content: text.join('') };
  if (message.role === 'tool') {
    if (!route.model.capabilities.tools) unsupported('tool results');
    wire.tool_call_id = message.toolCallId;
  }
  if (calls.length) {
    wire.content = text.length ? text.join('') : null;
    wire.tool_calls = calls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }));
  }
  const reasoning = restoreReasoning(message, route);
  if (reasoning !== undefined) wire[route.model.compatibility.reasoningField] = reasoning;
  return wire;
}

export function buildRequest(options: GenerateOptions, route: ModelRoute): WireRequest {
  for (const key of Object.keys(options)) if (!optionKeys.has(key)) unsupported('unknown request option');
  if (options.provider !== route.providerId || options.model !== route.model.id) invalid('request does not match its captured route');
  const { model } = route;
  if (model.mode === 'streaming' && !model.capabilities.streaming) unsupported('streaming');
  const projected = projectToolUpdates(options.messages, options.tools, undefined, options.toolHistory);
  const messages: WireMessage[] = [];
  if (options.system !== undefined) messages.push({ role: model.compatibility.systemRole, content: options.system });
  messages.push(...projected.messages.map(message => messageToWire(message, route)));
  if (!messages.length) invalid('at least one message is required');
  const body: WireRequest = { ...model.compatibility.parameters, model: model.upstreamModel, messages, stream: model.mode === 'streaming' };
  if (body.stream && model.compatibility.includeUsage) body.stream_options = { include_usage: true };
  const max = options.maxTokens ?? model.defaultMaxTokens;
  if (max !== undefined) {
    if (model.compatibility.maxTokensField === 'unsupported') unsupported('maxTokens');
    if (!Number.isSafeInteger(max) || max < 1 || (model.maxOutputTokens !== undefined && max > model.maxOutputTokens)) invalid('maxTokens is outside the configured range');
    body[model.compatibility.maxTokensField] = max;
  }
  if (options.temperature !== undefined) {
    if (!model.capabilities.temperature) unsupported('temperature');
    if (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2) invalid('temperature is outside 0..2');
    body.temperature = options.temperature;
  }
  if (options.stop !== undefined) {
    if (!model.capabilities.stop) unsupported('stop');
    if (!options.stop.length || options.stop.length > 4 || options.stop.some(s => typeof s !== 'string' || !s.length)) invalid('stop must contain 1..4 nonempty strings');
    body.stop = [...options.stop];
  }
  const effort = options.reasoningEffort ?? model.compatibility.defaultReasoningEffort;
  if (effort !== undefined) {
    const setting = Object.hasOwn(model.compatibility.reasoningEfforts, effort) ? model.compatibility.reasoningEfforts[effort] : undefined;
    if (!setting) unsupported('reasoningEffort');
    Object.assign(body, setting.parameters);
  }
  if (projected.tools?.length) {
    if (!model.capabilities.tools) unsupported('tools');
    const names = new Set<string>();
    body.tools = projected.tools.map(tool => {
      if (tool.deferLoading) unsupported('deferred tools');
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(tool.name) || names.has(tool.name)) invalid('invalid or duplicate tool name');
      names.add(tool.name);
      return { type: 'function', function: { name: tool.name, description: tool.description, parameters: structuredClone(tool.parameters) } };
    });
  }
  return body;
}
