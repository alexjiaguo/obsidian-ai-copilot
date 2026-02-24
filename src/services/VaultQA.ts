import { App, TFile, Notice } from 'obsidian';
import { EmbeddingService } from './EmbeddingService';
import type { AICopilotSettings } from '../settings/Settings';

export interface DocumentChunk {
    fileId: string;
    text: string;
    embedding: number[];
}

export class VaultQA {
    private app: App;
    private settings: AICopilotSettings;
    private embeddingService: EmbeddingService;
    private index: DocumentChunk[] = [];
    private isIndexing = false;

    constructor(app: App, settings: AICopilotSettings) {
        this.app = app;
        this.settings = settings;
        this.embeddingService = new EmbeddingService(settings);
    }

    public get isIndexed(): boolean {
        return this.index.length > 0;
    }
    
    
    // Compute cosine similarity between two vectors
    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // Split text into chunks
    private chunkText(text: string, maxWords = 500): string[] {
        const words = text.split(/\s+/);
        const chunks: string[] = [];
        for (let i = 0; i < words.length; i += maxWords) {
            chunks.push(words.slice(i, i + maxWords).join(' '));
        }
        return chunks;
    }

    async indexVault() {
        if (this.isIndexing) {
            new Notice('Vault is already being indexed.');
            return;
        }

        this.isIndexing = true;
        new Notice('Starting Vault QA Indexing...');
        
        try {
            const files = this.app.vault.getMarkdownFiles();
            const exclusions = (this.settings.indexExclusions || '').split(',').map(e => e.trim()).filter(e => e);
            
            this.index = [];
            
            for (const file of files) {
                // Check exclusions
                if (exclusions.some(ex => file.path.includes(ex))) {
                    continue;
                }
                
                const content = await this.app.vault.read(file);
                const chunks = this.chunkText(content);
                
                for (const chunk of chunks) {
                    if (chunk.trim() === '') continue;
                    try {
                        const embedding = await this.embeddingService.getEmbedding(chunk);
                        this.index.push({
                            fileId: file.path,
                            text: chunk,
                            embedding
                        });
                    } catch (e) {
                        console.warn(`Failed to embed chunk in ${file.path}`);
                    }
                }
            }
            new Notice(`Vault QA indexing complete! Indexed ${this.index.length} chunks.`);
        } catch (e) {
            console.error('Error indexing vault:', e);
            new Notice('Vault QA indexing failed. Check console for details.', 5000);
        } finally {
            this.isIndexing = false;
        }
    }

    async search(query: string, topK = 5, activeProject?: any): Promise<DocumentChunk[]> {
        if (this.index.length === 0) {
            new Notice('Vault is not indexed. Please index the vault first in settings or Chat mode.');
            return [];
        }
        
        try {
            const queryEmbedding = await this.embeddingService.getEmbedding(query);
            
            // Apply Project filters
            let filteredIndex = this.index;
            if (activeProject) {
                const included = activeProject.includeFolders?.split(',').map((f: string) => f.trim()).filter(Boolean) || [];
                const excluded = activeProject.excludeFolders?.split(',').map((f: string) => f.trim()).filter(Boolean) || [];
                
                if (included.length > 0) {
                    filteredIndex = filteredIndex.filter(chunk => included.some((inc: string) => chunk.fileId.startsWith(inc)));
                }
                if (excluded.length > 0) {
                    filteredIndex = filteredIndex.filter(chunk => !excluded.some((exc: string) => chunk.fileId.startsWith(exc)));
                }
            }
            
            const scoredChunks = filteredIndex.map(chunk => ({
                chunk,
                score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
            }));
            
            scoredChunks.sort((a, b) => b.score - a.score);
            
            return scoredChunks
                .filter(item => item.score >= (this.settings.qaModeThreshold || 0.70))
                .slice(0, topK)
                .map(item => item.chunk);
        } catch (e) {
            console.error('Error searching vault:', e);
            return [];
        }
    }

    /**
     * Search vault with a time-window filter.
     * Only returns chunks from files modified within the date range.
     */
    async searchByDate(query: string, startDate: number, endDate: number, topK = 5): Promise<DocumentChunk[]> {
        if (this.index.length === 0) return [];

        try {
            // Get files in the date range
            const filesInRange = new Set<string>();
            const allFiles = this.app.vault.getMarkdownFiles();
            for (const file of allFiles) {
                const mtime = file.stat.mtime;
                if (mtime >= startDate && mtime <= endDate) {
                    filesInRange.add(file.path);
                }
            }

            if (filesInRange.size === 0) return [];

            const queryEmbedding = await this.embeddingService.getEmbedding(query);
            const filteredIndex = this.index.filter(chunk => filesInRange.has(chunk.fileId));

            const scoredChunks = filteredIndex.map(chunk => ({
                chunk,
                score: this.cosineSimilarity(queryEmbedding, chunk.embedding)
            }));

            scoredChunks.sort((a, b) => b.score - a.score);
            return scoredChunks.slice(0, topK).map(item => item.chunk);
        } catch (e) {
            console.error('Error in time-window search:', e);
            return [];
        }
    }

    /**
     * Parse natural language date ranges into timestamps.
     */
    static parseDateRange(input: string): { start: number; end: number } | null {
        const now = Date.now();
        const day = 86400000;
        const lower = input.toLowerCase();
        
        if (lower.includes('today')) return { start: now - day, end: now };
        if (lower.includes('yesterday')) return { start: now - 2 * day, end: now - day };
        if (lower.includes('last week') || lower.includes('past week')) return { start: now - 7 * day, end: now };
        if (lower.includes('last month') || lower.includes('past month')) return { start: now - 30 * day, end: now };
        if (lower.includes('last 3 days') || lower.includes('past 3 days')) return { start: now - 3 * day, end: now };
        
        // Try to parse "last N days"
        const daysMatch = lower.match(/(?:last|past)\s+(\d+)\s*days?/);
        if (daysMatch) return { start: now - parseInt(daysMatch[1]) * day, end: now };
        
        return null;
    }
}
