import { App, TFile, TFolder, Vault } from 'obsidian';
import { ContentExtractor } from './ContentExtractor';

export interface ContextItem {
    path: string;
    type: 'file' | 'folder' | 'selection' | 'heading' | 'image' | 'url';
    content?: string;
    heading?: string; // For heading type
    data?: string; // For base64 image data
}

export interface SearchResult {
    type: 'file' | 'heading' | 'folder';
    file: TFile;
    folder?: TFolder;  // For folder type results
    heading?: any; // HeadingCache
    matchScore: number;
}

export class ContextManager {
    app: App;
    private searchCache: Map<string, { results: SearchResult[]; timestamp: number }> = new Map();
    private urlCache: Map<string, { content: string; timestamp: number }> = new Map();
    private cacheTimeout = 5000; // 5 seconds cache
    private urlCacheTimeout = 60000; // 60 seconds for URL content
    private contentExtractor = new ContentExtractor();

    constructor(app: App) {
        this.app = app;
    }

    // Read file content from the vault
    async getFileContent(path: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return await this.app.vault.read(file);
        } else if (file instanceof TFolder) {
            return this.getFolderContent(file);
        }
        return `Error: File not found at ${path}`;
    }

    // Get a rich summary of a folder's contents (shallow read)
    private getFolderContent(folder: TFolder): string {
        const lines: string[] = [`Folder: ${folder.path}`];
        const files: TFile[] = [];
        const subfolders: TFolder[] = [];

        for (const child of folder.children) {
            if (child instanceof TFile) {
                files.push(child);
            } else if (child instanceof TFolder) {
                subfolders.push(child);
            }
        }

        if (subfolders.length > 0) {
            lines.push(`\nSubfolders (${subfolders.length}):`);
            for (const sf of subfolders) {
                const childCount = sf.children?.length ?? 0;
                lines.push(`  📁 ${sf.name}/ (${childCount} items)`);
            }
        }

        if (files.length > 0) {
            lines.push(`\nFiles (${files.length}):`);
            for (const f of files) {
                const sizeKB = (f.stat.size / 1024).toFixed(1);
                lines.push(`  📄 ${f.name} (${sizeKB} KB)`);
            }
        }

        if (files.length === 0 && subfolders.length === 0) {
            lines.push('(empty folder)');
        }

        return lines.join('\n');
    }

    // Get active context (folder if selected in file explorer, else active file)
    async getActiveContextContent(): Promise<{ content: string; path: string; type: 'file' | 'folder' | 'url' } | null> {
        // 1. Check if a folder is explicitly selected in the file explorer
        try {
            const fileExplorer = document.querySelector('.workspace-leaf-content[data-type="file-explorer"]');
            if (fileExplorer) {
                const activeEl = fileExplorer.querySelector('.is-active');
                if (activeEl) {
                    const path = activeEl.getAttribute('data-path');
                    if (path) {
                        const abstractFile = this.app.vault.getAbstractFileByPath(path);
                        if (abstractFile instanceof TFolder) {
                            return {
                                content: this.getFolderContent(abstractFile),
                                path: abstractFile.path,
                                type: 'folder'
                            };
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error finding active folder:', e);
        }

        // 2. Check for active web view (e.g., Surfing plugin)
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf && activeLeaf.view) {
            const viewType = activeLeaf.view.getViewType();
            if (viewType === 'surfing-view' || viewType === 'web-browser-view') {
                const state = activeLeaf.view.getState();
                if (state && state.url && typeof state.url === 'string' && state.url.startsWith('http')) {
                    const url = state.url;
                    
                    const now = Date.now();
                    const cached = this.urlCache.get(url);
                    if (cached && (now - cached.timestamp < this.urlCacheTimeout)) {
                        return { content: cached.content, path: url, type: 'url' };
                    }
                    
                    try {
                        const extracted = await this.contentExtractor.extract(url);
                        let content = extracted.content || "No content could be extracted.";
                        if (extracted.title) {
                            content = `# ${extracted.title}\n\n${content}`;
                        }
                        this.urlCache.set(url, { content, timestamp: now });
                        return { content, path: url, type: 'url' };
                    } catch (e) {
                        console.error('Error fetching web view content:', e);
                        // We can still return the URL as context even if fetch fails
                        return { content: `Error fetching URL: ${url}`, path: url, type: 'url' };
                    }
                }
            }
        }

        // 3. Fallback to active file
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return null;
        
        try {
            const content = await this.app.vault.read(activeFile);
            return {
                content: content,
                path: activeFile.path,
                type: 'file'
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
            } else if (item.type === 'url') {
                 const content = item.content || "URL content not provided.";
                 return `\n=== WEBPAGE: ${item.path} ===\n${content}\n=====================\n`;
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

    // Search for files and folders to support @ mentions
    searchFiles(query: string): SearchResult[] {
        const cacheKey = query.toLowerCase();
        const cached = this.searchCache.get(cacheKey);
        const now = Date.now();

        // Return cached results if still valid
        if (cached && now - cached.timestamp < this.cacheTimeout) {
            return cached.results;
        }

        console.debug('ContextManager: searchFiles called with', query);
        const files = this.app.vault.getFiles();
        const allFolders = this.getAllFolders();
        if (!query) {
            // Show a mix of recent files and top-level folders
            const fileResults = files.slice(0, 15).map(f => ({ type: 'file' as const, file: f, matchScore: 0 }));
            const folderResults = allFolders.slice(0, 5).map(f => ({ type: 'folder' as const, file: null as any, folder: f, matchScore: 0 }));
            const results = [...folderResults, ...fileResults];
            this.searchCache.set(cacheKey, { results, timestamp: now });
            return results;
        }

        const lowerQuery = query.toLowerCase();
        const results: SearchResult[] = [];

        // Match folders
        for (const folder of allFolders) {
            if (folder.path.toLowerCase().includes(lowerQuery) || folder.name.toLowerCase().includes(lowerQuery)) {
                results.push({ type: 'folder', file: null as any, folder: folder, matchScore: 12 });
            }
        }

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
        const finalResults = results.sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);

        // Cache the results
        this.searchCache.set(cacheKey, { results: finalResults, timestamp: now });

        return finalResults;
    }

    // Get all folders in the vault (excluding hidden folders)
    private getAllFolders(): TFolder[] {
        const folders: TFolder[] = [];
        const rootFolder = this.app.vault.getRoot();
        this.collectFolders(rootFolder, folders);
        return folders;
    }

    private collectFolders(folder: TFolder, results: TFolder[]): void {
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                // Skip hidden folders (starting with .)
                if (!child.name.startsWith('.')) {
                    results.push(child);
                    this.collectFolders(child, results);
                }
            }
        }
    }
}
