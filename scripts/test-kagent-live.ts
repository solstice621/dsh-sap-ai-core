import { mkdtemp, readFile, writeFile, copyFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify, parseArgs } from 'node:util';

if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Explicit SAP_AICORE_LIVE=1 is required.');
const { values } = parseArgs({ options: { connection: { type: 'string' }, 'kagent-package': { type: 'string' }, out: { type: 'string', default: '.local/kagent-joint-report.json' } }, strict: true, allowPositionals: false });
if (!values.connection || !values['kagent-package']) throw new Error('Specify --connection and --kagent-package.');
const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'sap-kagent-live-'));
const execute = promisify(execFile);
const run = (command: string, args: string[], cwd = root) => execute(command, args, { cwd, timeout: 180_000, maxBuffer: 8 * 1024 * 1024, env: process.env });
const digest = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
try {
  await run('npm', ['run', 'build']);
  const pack = JSON.parse((await run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory])).stdout)[0] as { filename: string };
  const sap = join(directory, pack.filename), kagent = join(directory, 'kagent-input.tgz');
  await copyFile(resolve(values['kagent-package']), kagent);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'sap-kagent-joint-validation', version: '1.0.0', private: true, type: 'module', dependencies: { 'dsh-sap-ai-core': 'file:' + sap, 'dsh-kagent': 'file:' + kagent } }));
  await copyFile(join(root, 'scripts/kagent-live-installed.mjs'), join(directory, 'joint.mjs'));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  let output: string;
  try { output = (await run(process.execPath, ['joint.mjs', resolve(values.connection)], directory)).stdout; }
  catch { process.exitCode = 1; output = 'Joint validation failed; see the sanitized report.\n'; }
  const evidence = JSON.parse(await readFile(join(directory, 'joint-report.json'), 'utf8'));
  const report = { ...evidence, validatedAt: new Date().toISOString(), packages: { sapSha256: await digest(sap), kagentSha256: await digest(kagent) } };
  const path = resolve(values.out); await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(output);
} finally { await rm(directory, { recursive: true, force: true }); }
