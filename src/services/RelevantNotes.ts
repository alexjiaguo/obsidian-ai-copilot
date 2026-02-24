import { App, TFile } from 'obsidian';
import { VaultQA } from './VaultQA';
import type { DocumentChunk } from './VaultQA';

export class RelevantNotes {
    private app: App;
    private vaultQA: VaultQA;

    constructor(app: App, vaultQA: VaultQA) {
        this.app = app;
        this.vaultQA = vaultQA;
    }

    /**
     * Find notes similar to the given file based on its content.
     * Uses the existing VaultQA embedding index.
     * Returns file paths of the top-N most relevant notes (excluding the file itself).
     */
    async findRelated(filePath: string, topK = 5): Promise<{ path: string; score: number }[]> {
        if (!this.vaultQA.isIndexed) return [];

        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) return [];

            const content = await this.app.vault.cachedRead(file);
            if (!content || content.trim().length < 20) return [];

            // Take the first ~500 chars as a representative snippet
            const snippet = content.substring(0, 500);
            const results = await this.vaultQA.search(snippet, topK + 5); // over-fetch to filter self

            // Deduplicate by fileId and exclude the source file
            const seen = new Set<string>();
            const filtered: { path: string; score: number }[] = [];

            for (const chunk of results) {
                if (chunk.fileId === filePath) continue;
                if (seen.has(chunk.fileId)) continue;
                seen.add(chunk.fileId);
                // We don't have score in DocumentChunk return, so estimate from order
                filtered.push({ path: chunk.fileId, score: 1 - filtered.length * 0.1 });
                if (filtered.length >= topK) break;
            }

            return filtered;
        } catch (e) {
            console.error("RelevantNotes Error:", e);
            return [];
        }
    }
}
