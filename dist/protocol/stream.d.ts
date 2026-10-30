import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
import type { HttpReply } from '../transport/http.js';
export declare class ChatStreamTranslator {
    private readonly route;
    private readonly blocks;
    private readonly tools;
    private text?;
    private reasoning?;
    private finishReason?;
    private usage?;
    private usageEmitted;
    private ended;
    private bytes;
    private responseId?;
    private responseModel?;
    constructor(route: ModelRoute);
    takeUsage(): StreamChunk[];
    private account;
    accept(raw: unknown): StreamChunk[];
    finish(): StreamChunk[];
}
export declare function streamReply(reply: HttpReply, route: ModelRoute): AsyncGenerator<StreamChunk>;
/** One full response in explicit buffered mode; never counted as real streaming. */
export declare function bufferedReply(raw: unknown, route: ModelRoute): StreamChunk[];
