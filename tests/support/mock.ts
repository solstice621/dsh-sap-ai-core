import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import type { Socket } from 'node:net';
import type { Options } from '../../src/config.js';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { CredentialAccess } from '../../src/auth/credentials.js';

export interface Recorded { url: URL; method: string; headers: IncomingMessage['headers']; body: string }
export type Handler = (request: Recorded, response: ServerResponse, message: IncomingMessage) => void | Promise<void>;
export function json(response: ServerResponse, value: unknown, status = 200): void {
  response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value));
}
export function event(delta: Record<string, unknown> = {}, finish: string | null = null): object {
  return { id: 'synthetic-response', model: 'mock-model', choices: [{ index: 0, delta, finish_reason: finish }] };
}
export function sse(events: unknown[], done = true): string {
  return events.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join('') + (done ? 'data: [DONE]\n\n' : '');
}
export function textResponse(response: ServerResponse, text = '你好，世界', usage: unknown = { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 }): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(sse([event({ role: 'assistant', content: text }), event({}, 'stop'), { choices: [], usage }]));
}
export async function mockServer(handler?: Handler) {
  const requests: Recorded[] = [];
  const sockets = new Set<Socket>();
  let closedResponses = 0;
  const server = createServer(async (message, response) => {
    response.on('close', () => closedResponses++);
    try {
      const parts: Buffer[] = [];
      for await (const part of message) parts.push(Buffer.from(part));
      const request: Recorded = { url: new URL(message.url!, 'http://localhost'), method: message.method!, headers: message.headers, body: Buffer.concat(parts).toString() };
      requests.push(request);
      if (handler) await handler(request, response, message);
      else if (request.url.pathname === '/oauth/token') json(response, { access_token: 'synthetic-token', token_type: 'Bearer', expires_in: 60 });
      else textResponse(response);
    } catch { if (!response.headersSent) json(response, { error: 'mock failed' }, 500); else response.destroy(); }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('mock address missing');
  return {
    server, requests, origin: 'http://127.0.0.1:' + address.port,
    get sockets() { return sockets.size; }, get closedResponses() { return closedResponses; },
    get authRequests() { return requests.filter(r => r.url.pathname === '/oauth/token'); },
    get inferenceRequests() { return requests.filter(r => r.url.pathname.endsWith('/chat/completions')); },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

export function config(origin: string): Options {
  return {
    instances: { demo: { apiBaseUrl: origin, tokenUrl: origin + '/oauth/token', credentials: { clientIdRef: 'TEST_CLIENT_ID', clientSecretRef: 'TEST_CLIENT_SECRET' }, oauth: { clientAuthMethod: 'body', refreshJitterRatio: 0 }, allowInsecureLocalhost: true, network: { proxyMode: 'direct' } } },
    providers: { sap: { instance: 'demo', resourceGroup: 'default', protocol: 'openai-chat-completions', models: [{
      id: 'chat', upstreamModel: 'mock-model', deployment: { id: 'test-deployment' },
      capabilities: { streaming: true, tools: true, parallelToolCalls: true, reasoningContent: true, temperature: true, stop: true, evidence: { status: 'verified', reference: 'synthetic-contract-fixture' } },
      compatibility: { maxTokensField: 'max_tokens', includeUsage: true, developerRole: 'system' }, maxOutputTokens: 1024,
    }] } },
  };
}

export function credentialAccess() {
  const values = new Map<string, string>([['TEST_CLIENT_ID', 'synthetic-client'], ['TEST_CLIENT_SECRET', 'synthetic-secret']]);
  const access: CredentialAccess = {
    async resolve(ref) { const value = values.get(ref); return value === undefined ? undefined : { value, source: 'synthetic-memory' }; },
    async describe(ref) { return { configured: !!values.get(ref), writable: true, source: 'synthetic-memory' }; },
  };
  return { values, access };
}
export async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const result: StreamChunk[] = []; for await (const chunk of stream) result.push(chunk); return result;
}
export const request = () => ({ provider: 'sap', model: 'chat', maxTokens: 64, messages: [{ role: 'user' as const, content: [{ type: 'text' as const, text: '合成测试' }] }] });
export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void; let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject };
}
export async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) { if (Date.now() > end) throw new Error('condition not reached'); await new Promise(r => setTimeout(r, 5)); }
}
