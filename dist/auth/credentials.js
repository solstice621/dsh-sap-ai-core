import { createHmac, randomBytes } from 'node:crypto';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { SapAiCoreError, checkAbort } from '../diagnostics/errors.js';
import { waitFor } from '../transport/cancellation.js';
export class CredentialResolver {
    credentials;
    salt = randomBytes(32);
    constructor(credentials) {
        this.credentials = credentials;
    }
    async resolve(route, signal) {
        checkAbort(signal, 'credentials');
        const refs = route.instance.credentials;
        let values;
        try {
            values = await waitFor(Promise.all([
                this.credentials.resolve(credentialRef(refs.clientIdRef)),
                this.credentials.resolve(credentialRef(refs.clientSecretRef)),
            ]), signal);
        }
        catch (error) {
            checkAbort(signal, 'credentials');
            if (error instanceof SapAiCoreError)
                throw error;
            throw new SapAiCoreError('INVALID_CREDENTIAL', 'credentials', 'credential service lookup failed');
        }
        const [id, secret] = values;
        if (!id || !secret || id.value === '' || secret.value === '')
            throw new SapAiCoreError('MISSING_CREDENTIAL', 'credentials', 'a configured credential reference is empty or absent');
        for (const value of [id.value, secret.value]) {
            if (typeof value !== 'string' || value.trim().length === 0 || value.length > 32_768 || /[\u0000-\u001f\u007f]/.test(value)) {
                throw new SapAiCoreError('INVALID_CREDENTIAL', 'credentials', 'credential format is invalid');
            }
        }
        checkAbort(signal, 'credentials');
        const key = createHmac('sha256', this.salt).update(JSON.stringify([
            route.instanceId, route.instance.tokenUrl, route.instance.apiBaseUrl, route.provider.resourceGroup,
            route.instance.oauth, route.instance.network, refs, id.value, secret.value,
        ])).digest('hex');
        return Object.freeze({ clientId: id.value, clientSecret: secret.value, key, sources: Object.freeze([id.source, secret.source]) });
    }
    async describe(route, signal) {
        const refs = route.instance.credentials;
        try {
            return await waitFor(Promise.all([
                this.credentials.describe(credentialRef(refs.clientIdRef)),
                this.credentials.describe(credentialRef(refs.clientSecretRef)),
            ]), signal);
        }
        catch {
            checkAbort(signal, 'credentials');
            throw new SapAiCoreError('INVALID_CREDENTIAL', 'credentials', 'credential description failed');
        }
    }
}
//# sourceMappingURL=credentials.js.map