import type { AICopilotSettings } from '../settings/Settings';

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

export class OpenAIProvider implements AIProvider {
    private settings: AICopilotSettings;

    constructor(settings: AICopilotSettings) {
        this.settings = settings;
    }

    private getBaseUrl(): string {
        const base = this.settings.baseUrl || 'https://api.openai.com/v1';
        // Ensure no trailing slash, then we add the endpoint ourselves
        return base.replace(/\/$/, '');
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
        try {
            response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
                signal
            });
        } catch (e: any) {
            throw new Error(`Network error: ${e.message}. Check your Base URL and internet connection.`);
        }

        const text = await response.text();
        let data: any;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error(`Received non-JSON response from API (status ${response.status}): ${text.slice(0, 200)}`);
        }

        if (!response.ok) {
            const errMsg = data?.error?.message || data?.message || JSON.stringify(data);
            throw new Error(`API Error (${response.status}): ${errMsg}`);
        }

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
            return this.callAnthropic(messages, options);
        }

        const payload: any = {
            model: this.settings.model || 'gpt-5-mini',
            messages: messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: options?.max_tokens ?? 4096, // Raised from 500
        };

        if (tools && tools.length > 0) {
            payload.tools = tools;
            payload.tool_choice = "auto";
        }

        const data = await this.callAPI('chat/completions', payload, options?.signal);
        const message = data.choices[0].message;

        return {
            content: message.content || "",
            tool_calls: message.tool_calls
        };
    }

    private async callAnthropic(messages: any[], options?: { temperature?: number, max_tokens?: number, signal?: AbortSignal }): Promise<AIResponse> {
        // Extract system message
        const systemMsg = messages.find(m => m.role === 'system');
        const userMessages = messages.filter(m => m.role !== 'system');

        // Convert OpenAI image_url format to Anthropic image format
        const formattedUserMessages = userMessages.map((msg) => {
            if (Array.isArray(msg.content)) {
                return {
                    ...msg,
                    content: msg.content.map((part: any) => {
                        if (part.type === 'image_url' && part.image_url?.url) {
                            const url = part.image_url.url;
                            const match = url.match(/^data:(.*?);base64,(.*)$/);
                            if (match) {
                                return {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: match[1],
                                        data: match[2]
                                    }
                                };
                            }
                        }
                        return part;
                    })
                };
            }
            return msg;
        });

        const payload: any = {
            model: this.settings.model || 'claude-3-5-sonnet-20241022',
            max_tokens: options?.max_tokens ?? 4096,
            messages: formattedUserMessages,
        };
        if (systemMsg) payload.system = systemMsg.content;

        const data = await this.callAPI('messages', payload, options?.signal);
        return {
            content: data.content?.[0]?.text || '',
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
        try {
            if (!this.settings.apiKey && this.settings.provider !== 'ollama') {
                return { ok: false, message: 'API key is empty.' };
            }

            if (this.settings.provider === 'anthropic') {
                // Simple test with a minimal message
                await this.callAnthropic([{ role: 'user', content: 'Hi' }], { max_tokens: 5 });
                return { ok: true, message: `Connected to Anthropic (${this.settings.model})` };
            }

            // For OpenAI-compatible: try /models endpoint (GET)
            const base = this.getBaseUrl();
            const url = `${base}/models`;
            const headers: Record<string, string> = {
                'Authorization': `Bearer ${this.settings.apiKey}`,
            };
            const response = await fetch(url, { headers });
            if (response.ok) {
                return { ok: true, message: `Connected to ${this.settings.provider} (${this.settings.model})` };
            }
            // Fallback: try a minimal chat call
            await this.generateResponse('Hi', { max_tokens: 5 });
            return { ok: true, message: `Connected to ${this.settings.provider} (${this.settings.model})` };
        } catch (e: any) {
            return { ok: false, message: e.message };
        }
    }
}
