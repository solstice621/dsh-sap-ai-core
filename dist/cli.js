#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createDiagnosticHost, readConfigFile } from './diagnostics/host.js';
import { SapAiCoreError, safeError } from './diagnostics/errors.js';
const controller = new AbortController();
const cancel = () => controller.abort();
process.once('SIGINT', cancel);
process.once('SIGTERM', cancel);
let host;
try {
    const { values } = parseArgs({ options: {
            help: { type: 'boolean' }, config: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' },
            level: { type: 'string', default: 'config' }, 'allow-inference': { type: 'boolean', default: false },
            'max-requests': { type: 'string' }, 'max-output-tokens': { type: 'string' }, 'timeout-ms': { type: 'string' },
            'credentials-file': { type: 'string' }, 'service-key': { type: 'string' }, instance: { type: 'string' },
        }, strict: true, allowPositionals: false });
    if (values.help) {
        process.stdout.write('dsh-sap-ai-core-diagnose --config FILE.json --provider ID --model ID [--level config|auth|deployment|chat|stream|tools]\nPaid levels require --allow-inference. Budgets: --max-requests 1..4 --max-output-tokens 1..256 --timeout-ms 1..120000.\nCredentials: declared environment refs, --credentials-file FILE, or --service-key FILE --instance ID.\n');
    }
    else {
        if (!values.config || !values.provider || !values.model)
            throw new SapAiCoreError('INVALID_REQUEST', 'config', 'config, provider, and model are required');
        const config = await readConfigFile(values.config);
        host = await createDiagnosticHost(config, { credentialsFile: values['credentials-file'], serviceKeyFile: values['service-key'], serviceKeyInstance: values.instance, agents: values.level === 'tools' });
        const numeric = (value) => value === undefined ? undefined : /^\d+$/.test(value) ? Number(value) : NaN;
        const report = await host.ctx.sapAiCore.diagnose({
            level: values.level, provider: values.provider, model: values.model, signal: controller.signal,
            allowInference: values['allow-inference'], maxRequests: numeric(values['max-requests']), maxOutputTokens: numeric(values['max-output-tokens']), timeoutMs: numeric(values['timeout-ms']),
        });
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    }
}
catch (error) {
    const safe = safeError(error, 'config', controller.signal);
    process.stderr.write(JSON.stringify({ ok: false, code: safe.code, phase: safe.phase, reason: safe.reason, status: safe.failure.status }) + '\n');
    process.exitCode = 1;
}
finally {
    await host?.close();
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
}
//# sourceMappingURL=cli.js.map