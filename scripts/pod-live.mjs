import { readFile } from 'node:fs/promises';
import { createDiagnosticHost } from 'dsh-sap-ai-core/diagnostic-host';

if (process.env.SAP_AICORE_LIVE !== '1') throw new Error('Explicit live opt-in is required.');
let host;
const report = { event: 'sap-ai-core-pod-report', status: 'running', requestBudget: 1, maxOutputTokens: 128, results: [] };
try {
  const config = JSON.parse(await readFile('/etc/sap-ai-core/plugin.json', 'utf8'));
  host = await createDiagnosticHost(config);
  for (const level of ['config', 'auth', 'deployment', 'stream']) {
    const result = await host.ctx.sapAiCore.diagnose({ provider: 'sap-ai-core-cn40', model: 'qwen-cn40', level, allowInference: level === 'stream', maxRequests: 1, maxOutputTokens: 128 });
    report.results.push(result);
  }
  report.status = 'passed'; report.tokenStats = { ...host.ctx.sapAiCore.adapter.tokens.stats };
} catch (error) {
  report.status = 'failed'; report.failure = { code: typeof error?.code === 'string' ? error.code : 'POD_DIAGNOSTIC_FAILED', phase: error?.phase, reason: error?.reason };
  process.exitCode = 1;
} finally { await host?.close(); console.log(JSON.stringify(report)); }
