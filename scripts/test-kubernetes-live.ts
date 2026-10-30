import { mkdtemp, readFile, writeFile, copyFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { promisify, parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Explicit SAP_AICORE_LIVE=1 is required.');
const { values } = parseArgs({ options: { connection: { type: 'string' }, kubeconfig: { type: 'string' }, context: { type: 'string' }, cluster: { type: 'string' }, kind: { type: 'string', default: 'kind' }, out: { type: 'string', default: '.local/kubernetes-live-report.json' } }, strict: true, allowPositionals: false });
if (!values.connection || !values.kubeconfig || !values.context || !values.cluster) throw new Error('Explicit connection, kubeconfig, context, and kind cluster name are required.');
if (values.context !== 'kind-' + values.cluster) throw new Error('This test only accepts an explicit local kind context.');
const execute = promisify(execFile), root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'sap-pod-build-'));
const kube = ['--kubeconfig', resolve(values.kubeconfig), '--context', values.context];
const namespace = 'sap-ai-core-check-' + randomBytes(4).toString('hex');
const image = 'dsh-sap-ai-core:validation-' + randomBytes(4).toString('hex');
const run = (command: string, args: string[], cwd = root, timeout = 180_000) => execute(command, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 });
const kubectl = (args: string[]) => run('kubectl', [...kube, ...args]);
// Input is kept in process memory and stdin, never in a Secret manifest on disk or argv.
const create = (resource: unknown) => new Promise<void>((resolve, reject) => {
  const process = spawn('kubectl', [...kube, 'create', '-f', '-'], { stdio: ['pipe', 'ignore', 'ignore'] });
  process.once('error', reject); process.once('close', code => code === 0 ? resolve() : reject(new Error('Local resource creation failed.')));
  process.stdin.on('error', reject); process.stdin.end(JSON.stringify(resource));
});
const report: Record<string, unknown> = { startedAt: new Date().toISOString(), scope: 'local kind Pod, non-root/read-only filesystem, Secret refs, proxy and actual cn40 endpoints', namespace, image, status: 'running', requestBudget: 1 };
let created = false;
try {
  const server = (await kubectl(['config', 'view', '--minify', '-o', 'jsonpath={.clusters[0].cluster.server}'])).stdout;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(server).hostname)) throw new Error('Refusing a non-local Kubernetes API.');
  const connection = JSON.parse(await readFile(resolve(values.connection), 'utf8'));
  const secret = JSON.parse(await readFile(connection.serviceKeyFile, 'utf8'));
  if (new URL(secret.serviceurls.AI_API_URL).href.replace(/\/$/, '') !== connection.apiBaseUrl || new URL(secret.url.replace(/\/$/, '') + '/oauth/token').href !== connection.tokenUrl) throw new Error('Service key does not match the explicit instance.');
  if (!connection.proxyUrl || connection.model !== 'qwen3.6-plus') throw new Error('This cn40 test requires its verified proxy and exact model.');
  await run('npm', ['run', 'build']);
  const pack = JSON.parse((await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory])).stdout)[0] as { filename: string };
  await copyFile(join(directory, pack.filename), join(directory, 'plugin.tgz'));
  report.packageSha256 = createHash('sha256').update(await readFile(join(directory, 'plugin.tgz'))).digest('hex');
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'sap-pod-validation', version: '1.0.0', private: true, type: 'module', dependencies: { 'dsh-sap-ai-core': 'file:./plugin.tgz' } }));
  await run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  await copyFile(join(root, 'scripts/pod-live.mjs'), join(directory, 'pod-live.mjs'));
  const dockerfile = [
    'FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df',
    'WORKDIR /app', 'COPY package.json package-lock.json plugin.tgz ./',
    'RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
    'COPY pod-live.mjs ./', 'USER node', 'CMD ["node", "/app/pod-live.mjs"]', '',
  ].join('\n');
  await writeFile(join(directory, 'Dockerfile'), dockerfile);
  console.log('Building the isolated validation image (no credentials in build context).');
  await run('docker', ['build', '--tag', image, '.'], directory, 240_000);
  report.imageId = (await run('docker', ['image', 'inspect', '--format', '{{.Id}}', image])).stdout.trim();
  await run(values.kind.includes('/') ? resolve(values.kind) : values.kind, ['load', 'docker-image', image, '--name', values.cluster]);
  await create({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } }); created = true;
  await create({ apiVersion: 'v1', kind: 'Secret', metadata: { name: 'credentials', namespace }, type: 'Opaque', stringData: { clientId: secret.clientid, clientSecret: secret.clientsecret } });
  const config = {
    instances: { cn40: { apiBaseUrl: connection.apiBaseUrl, tokenUrl: connection.tokenUrl, credentials: { clientIdRef: 'SAP_AICORE_CLIENT_ID', clientSecretRef: 'SAP_AICORE_CLIENT_SECRET' }, oauth: { clientAuthMethod: connection.clientAuthMethod }, network: { proxyMode: 'environment', requestTimeoutMs: 90000 } } },
    providers: { 'sap-ai-core-cn40': { instance: 'cn40', resourceGroup: connection.resourceGroup, protocol: 'openai-chat-completions', apiVersion: connection.apiVersion, models: [{ id: 'qwen-cn40', upstreamModel: connection.model, deployment: { id: connection.deploymentId }, capabilities: { streaming: true, evidence: { status: 'verified', reference: 'cn40 live acceptance 2026-10-31' } }, compatibility: { maxTokensField: 'max_tokens', includeUsage: true, parameters: { enable_thinking: false } }, defaultMaxTokens: 128, maxOutputTokens: 128 }] } },
  };
  await create({ apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: 'configuration', namespace }, data: { 'plugin.json': JSON.stringify(config) } });
  await create({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'validate', namespace }, spec: {
    restartPolicy: 'Never', automountServiceAccountToken: false,
    securityContext: { runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
    containers: [{ name: 'validate', image, imagePullPolicy: 'Never', securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
      env: [{ name: 'SAP_AICORE_LIVE', value: '1' }, { name: 'SAP_AICORE_CLIENT_ID', valueFrom: { secretKeyRef: { name: 'credentials', key: 'clientId' } } }, { name: 'SAP_AICORE_CLIENT_SECRET', valueFrom: { secretKeyRef: { name: 'credentials', key: 'clientSecret' } } }, { name: 'HTTP_PROXY', value: connection.proxyUrl }, { name: 'HTTPS_PROXY', value: connection.proxyUrl }, { name: 'NO_PROXY', value: 'localhost,127.0.0.1,.svc,.cluster.local' }],
      resources: { requests: { cpu: '100m', memory: '128Mi' }, limits: { cpu: '1', memory: '512Mi' } },
      volumeMounts: [{ name: 'config', mountPath: '/etc/sap-ai-core', readOnly: true }, { name: 'temporary', mountPath: '/tmp' }],
    }], volumes: [{ name: 'config', configMap: { name: 'configuration' } }, { name: 'temporary', emptyDir: {} }],
  } });
  console.log('Validating the explicit local kind Pod.');
  const deadline = Date.now() + 150_000;
  let phase = '';
  while (Date.now() < deadline) {
    phase = (await kubectl(['get', 'pod', 'validate', '-n', namespace, '-o', 'jsonpath={.status.phase}'])).stdout;
    if (phase === 'Succeeded' || phase === 'Failed') break;
    await delay(1000);
  }
  const logs = (await kubectl(['logs', 'validate', '-n', namespace])).stdout;
  const line = logs.split('\n').find(line => line.startsWith('{"event":"sap-ai-core-pod-report"'));
  if (line) report.diagnostics = JSON.parse(line);
  if (phase !== 'Succeeded' || !line || JSON.parse(line).status !== 'passed') throw new Error('Pod endpoint validation did not pass.');
  report.status = 'passed'; report.podPhase = phase;
} catch (error) {
  report.status = 'failed'; report.failure = error instanceof Error ? error.message.split('\n')[0] : 'Local Pod validation failed'; process.exitCode = 1;
} finally {
  if (created) {
    try { await kubectl(['delete', 'namespace', namespace, '--wait=true', '--timeout=45s']); report.namespaceAndSecretRemoved = true; }
    catch { report.namespaceAndSecretRemoved = false; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  const output = resolve(values.out); await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  await rm(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ status: report.status, namespaceAndSecretRemoved: report.namespaceAndSecretRemoved, imageId: report.imageId, failure: report.failure }));
}
