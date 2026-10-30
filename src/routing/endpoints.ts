import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
import { validateUrl } from '../config.js';
import { SapAiCoreError } from '../diagnostics/errors.js';

export function inferenceUrl(route: ModelRoute, deploymentId: string, discoveredUrl?: string): URL {
  let base: URL;
  if (discoveredUrl) {
    base = validateUrl(discoveredUrl, route.instance.allowInsecureLocalhost);
    const allowed = new Set([new URL(route.instance.apiBaseUrl).origin, ...route.instance.allowedDeploymentOrigins]);
    if (!allowed.has(base.origin)) throw new SapAiCoreError('ROUTING', 'deployment', 'deployment origin is not allowlisted');
    if (/[/]chat[/]completions[/]?$/.test(base.pathname)) throw new SapAiCoreError('ROUTING', 'deployment', 'deploymentUrl must be the deployment root');
  } else {
    const path = route.provider.inferencePath.replace('{deploymentId}', encodeURIComponent(deploymentId));
    base = new URL(route.instance.apiBaseUrl + path);
  }
  base.pathname = base.pathname.replace(/[/]$/, '') + '/chat/completions';
  if (route.provider.apiVersion !== undefined) base.searchParams.set('api-version', route.provider.apiVersion);
  return base;
}

export function providerHeaders(route: ModelRoute, token: string, requestId: string, stream = false): Record<string, string> {
  return {
    ...route.provider.headers, ...attributionHeaders(),
    Authorization: `Bearer ${token}`, 'AI-Resource-Group': route.provider.resourceGroup,
    'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json',
    'X-Request-ID': requestId,
  };
}
