import { App, TFile } from 'obsidian';
import type { AICopilotSettings } from '../settings/Settings';
import { DEFAULT_MEMORY_CAPS } from '../settings/Settings';

interface MemoryEntry {
    id: string;
    content: string;
    createdAt: number;
    source?: string;
}

const MEMORY_FILE = 'ai-copilot-memory.json';

export class MemoryService {
    private app: App;
    private memories: MemoryEntry[] = [];
    private loaded = false;
    private loadPromise: Promise<void> | null = null;

    constructor(app: App) {
        this.app = app;
    }

    async load(): Promise<void> {
        if (this.loaded && this.loadPromise === null) return;

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
            await this.vaultModify(file, json);
        } else {
            await this.app.vault.create(MEMORY_FILE, json);
        }
    }

    private async vaultModify(file: TFile, content: string): Promise<void> {
        await this.app.vault.modify(file, content);
    }

    getMemoryFilePath(): string {
        return MEMORY_FILE;
    }

    async addMemory(content: string, source?: string): Promise<string> {
        await this.load();
        
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

    async deleteMemory(idOrContent: string): Promise<string> {
        await this.load();
        const needle = idOrContent.toLowerCase().trim();
        const before = this.memories.length;

        this.memories = this.memories.filter(m => {
            if (m.id === idOrContent || m.id.startsWith(idOrContent)) return false;
            if (m.content.toLowerCase().includes(needle)) return false;
            return true;
        });

        if (this.memories.length < before) {
            await this.save();
            return "Memory deleted.";
        }
        return "Memory not found.";
    }

    async clearAll(): Promise<string> {
        await this.load();
        const count = this.memories.length;
        this.memories = [];
        await this.save();
        return `Cleared ${count} global ${count === 1 ? 'memory' : 'memories'}.`;
    }

    async listMemories(): Promise<string> {
        await this.load();
        if (this.memories.length === 0) return "No saved memories.";
        return this.memories.map((m, i) => 
            `${i + 1}. [${m.id.slice(0, 8)}] ${m.content}`
        ).join('\n');
    }

    async getMemoriesForUI(): Promise<MemoryEntry[]> {
        await this.load();
        return [...this.memories];
    }

    async getMemoryPreamble(settings?: AICopilotSettings): Promise<string> {
        await this.load();
        if (this.memories.length === 0) return '';

        const maxGlobal = settings?.memoryMaxGlobal ?? DEFAULT_MEMORY_CAPS.global;
        const capped = maxGlobal > 0 && this.memories.length > maxGlobal
            ? this.memories.slice(-maxGlobal)
            : this.memories;
        
        const lines = capped.map(m => `- ${m.content}`).join('\n');
        const omitted = this.memories.length - capped.length;
        const note = omitted > 0
            ? `\n(Showing ${capped.length} most recent of ${this.memories.length} global memories.)`
            : '';

        return `\n\n=== USER PREFERENCES & MEMORIES (global) ===\nThe user has asked you to remember the following:\n${lines}${note}\n===================================\n`;
    }
}
