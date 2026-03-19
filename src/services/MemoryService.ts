import { App, TFile } from 'obsidian';

interface MemoryEntry {
    id: string;
    content: string;
    createdAt: number;
    source?: string; // which session created this
}

const MEMORY_FILE = 'ai-copilot-memory.json';

export class MemoryService {
    private app: App;
    private memories: MemoryEntry[] = [];
    private loaded = false;
    private loadPromise: Promise<void> | null = null; // Prevent concurrent loads

    constructor(app: App) {
        this.app = app;
    }

    async load(): Promise<void> {
        // Return early if already loaded
        if (this.loaded && this.loadPromise === null) return;

        // Prevent concurrent loads
        if (this.loadPromise) {
            await this.loadPromise;
            return;
        }

        this.loadPromise = this._doLoad();
        await this.loadPromise;
        this.loadPromise = null;
    }

    private async _doLoad(): Promise<void> {
        try {
            const file = this.app.vault.getAbstractFileByPath(MEMORY_FILE);
            if (file && file instanceof TFile) {
                const raw = await this.app.vault.read(file);
                this.memories = JSON.parse(raw);
            }
        } catch (e) {
            console.warn("MemoryService: Could not load memories, starting fresh.", e);
            this.memories = [];
        }
        this.loaded = true;
    }

    private async save(): Promise<void> {
        const json = JSON.stringify(this.memories, null, 2);
        const file = this.app.vault.getAbstractFileByPath(MEMORY_FILE);
        if (file && file instanceof TFile) {
            await this.app.vault.modify(file, json);
        } else {
            await this.app.vault.create(MEMORY_FILE, json);
        }
    }

    async addMemory(content: string, source?: string): Promise<string> {
        await this.load();
        
        // Deduplicate: skip if very similar to an existing entry
        const isDuplicate = this.memories.some(m => 
            m.content.toLowerCase().trim() === content.toLowerCase().trim()
        );
        if (isDuplicate) return "This memory already exists.";

        const entry: MemoryEntry = {
            id: crypto.randomUUID(),
            content: content.trim(),
            createdAt: Date.now(),
            source
        };
        this.memories.push(entry);
        await this.save();
        return `Memory saved: "${content.trim().substring(0, 50)}..."`;
    }

    async deleteMemory(id: string): Promise<string> {
        await this.load();
        const before = this.memories.length;
        this.memories = this.memories.filter(m => m.id !== id);
        if (this.memories.length < before) {
            await this.save();
            return "Memory deleted.";
        }
        return "Memory not found.";
    }

    async listMemories(): Promise<string> {
        await this.load();
        if (this.memories.length === 0) return "No saved memories.";
        return this.memories.map((m, i) => 
            `${i + 1}. [${m.id.slice(0, 8)}] ${m.content}`
        ).join('\n');
    }

    /**
     * Get all memories as a formatted preamble for system prompt injection.
     */
    async getMemoryPreamble(): Promise<string> {
        await this.load();
        if (this.memories.length === 0) return '';
        
        const lines = this.memories.map(m => `- ${m.content}`).join('\n');
        return `\n\n=== USER PREFERENCES & MEMORIES ===\nThe user has asked you to remember the following:\n${lines}\n===================================\n`;
    }
}
