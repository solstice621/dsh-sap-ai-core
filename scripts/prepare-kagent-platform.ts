import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { routeOf, snapshotOf } from '../src/config.js';

const { values } = parseArgs({ options: {
  config: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' },
  'sap-package': { type: 'string' }, 'kagent-package': { type: 'string' },
  out: { type: 'string', default: '.local/kagent-platform' },
  namespace: { type: 'string', default: 'kagent' }, 'agent-name': { type: 'string', default: 'sap-cn40-check' },
  'principal-id': { type: 'string', default: 'admin@kagent.dev' },
  'request-budget': { type: 'string', default: '12' },
}, strict: true, allowPositionals: false });
if (!values.config || !values.provider || !values.model || !values['sap-package'] || !values['kagent-package']) throw new Error('Specify config, provider, model, sap-package, and kagent-package.');
const requestBudget = Number(values['request-budget']);
assert.ok(Number.isSafeInteger(requestBudget) && requestBudget >= 1 && requestBudget <= 12, 'request-budget must be an integer from 1 to 12.');
for (const identifier of [values.namespace, values['agent-name']]) assert.match(identifier, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);
const root = process.cwd(), output = resolve(values.out), build = join(output, 'build');
const LF = String.fromCharCode(10);
// A fresh directory prevents accidental replacement of another running acceptance fixture.
await mkdir(output, { recursive: false });
await mkdir(build);
const execute = promisify(execFile);
const run = (command: string, args: string[], cwd = root, timeout = 180_000) => execute(command, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 });
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const sapBytes = await readFile(resolve(values['sap-package']));
const kagentBytes = await readFile(resolve(values['kagent-package']));
const monitorBytes = await readFile(join(root, 'scripts/platform-monitor.mjs'));
const imagePrefix = 'dsh-sap-ai-core-kagent:acceptance-' + sha(sapBytes).slice(0,8) + '-' + sha(kagentBytes).slice(0,8) + '-' + sha(monitorBytes).slice(0,8);
const snapshot = snapshotOf(JSON.parse(await readFile(resolve(values.config), 'utf8')));
const route = routeOf(snapshot, values.provider, values.model);
assert.equal(route.model.upstreamModel, 'qwen3.6-plus', 'This fixture is only for the verified cn40 model.');
assert.equal(route.model.capabilities.evidence.status, 'verified');
assert.equal(route.model.compatibility.parameters.enable_thinking, false);
assert.ok('id' in route.model.deployment && route.model.deployment.id, 'Use the explicitly verified Deployment.');
assert.ok(route.instance.network.proxyUrl, 'The current cn40 Pod acceptance requires its configured proxy.');
const instance = structuredClone(route.instance);
instance.network.proxyMode = 'environment';
delete instance.network.proxyUrl;
const model = { ...structuredClone(route.model), maxOutputTokens: 128, defaultMaxTokens: 128 };
const provider = { ...structuredClone(route.provider), retryPolicy: { ...route.provider.retryPolicy, maxRetries: 0 }, models: [model] };
const plugin = { instances: { [provider.instance]: instance }, providers: { [values.provider]: provider } };
snapshotOf(plugin);
const credentialRefs = [instance.credentials.clientIdRef, instance.credentials.clientSecretRef];
const runtimePlugins = [
  { name: 'file:///opt/dsh/monitor.mjs', config: { credentialRefs, maxRequests: requestBudget } },
  { name: '@deepseek-ai/dsh-credentials-local', config: { path: '/tmp/sap-empty-credentials.yaml', watch: false } },
  { name: 'dsh-sap-ai-core', config: plugin },
];
const agentName = values['agent-name'];
const helmValues = {
  agentName, principalId: values['principal-id'],
  image: { repository: imagePrefix.split(':')[0], tag: imagePrefix.split(':')[1], pullPolicy: 'Never' },
  auth: { existingSecret: agentName + '-auth', tokenKey: 'token' },
  persistence: { size: '256Mi' },
  runtimePlugins, model: { provider: values.provider, name: values.model },
  // This is an isolated kind fixture. Its kindnet CNI does not enforce NetworkPolicy.
  networkPolicy: { enabled: false },
  extraEnv: [
    { name: 'SAP_AICORE_LIVE', value: '1' },
    { name: instance.credentials.clientIdRef, valueFrom: { secretKeyRef: { name: agentName + '-sap', key: 'clientId' } } },
    { name: instance.credentials.clientSecretRef, valueFrom: { secretKeyRef: { name: agentName + '-sap', key: 'clientSecret' } } },
    { name: 'HTTP_PROXY', value: route.instance.network.proxyUrl },
    { name: 'HTTPS_PROXY', value: route.instance.network.proxyUrl },
    { name: 'NO_PROXY', value: 'localhost,127.0.0.1,.svc,.cluster.local' },
  ],
};
await writeFile(join(build, 'sap.tgz'), sapBytes);
await writeFile(join(build, 'kagent.tgz'), kagentBytes);
await copyFile(join(root, 'scripts/platform-monitor.mjs'), join(build, 'monitor.mjs'));
await writeFile(join(build, 'package.json'), JSON.stringify({ name: 'sap-kagent-platform-acceptance', version: '1.0.0', private: true, type: 'module', dependencies: {
  'dsh-sap-ai-core': 'file:./sap.tgz', 'dsh-kagent': 'file:./kagent.tgz',
  '@deepseek-ai/dsh-launch-environment': '0.2.1-rc.5',
  // This fixture loads the credential store explicitly; the SAP plugin only
  // declares it as an optional peer for callers that choose local storage.
  '@deepseek-ai/dsh-credentials-local': '0.2.1-rc.5',
} }, null, 2) + LF);
await run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], build);
const runtimeLockSha256 = sha(await readFile(join(build, 'package-lock.json')));
const image = imagePrefix + '-' + runtimeLockSha256.slice(0,8);
helmValues.image.tag = image.split(':')[1];
await writeFile(join(output, 'values.json'), JSON.stringify(helmValues, null, 2) + LF, { mode: 0o600 });
await writeFile(join(build, 'Dockerfile'), [
  'FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df',
  'WORKDIR /opt/dsh', 'ENV NODE_ENV=production',
  'COPY package.json package-lock.json sap.tgz kagent.tgz ./',
  'RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund',
  'COPY monitor.mjs ./', 'USER node', 'EXPOSE 8080',
  'ENTRYPOINT ["node", "/opt/dsh/node_modules/dsh-kagent/dist/cli.js"]', '',
].join(LF));
console.log('Building the two-package platform fixture; no service key or Secret is read by this command.');
await run('docker', ['build', '--tag', image, '.'], build, 240_000);
const imageId = (await run('docker', ['image', 'inspect', '--format', '{{.Id}}', image])).stdout.trim();
const report = { preparedAt: new Date().toISOString(), image, imageId, namespace: values.namespace, agentName,
  packageSha256: { sap: sha(sapBytes), kagent: sha(kagentBytes) }, monitorSha256: sha(monitorBytes),
  runtimeLockSha256, requestBudget, maxOutputTokensPerRequest: 128, valuesFile: join(output, 'values.json'),
  readsServiceKey: false, deploysResources: false, inferencePerformed: false,
};
await writeFile(join(output, 'prepared.json'), JSON.stringify(report, null, 2) + LF, { mode: 0o600 });
console.log(JSON.stringify(report));
