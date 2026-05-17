import type { AICopilotSettings } from '../settings/Settings';
import { PROVIDER_DEFAULT_URLS } from '../settings/Settings';
import { normalizeBaseUrl } from '../utils/url';

export interface AIResponse {
    content: string;
    tool_calls?: any[];
}

export interface AIProvider {
    generateText(prompt: string | any[], options?: { temperature?: number, max_tokens?: number, signal?: AbortSignal }): Promise<string>;
    generateResponse(prompt: string | any[], options?: { temperature?: number, max_tokens?: number, signal?: AbortSignal }, tools?: any[]): Promise<AIResponse>;
    summarize(text: string): Promise<string>;
    executeAction(text: string, systemPrompt: string): Promise<string>;
    testConnection(): Promise<{ ok: boolean; message: string }>;
}

export class UniversalAPIProvider implements AIProvider {
    private settings: AICopilotSettings;

    constructor(settings: AICopilotSettings) {
        this.settings = settings;
    }

    private getBaseUrl(): string {
        try {
            return normalizeBaseUrl(
                this.settings.baseUrl || PROVIDER_DEFAULT_URLS[this.settings.provider],
                this.settings.provider
            );
        } catch (e: any) {
            console.warn('[AI Copilot] Invalid baseUrl, using raw value:', e);
            return (this.settings.baseUrl || PROVIDER_DEFAULT_URLS[this.settings.provider]).replace(/\/$/, '');
        }
    }

    private async callAPI(endpoint: string, payload: any, signal?: AbortSignal): Promise<any> {
        if (!this.settings.apiKey && this.settings.provider !== 'ollama') {
            throw new Error('API key is not configured. Please add it in settings.');
        }

        const url = `${this.getBaseUrl()}/${endpoint}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.settings.apiKey) {
            headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
        }

        // Anthropic-specific headers
        if (this.settings.provider === 'anthropic') {
            headers['x-api-key'] = this.settings.apiKey;
            headers['anthropic-version'] = '2023-06-01';
            delete headers['Authorization'];
        }

        let response: Response;
        const timeoutMs = this.settings.requestTimeoutMs ?? 30000;
        console.debug(`[AI Copilot API] POST ${url} (provider: ${this.settings.provider}, model: ${this.settings.model}, timeout: ${timeoutMs}ms)`);

        const controller = new AbortController();
        const timeoutId = signal ? null : setTimeout(() => controller.abort(), timeoutMs);

        try {
            response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal: signal || controller.signal
            });
        } catch (e: any) {
            const msg = e.message || '';
            if (e.name === 'AbortError' || msg.includes('aborted') || msg.includes('timed out')) {
                throw new Error(`Request timed out after ${timeoutMs / 1000}s → ${url}\nThe server may be slow or unreachable. Try increasing the timeout in settings.`);
            }
            if (msg.includes('ECONNREFUSED') || msg.includes('connection refused')) {
                throw new Error(`Connection refused → ${url}\nThe server is not running at this address.`);
            }
            if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo') || msg.includes('Failed to fetch')) {
                throw new Error(`Cannot reach host → ${url}\n${msg}`);
            }
            if (msg.includes('CORS') || msg.includes('cross-origin') || msg.includes('blocked')) {
                throw new Error(`CORS error → ${url}\nThe API server may be blocking requests from Obsidian.`);
            }
            throw new Error(`Network error → ${url}\n${msg}`);
        } finally {
            if (timeoutId) clearTimeout(timeoutId);
        }

        const text = await response.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.error(`[AI Copilot API] Non-JSON response (status ${response.status}):`, text.slice(0, 500));
            throw new Error(`Received non-JSON response from API (status ${response.status}): ${text.slice(0, 200)}`);
        }

        if (!response.ok) {
            const errMsg = data?.error?.message || data?.message || JSON.stringify(data);
            console.error(`[AI Copilot API] Error response:`, data);
            throw new Error(`API Error (${response.status}): ${errMsg}`);
        }

        console.debug(`[AI Copilot API] Response OK (status ${response.status})`, {
            hasChoices: !!data?.choices,
            choicesLength: data?.choices?.length,
            hasContent: !!data?.choices?.[0]?.message?.content,
            contentPreview: data?.choices?.[0]?.message?.content?.slice(0, 80),
            hasToolCalls: !!data?.choices?.[0]?.message?.tool_calls,
            finishReason: data?.choices?.[0]?.finish_reason,
            // Anthropic format
            anthropicContent: data?.content?.[0]?.text?.slice(0, 80),
        });

        return data;
    }

    async generateText(prompt: string | any[], options?: { temperature?: number, max_tokens?: number, signal?: AbortSignal }): Promise<string> {
        const response = await this.generateResponse(prompt, options);
        return response.content;
    }

    async generateResponse(prompt: string | any[], options?: { temperature?: number, max_tokens?: number, signal?: AbortSignal }, tools?: any[]): Promise<AIResponse> {
        let messages: any[];

        if (Array.isArray(prompt) && prompt.length > 0 && prompt[0].role === 'system') {
            messages = prompt;
        } else {
            const systemContent = this.settings.systemPrompt || 'You are a helpful assistant.';
            if (typeof prompt === 'string') {
                messages = [
                    { role: 'system', content: systemContent },
                    { role: 'user', content: prompt }
                ];
            } else {
                messages = [
                    { role: 'system', content: systemContent },
                    ...prompt
                ];
            }
        }

        // Anthropic uses a different API format
        if (this.settings.provider === 'anthropic') {
            return this.callAnthropic(messages, options, tools);
        }

        const maxTokens = options?.max_tokens ?? 4096;
        const payload: any = {
            model: this.settings.model || 'gpt-5-mini',
            messages: messages,
            temperature: options?.temperature ?? 0.7,
        };

        // GPT-5.x and o-series models require max_completion_tokens (max_tokens is deprecated
        // and silently ignored, resulting in empty responses).
        // 'openai-compatible' proxies and other providers still use the standard max_tokens.
        if (this.settings.provider === 'openai') {
            payload.max_completion_tokens = maxTokens;
        } else {
            payload.max_tokens = maxTokens;
        }

        if (tools && tools.length > 0) {
            payload.tools = tools;
            payload.tool_choice = "auto";
        }

        const data = await this.callAPI('chat/completions', payload, options?.signal);

        // Defensive parsing — some providers return unexpected structures
        if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
            console.error('[AI Copilot API] Unexpected response structure — no choices array:', JSON.stringify(data).slice(0, 500));
            throw new Error(`Unexpected API response: no 'choices' returned. Raw: ${JSON.stringify(data).slice(0, 200)}`);
        }

        const choice = data.choices[0];
        if (!choice.message) {
            console.error('[AI Copilot API] No message in first choice:', choice);
            throw new Error(`Unexpected API response: no 'message' in choice. finish_reason: ${choice.finish_reason}`);
        }

        const message = choice.message;
        const content = message.content ?? "";

        if (!content && !message.tool_calls) {
            console.warn('[AI Copilot API] Empty content AND no tool_calls. finish_reason:', choice.finish_reason, 'Full response:', JSON.stringify(data).slice(0, 500));
        }

        return {
            content: content,
            tool_calls: message.tool_calls
        };
    }

    private async callAnthropic(messages: any[], options?: { temperature?: number, max_tokens?: number, signal?: AbortSignal }, tools?: any[]): Promise<AIResponse> {
        // Extract system message
        const systemMsg = messages.find(m => m.role === 'system');
        const userAndAssistantMessages = messages.filter(m => m.role !== 'system');

        // Convert messages to Anthropic format
        const formattedMessages: any[] = [];
        
        for (const msg of userAndAssistantMessages) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                const contentBlocks: any[] = [];
                
                // Add text content if present
                if (typeof msg.content === 'string' && msg.content) {
                    contentBlocks.push({ type: 'text', text: msg.content });
                } else if (Array.isArray(msg.content)) {
                    // Handle image blocks (from OpenAI format to Anthropic)
                    for (const part of msg.content) {
                        if (part.type === 'text') {
                            contentBlocks.push({ type: 'text', text: part.text });
                        } else if (part.type === 'image_url' && part.image_url?.url) {
                            const url = part.image_url.url;
                            const match = url.match(/^data:(.*?);base64,(.*)$/);
                            if (match) {
                                contentBlocks.push({
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: match[1],
                                        data: match[2]
                                    }
                                });
                            }
                        } else if (part.type === 'image') {
                            contentBlocks.push(part); // Already formatted
                        }
                    }
                }
                
                // Handle assistant tool_calls
                if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                    for (const tc of msg.tool_calls) {
                        contentBlocks.push({
                            type: 'tool_use',
                            id: tc.id,
                            name: tc.function?.name,
                            input: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {}
                        });
                    }
                }
                
                // If content is completely empty and no tool calls, add a dummy text block to satisfy Anthropic
                if (contentBlocks.length === 0) {
                    contentBlocks.push({ type: 'text', text: ' ' });
                }

                formattedMessages.push({
                    role: msg.role,
                    content: contentBlocks
                });
            } else if (msg.role === 'tool') {
                // OpenAI 'tool' role maps to Anthropic 'user' role with a 'tool_result' block
                formattedMessages.push({
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: msg.tool_call_id,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
                    }]
                });
            }
        }

        // Anthropic STRICTLY requires alternating user and assistant messages.
        // Multiple consecutive user/assistant messages must be merged.
        const mergedMessages: any[] = [];
        for (const msg of formattedMessages) {
            if (mergedMessages.length > 0 && mergedMessages[mergedMessages.length - 1].role === msg.role) {
                // Merge contents
                const lastMsg = mergedMessages[mergedMessages.length - 1];
                if (Array.isArray(lastMsg.content) && Array.isArray(msg.content)) {
                    lastMsg.content.push(...msg.content);
                } else if (typeof lastMsg.content === 'string' && typeof msg.content === 'string') {
                    lastMsg.content += '\n\n' + msg.content;
                } else {
                    // Fallback to making them arrays
                    const lastArr = Array.isArray(lastMsg.content) ? lastMsg.content : [{ type: 'text', text: lastMsg.content }];
                    const currArr = Array.isArray(msg.content) ? msg.content : [{ type: 'text', text: msg.content }];
                    lastMsg.content = [...lastArr, ...currArr];
                }
            } else {
                mergedMessages.push(msg);
            }
        }

        const payload: any = {
            model: this.settings.model || 'claude-3-5-sonnet-20241022',
            max_tokens: options?.max_tokens ?? 4096,
            messages: mergedMessages,
        };
        if (options?.temperature !== undefined) payload.temperature = options.temperature;
        if (systemMsg) payload.system = systemMsg.content;
        
        // Map Tools
        if (tools && tools.length > 0) {
            payload.tools = tools.map(t => ({
                name: t.function.name,
                description: t.function.description,
                input_schema: t.function.parameters || { type: "object", properties: {} }
            }));
        }

        const data = await this.callAPI('messages', payload, options?.signal);
        
        // Parse Anthropic Response
        let textContent = '';
        const standardToolCalls: any[] = [];
        
        if (data.content && Array.isArray(data.content)) {
            for (const block of data.content) {
                if (block.type === 'text') {
                    textContent += block.text;
                } else if (block.type === 'tool_use') {
                    standardToolCalls.push({
                        id: block.id,
                        type: 'function',
                        function: {
                            name: block.name,
                            arguments: typeof block.input === 'string' ? block.input : JSON.stringify(block.input)
                        }
                    });
                }
            }
        } else {
            console.warn('[AI Copilot API] Anthropic returned unexpected content format:', JSON.stringify(data).slice(0, 500));
            // Try to extract text if it's there
            if (data.content?.[0]?.text) {
                textContent = data.content[0].text;
            }
        }

        return {
            content: textContent,
            ...(standardToolCalls.length > 0 && { tool_calls: standardToolCalls })
        };
    }

    async summarize(text: string): Promise<string> {
        const prompt = `Summarize the following text:\n\n${text}\n\nSummary:`;
        return this.generateText(prompt, { max_tokens: 300 });
    }

    async executeAction(text: string, systemPrompt: string): Promise<string> {
        const messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text }
        ];
        return this.generateText(messages);
    }

    async testConnection(): Promise<{ ok: boolean; message: string }> {
        const baseUrl = this.getBaseUrl();
        const timeoutMs = this.settings.requestTimeoutMs ?? 60000;

        // Pre-flight validation
        if (!this.settings.apiKey && this.settings.provider !== 'ollama') {
            return { ok: false, message: 'API key is empty.' };
        }
        try {
            normalizeBaseUrl(
                this.settings.baseUrl || PROVIDER_DEFAULT_URLS[this.settings.provider],
                this.settings.provider
            );
        } catch (e: any) {
            return { ok: false, message: `Invalid Base URL: ${e.message}` };
        }

        // ── Phase 1: lightweight server reachability check (GET /models) ──
        // Skip for Anthropic which doesn't expose a /models endpoint.
        if (this.settings.provider !== 'anthropic') {
            const modelsUrl = `${baseUrl}/models`;
            const reachController = new AbortController();
            const reachTimeout = setTimeout(() => reachController.abort(), 8000);
            try {
                const headers: Record<string, string> = {};
                if (this.settings.apiKey) headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
                const res = await fetch(modelsUrl, { signal: reachController.signal, headers });
                // 401/403 → server is up, auth issue. 404 → server up but no /models (ok, skip phase 1 verdict).
                if (!res.ok && res.status !== 404 && res.status !== 401 && res.status !== 403) {
                    return { ok: false, message: `Server replied with HTTP ${res.status} → ${modelsUrl}` };
                }
            } catch (e: any) {
                const msg = e.message || '';
                if (e.name === 'AbortError') {
                    return { ok: false, message: `Server unreachable (no response in 8s) → ${modelsUrl}\nMake sure the server is running.` };
                }
                if (msg.includes('ECONNREFUSED') || msg.includes('connection refused')) {
                    return { ok: false, message: `Connection refused → ${modelsUrl}\nThe server is not running at this address.` };
                }
                if (msg.includes('ENOTFOUND') || msg.includes('Failed to fetch') || msg.includes('getaddrinfo')) {
                    return { ok: false, message: `Cannot reach host → ${modelsUrl}\nCheck the Base URL hostname.` };
                }
                // Any other network error: fall through and let phase 2 give a richer message
            } finally {
                clearTimeout(reachTimeout);
            }
        }

        // ── Phase 2: minimal completion to verify auth + model ──
        const completionController = new AbortController();
        const completionTimeout = setTimeout(() => completionController.abort(), timeoutMs);
        try {
            if (this.settings.provider === 'anthropic') {
                await this.callAnthropic([{ role: 'user', content: 'Hi' }], { max_tokens: 5, signal: completionController.signal });
            } else {
                await this.generateResponse('Hi', { max_tokens: 5, signal: completionController.signal });
            }
            return { ok: true, message: `✓ Connected → ${baseUrl}  (model: ${this.settings.model})` };
        } catch (e: any) {
            const msg: string = e.message || '';
            if (e.name === 'AbortError' || msg.includes('timed out')) {
                return { ok: false, message: `Model response timed out after ${timeoutMs / 1000}s → ${baseUrl}\nTry increasing the timeout in settings, or check if the model is loaded.` };
            }
            if (msg.includes('API Error (404)')) {
                return { ok: false, message: `Endpoint not found (404) → ${baseUrl}/chat/completions\nCheck that the Base URL includes /v1 and the server supports the OpenAI chat endpoint.` };
            }
            if (msg.includes('API Error (401)') || msg.includes('API Error (403)')) {
                return { ok: false, message: `Authentication failed → ${baseUrl}\nCheck your API key.` };
            }
            return { ok: false, message: msg };
        } finally {
            clearTimeout(completionTimeout);
        }
    }
}
