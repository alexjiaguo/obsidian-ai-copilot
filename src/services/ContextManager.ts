import { App, TFile, TFolder, Vault } from 'obsidian';

export interface ContextItem {
    path: string;
    type: 'file' | 'folder' | 'selection' | 'heading' | 'image';
    content?: string;
    heading?: string; // For heading type
    data?: string; // For base64 image data
}

export interface SearchResult {
    type: 'file' | 'heading';
    file: TFile;
    heading?: any; // HeadingCache
    matchScore: number;
}

export class ContextManager {
    app: App;

    constructor(app: App) {
        this.app = app;
    }

    // Read file content from the vault
    async getFileContent(path: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        } else if (file instanceof TFolder) {
             return `Folder: ${path}\nContains: ${file.children.map(c => c.name).join(', ')}`;
        }
        return `Error: File not found at ${path}`;
    }

    // Get active file content
    async getActiveFileContent(): Promise<{ content: string; path: string } | null> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;
        
        try {
            const content = await this.app.vault.read(activeFile);
            return {
                content: content,
                path: activeFile.path
            };
        } catch (e) {
            console.error('Error reading active file:', e);
            return null;
        }
    }

    // Resolve multiple context items
    async resolveContexts(items: ContextItem[]): Promise<string> {
        const contextParts = await Promise.all(items.map(async (item) => {
            if (item.type === 'selection') {
                return `\n=== SELECTED TEXT ===\n${item.data || item.content}\n=====================\n`;
            } else if (item.type === 'file') {
                const content = item.content || await this.getFileContent(item.path);
                return `\n=== FILE: ${item.path} ===\n${content}\n=====================\n`;
            } else if (item.type === 'folder') {
                 const content = await this.getFileContent(item.path);
                 return `\n=== FOLDER: ${item.path} ===\n${content}\n=====================\n`;
            } else if (item.type === 'heading') {
                const content = await this.getFileContent(item.path);
                // Ideally extract just the section. For now, return whole file with note.
                return `\n=== FILE: ${item.path} (Focus: ${item.heading}) ===\n${content}\n=====================\n`;
            } else if (item.type === 'image') {
                return `\n=== IMAGE: ${item.path} (Attached) ===\n`;
            }
            return '';
        }));

        return contextParts.join('\n');
    }

    // Search for files (simple fuzzy search) to support @ mentions
    searchFiles(query: string): SearchResult[] {
        console.log('ContextManager: searchFiles called with', query);
        const files = this.app.vault.getFiles();
        if (!query) {
            return files.slice(0, 20).map(f => ({ type: 'file', file: f, matchScore: 0 }));
        }
        
        const lowerQuery = query.toLowerCase();
        const results: SearchResult[] = [];

        for (const file of files) {
            // Match Filename
            if (file.path.toLowerCase().includes(lowerQuery) || file.basename.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'file', file: file, matchScore: 10 });
            }

            // Match Headings (Antigravity-style depth)
            const cache = this.app.metadataCache.getFileCache(file);
            if (cache?.headings) {
                for (const h of cache.headings) {
                    if (h.heading.toLowerCase().includes(lowerQuery)) {
                        results.push({ type: 'heading', file: file, heading: h, matchScore: 5 });
                    }
                }
            }
        }

        // Sort by score then name
        return results.sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);
    }
}
