import type { GenerateOptions } from '@deepseek-ai/dsh-llm';
import type { ModelRoute } from '../config.js';
export interface WireMessage {
    role: string;
    content: string | null;
    tool_call_id?: string;
    tool_calls?: {
        id: string;
        type: 'function';
        function: {
            name: string;
            arguments: string;
        };
    }[];
    reasoning_content?: string;
    reasoning?: string;
}
export interface WireRequest {
    model: string;
    messages: WireMessage[];
    stream: boolean;
    [key: string]: unknown;
}
export declare function validateToolArguments(value: string): void;
export declare function buildRequest(options: GenerateOptions, route: ModelRoute): WireRequest;
