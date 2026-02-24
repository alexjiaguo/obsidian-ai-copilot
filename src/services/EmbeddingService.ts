import type { AICopilotSettings } from '../settings/Settings';
import { requestUrl } from 'obsidian';

export class EmbeddingService {
    private settings: AICopilotSettings;

    constructor(settings: AICopilotSettings) {
        this.settings = settings;
    }

    private getBaseUrl(): string {
        if (this.settings.embeddingProvider === 'ollama') {
            return 'http://localhost:11434/v1';
        }
        return 'https://api.openai.com/v1';
    }

    async getEmbedding(text: string): Promise<number[]> {
        const baseUrl = this.getBaseUrl();
        const url = `${baseUrl}/embeddings`;
        
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.settings.embeddingProvider === 'openai') {
            headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
        }

        const payload = {
            model: this.settings.embeddingModel || (this.settings.embeddingProvider === 'openai' ? 'text-embedding-3-small' : 'mxbai-embed-large'),
            input: text
        };

        try {
            const response = await requestUrl({
                url: url,
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (response.status !== 200) {
                throw new Error(`Embedding API error: ${response.status} ${response.text}`);
            }

            const data = response.json;
            if (data && data.data && data.data[0] && data.data[0].embedding) {
                return data.data[0].embedding as number[];
            }
            
            throw new Error(`Unexpected embedding response format`);
        } catch (error) {
            console.error('Error fetching embedding:', error);
            throw error;
        }
    }
}
