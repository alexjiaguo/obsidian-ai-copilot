import { App, TFile, TFolder, normalizePath } from 'obsidian';

export interface Tool {
    name: string;
    description: string;
    parameters: any; // JSON Schema
    execute: (args: any) => Promise<string>;
}

export class ToolManager {
    private app: App;
    private tools: Tool[] = [];

    constructor(app: App) {
        this.app = app;
        this.registerTools();
    }

    private registerTools() {
        // 1. Create Note
        this.tools.push({
            name: 'create_note',
            description: 'Creates a new markdown note at the specified path. If content is provided, it writes it to the file.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Full path to the new note (e.g., "Folder/My Note.md")' },
                    content: { type: 'string', description: 'Markdown content for the note' }
                },
                required: ['path']
            },
            execute: async ({ path, content }) => {
                try {
                    const normalizedPath = normalizePath(path);
                    // Ensure ends with .md
                    const finalPath = normalizedPath.endsWith('.md') ? normalizedPath : `${normalizedPath}.md`;
                    
                    const existing = this.app.vault.getAbstractFileByPath(finalPath);
                    if (existing) {
                        return `Error: File already exists at ${finalPath}`;
                    }

                    // Create folders if needed? Obsidian create() requires parent to exist usually, or we use createFolder?
                    // normalizePath handles separators. 
                    // Let's rely on vault.create. If parent folders don't exist, we might fail unless we ensure them.
                    await this.ensureFolders(finalPath);
                    
                    const file = await this.app.vault.create(finalPath, content || "");
                    return `Successfully created note: ${file.path}`;
                } catch (error) {
                    return `Error creating note: ${error.message}`;
                }
            }
        });

        // 2. Append to Note
        this.tools.push({
            name: 'append_to_note',
            description: 'Appends text to the end of an existing note.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the existing note' },
                    content: { type: 'string', description: 'Text to append' }
                },
                required: ['path', 'content']
            },
            execute: async ({ path, content }) => {
                try {
                    const normalizedPath = normalizePath(path);
                    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
                    if (!file || !(file instanceof TFile)) {
                        return `Error: File not found at ${normalizedPath}`;
                    }
                    await this.app.vault.append(file, `\n${content}`);
                    return `Successfully appended to ${file.path}`;
                } catch (error) {
                    return `Error appending to note: ${error.message}`;
                }
            }
        });

        // 3. Read Note
        this.tools.push({
            name: 'read_note',
            description: 'Reads the content of a note.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path of the note to read' }
                },
                required: ['path']
            },
            execute: async ({ path }) => {
                try {
                    const normalizedPath = normalizePath(path);
                    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
                    if (!file || !(file instanceof TFile)) {
                        return `Error: File not found at ${normalizedPath}`;
                    }
                    const content = await this.app.vault.read(file);
                    return content;
                } catch (error) {
                    return `Error reading note: ${error.message}`;
                }
            }
        });

        // 4. List Folder
        this.tools.push({
            name: 'list_folder',
            description: 'Lists files and folders within a specific directory.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the folder (use "/" for root)' }
                },
                required: ['path']
            },
            execute: async ({ path }) => {
                 try {
                    const normalizedPath = path === '/' ? '/' : normalizePath(path);
                    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
                    
                    if (!folder && normalizedPath === '/') {
                         // Root might be special handled or just loop vault.getRoot()
                         return this.listFiles(this.app.vault.getRoot());
                    }

                    if (!folder || !(folder instanceof TFolder)) {
                        return `Error: Folder not found at ${normalizedPath}`;
                    }
                    
                    return this.listFiles(folder);
                } catch (error) {
                    return `Error listing folder: ${error.message}`;
                }
            }
        });
    }

    private async ensureFolders(path: string) {
        // logic to create parent folders if missing
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath && parentPath !== "") {
            const folder = this.app.vault.getAbstractFileByPath(parentPath);
            if (!folder) {
                await this.app.vault.createFolder(parentPath);
            }
        }
    }

    private listFiles(folder: TFolder): string {
        const files = folder.children.map(child => {
            const type = child instanceof TFolder ? 'Folder' : 'File';
            return `- [${type}] ${child.name}`;
        }).join('\n');
        return files || "Empty folder";
    }

    public getToolsDefinition() {
        return this.tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));
    }

    public async executeTool(name: string, args: any): Promise<string> {
        const tool = this.tools.find(t => t.name === name);
        if (!tool) {
            return `Error: Tool ${name} not found.`;
        }
        return await tool.execute(args);
    }
}
