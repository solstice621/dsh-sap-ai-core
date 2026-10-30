import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as forwardHttp } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { HttpClient, readJson } from '../../src/transport/http.js';
import { snapshotOf } from '../../src/config.js';
import { config, json, mockServer } from '../support/mock.js';

async function proxy() {
  let connections = 0;
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    connections++;
    const target = new URL(req.url!);
    if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) { res.writeHead(403); res.end(); return; }
    const upstream = forwardHttp({ hostname: '127.0.0.1', port: target.port, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: target.host }, agent: false }, incoming => { res.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(res); });
    upstream.on('error', () => { res.writeHead(502); res.end(); }); req.pipe(upstream);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('connect', (req, downstream, head) => {
    connections++;
    const target = new URL('http://' + req.url);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname)) { downstream.destroy(); return; }
    const upstream = connect(Number(target.port), '127.0.0.1');
    sockets.add(upstream); upstream.on('close', () => sockets.delete(upstream));
    upstream.once('connect', () => { downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); upstream.pipe(downstream); downstream.pipe(upstream); });
    upstream.on('error', () => downstream.destroy()); downstream.on('error', () => upstream.destroy());
    downstream.on('close', () => upstream.destroy());
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing proxy address');
  return { url: 'http://127.0.0.1:' + address.port, get connections() { return connections; }, async close() { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test('S-T18/S0: HTTP_PROXY, HTTPS_PROXY, port-specific NO_PROXY and trusted TLS use the intended network path', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-sap-tls-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const key = join(directory, 'key.pem'), cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const secure = createTlsServer({ key: await readFile(key), cert: await readFile(cert) }, (_req, res) => json(res, { secure: true }));
  secure.listen(0, '127.0.0.1'); await once(secure, 'listening');
  t.after(async () => { secure.closeAllConnections(); await new Promise<void>(resolve => secure.close(() => resolve())); });
  const address = secure.address(); if (!address || typeof address === 'string') throw new Error('missing TLS address');
  const tlsUrl = new URL('https://127.0.0.1:' + address.port);
  const plain = await mockServer((_req, res) => json(res, { secure: false })); t.after(() => plain.close());
  const httpProxy = await proxy(), httpsProxy = await proxy(); t.after(() => httpProxy.close()); t.after(() => httpsProxy.close());
  const keys = ['http_proxy', 'https_proxy', 'no_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'] as const;
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  t.after(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
  for (const key of keys) delete process.env[key];
  process.env.HTTP_PROXY = httpProxy.url; process.env.HTTPS_PROXY = httpsProxy.url; process.env.NO_PROXY = '';
  const settings = config(plain.origin); settings.instances.demo!.network = { proxyMode: 'environment', caFile: cert };
  const network = snapshotOf(settings).config.instances.demo!.network;
  const fetchIdentity = globalThis.fetch;
  async function get(url: URL) { const client = await HttpClient.open(network); try { return await readJson(await client.request(url, { phase: 'auth', headers: {} }), 'auth'); } finally { await client.close(); } }
  assert.deepEqual(await get(new URL(plain.origin)), { secure: false });
  assert.deepEqual(await get(tlsUrl), { secure: true });
  assert.equal(httpProxy.connections, 1); assert.equal(httpsProxy.connections, 1);
  process.env.NO_PROXY = '127.0.0.1:' + address.port;
  assert.deepEqual(await get(tlsUrl), { secure: true });
  assert.deepEqual(await get(new URL(plain.origin)), { secure: false });
  assert.equal(httpProxy.connections, 2); assert.equal(httpsProxy.connections, 1);
  assert.equal(globalThis.fetch, fetchIdentity);
  const untrusted = await HttpClient.open({ ...network, proxyMode: 'direct', caFile: undefined });
  try { await assert.rejects(() => untrusted.request(tlsUrl, { phase: 'auth', headers: {} }), { code: 'TRANSPORT', reason: 'TLS certificate validation failed' }); }
  finally { await untrusted.close(); }
});
