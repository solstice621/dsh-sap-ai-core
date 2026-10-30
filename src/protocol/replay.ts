import { createHash } from 'node:crypto';
import type { ReplayEnvelope, RequestMessage } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
import { SapAiCoreError } from '../diagnostics/errors.js';

function identity(route: ModelRoute): string {
  return createHash('sha256').update(JSON.stringify([
    route.instanceId, route.instance.apiBaseUrl, route.providerId, route.provider.resourceGroup,
    route.provider.apiVersion, route.model.id, route.model.upstreamModel, route.model.deployment, route.model.compatibility,
  ])).digest('hex');
}

export function replayState(route: ModelRoute, reasoning: string): ReplayEnvelope | undefined {
  if (!route.model.compatibility.replayReasoning || !reasoning) return undefined;
  return { response: { format: 'sap-ai-core/chat/v1', identity: identity(route), reasoning } };
}

export function restoreReasoning(message: RequestMessage, route: ModelRoute): string | undefined {
  if (!route.model.compatibility.replayReasoning || message.role !== 'assistant') return undefined;
  if (message.source.provider !== route.providerId || message.source.model !== route.model.id) return undefined;
  const envelope = message.source.replayState as Partial<ReplayEnvelope> | undefined;
  const data = envelope?.response as Record<string, unknown> | undefined;
  if (!data || data.format !== 'sap-ai-core/chat/v1' || data.identity !== identity(route)) return undefined;
  if (typeof data.reasoning !== 'string') throw new SapAiCoreError('INVALID_REPLAY', 'inference', 'invalid native reasoning replay');
  return data.reasoning;
}
