import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const root = process.cwd(), artifacts = resolve('artifacts');
const directory = await mkdtemp(join(tmpdir(), 'dsh-sap-pack-'));
const run = (command: string, args: string[], cwd = root, env = process.env) => execute(command, args, { cwd, env, timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
try {
  await run('npm', ['run', 'build']);
  await mkdir(artifacts, { recursive: true });
  const packed = JSON.parse((await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts])).stdout)[0] as { filename: string; files: { path: string }[]; integrity: string };
  const archive = join(artifacts, packed.filename);
  assert.ok(packed.files.some(file => file.path === 'dist/index.js'));
  assert.ok(packed.files.some(file => file.path === 'dist/cli.js'));
  for (const file of packed.files) assert.match(file.path, /^(?:dist\/|examples\/|docs\/|package\.json$|README\.md$|NOTICE\.md$)/);
  const dependencies: Record<string, string> = {
    'dsh-sap-ai-core': 'file:' + archive,
    '@deepseek-ai/cordis': '4.0.5', '@deepseek-ai/cordis-plugin-loader': '1.0.6',
    '@deepseek-ai/dsh-llm': '0.2.1-rc.5', '@deepseek-ai/dsh-credentials': '0.2.1-rc.5',
    '@deepseek-ai/dsh-credentials-local': '0.2.1-rc.5', '@deepseek-ai/dsh-launch-environment': '0.2.1-rc.5',
  };
  const packageFile = () => JSON.stringify({ name: 'sap-clean-profile', version: '1.0.0', private: true, type: 'module', dependencies }, null, 2);
  await writeFile(join(directory, 'package.json'), packageFile());
  await copyFile(join(root, 'scripts/packed-profile.mjs'), join(directory, 'packed-profile.mjs'));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  console.log('Clean standalone DSH installation: ' + (await run(process.execPath, ['packed-profile.mjs'], directory)).stdout.trim());
  const env = { ...process.env, PACK_CLIENT_ID: 'synthetic-client', PACK_CLIENT_SECRET: 'synthetic-secret' };
  const cli = JSON.parse((await run(process.execPath, ['node_modules/dsh-sap-ai-core/dist/cli.js', '--config', 'plugin.json', '--provider', 'sap-pack', '--model', 'packed-model'], directory, env)).stdout);
  assert.equal(cli.level, 'config'); assert.equal(cli.ok, true);
  // Add only published optional Agent packages to the isolated installation.
  for (const name of ['agent', 'agent-loop', 'session', 'session-projection', 'tools', 'system-prompt']) dependencies['@deepseek-ai/dsh-' + name] = '0.2.1-rc.5';
  await writeFile(join(directory, 'package.json'), packageFile());
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  console.log('Clean DSH Agent installation: ' + (await run(process.execPath, ['packed-profile.mjs', '--agents'], directory)).stdout.trim());
  const manifest = {
    version: JSON.parse(await readFile('package.json', 'utf8')).version,
    artifact: packed.filename, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), integrity: packed.integrity,
    node: process.version, dsh: '0.2.1-rc.5', validatedAt: new Date().toISOString(),
    cleanInstall: true, publishedImportsOnly: true, standaloneProfile: true, optionalAgentToolLoop: true, cliConfigCheck: true,
    files: packed.files.map(file => file.path),
  };
  await writeFile(join(artifacts, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Packed validation passed: ' + packed.filename);
} finally { await rm(directory, { recursive: true, force: true }); }
