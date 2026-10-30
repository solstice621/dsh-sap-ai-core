import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
import { SapAiCoreError } from '../diagnostics/errors.js';

export function unsupported(option: string): never {
  throw new SapAiCoreError('UNSUPPORTED_OPTION', 'inference', `${option} is not supported by this exact route/model`);
}

export function modelInfo(route: ModelRoute): LlmResolvedModelInfo {
  const { model } = route;
  const efforts = Object.entries(model.compatibility.reasoningEfforts);
  return {
    provider: route.providerId, id: model.id, name: model.name ?? model.id, inputModalities: ['text'],
    description: `${model.upstreamModel}; ${model.mode}; ${model.capabilities.evidence.status}`,
    ...(model.contextWindow === undefined ? {} : { context: { contextWindow: model.contextWindow } }),
    ...(model.defaultMaxTokens === undefined ? {} : { defaultMaxTokens: model.defaultMaxTokens }),
    ...(efforts.length === 0 ? {} : { reasoning: {
      efforts: efforts.map(([id, value]) => ({ id: ReasoningEffortId(id), name: value.name })),
      ...(model.compatibility.defaultReasoningEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(model.compatibility.defaultReasoningEffort) }),
    } }),
  };
}
