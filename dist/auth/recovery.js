import { appendPluginRecord, pluginRecordOf } from '@deepseek-ai/dsh-session';
import { z } from 'zod';
const recordSchema = z.object({
    provider: z.string(), turn: z.number().int(), step: z.number().int(),
    tokenGeneration: z.number().int().positive(), configGeneration: z.number().int().positive(), used: z.literal(true),
});
const stateKey = (value) => JSON.stringify([value.provider, value.turn, value.step]);
/** Optional Agent integration; standalone llm.stream still makes exactly one attempt. */
export function registerAuthRecovery(ctx, adapter) {
    ctx.sessionProjections.register({
        key: 'sapAiCoreAuthRecovery', stateVersion: 1, stateSchema: z.record(z.string(), z.boolean()), init: () => ({}),
        apply(state, event) {
            if (event.type === 'step/start' || event.type === 'turn/end')
                return {};
            const record = pluginRecordOf(event);
            if (record?.type !== 'plugin:dsh-sap-ai-core/auth-recovery')
                return state;
            const value = recordSchema.safeParse(record.data);
            // Invalid persisted records fail closed: no unbounded recovery after a corrupt guard.
            if (!value.success)
                return { '*': true };
            return { ...state, [stateKey(value.data)]: true };
        },
    });
    ctx.on('agent/request-error', async (payload, next) => {
        const { failure, provider, agent, turn, step, signal } = payload;
        const receipt = adapter.takeAuthReceipt(failure, provider, agent.session.id);
        if (!receipt)
            return next();
        if (signal.aborted)
            return undefined;
        const state = ctx.sessionProjections.stateOf(agent.session, 'sapAiCoreAuthRecovery');
        if (!state || state['*'] || state[stateKey({ provider, turn, step })])
            return undefined;
        appendPluginRecord(agent.session, 'plugin:dsh-sap-ai-core/auth-recovery', { provider, turn, step, tokenGeneration: receipt.tokenGeneration, configGeneration: receipt.configGeneration, used: true });
        return { kind: 'retry' };
    });
}
//# sourceMappingURL=recovery.js.map