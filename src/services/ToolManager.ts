import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { WebSearch } from './WebSearch';
import { YouTubeTranscriber } from './YouTubeTranscriber';
import { PDFService } from './PDFService';
import { MemoryService } from './MemoryService';
import { VaultQA } from './VaultQA';
import { ContentExtractor } from './ContentExtractor';
import { MCPClientService } from './MCPClientService';
import type { AIProvider } from './APIService';
import { SkillService } from './SkillService';
import { PersonaSoulService } from './PersonaSoulService';

export interface Tool {
    name: string;
    description: string;
    parameters: any; // JSON Schema
    execute: (args: any) => Promise<string>;
}

export class ToolManager {
    private app: App;
    private tools: Tool[] = [];
    private webSearch: WebSearch;
    private ytTranscriber: YouTubeTranscriber;
    private pdfService: PDFService;
    private memoryService: MemoryService;
    private vaultQA: VaultQA | null;
    private contentExtractor: ContentExtractor;
    private mcpClientService?: MCPClientService;
    private aiProvider: AIProvider | null;
    private skillService: SkillService | null;
    private personaSoulService: PersonaSoulService | null;
    private activePersonaId: string = 'default';

    constructor(app: App, memoryService?: MemoryService, vaultQA?: VaultQA, mcpClientService?: MCPClientService, aiProvider?: AIProvider, skillService?: SkillService, personaSoulService?: PersonaSoulService) {
        this.app = app;
        this.webSearch = new WebSearch();
        this.ytTranscriber = new YouTubeTranscriber();
        this.pdfService = new PDFService(app);
        this.memoryService = memoryService || new MemoryService(app);
        this.vaultQA = vaultQA || null;
        this.contentExtractor = new ContentExtractor();
        this.mcpClientService = mcpClientService;
        this.aiProvider = aiProvider || null;
        this.skillService = skillService || null;
        this.personaSoulService = personaSoulService || null;
        this.registerTools();
    }

    /**
     * Update the AI provider reference (e.g., after settings change).
     */
    setAIProvider(provider: AIProvider) {
        this.aiProvider = provider;
    }

    /**
     * Set the active persona ID so persona-specific tools know which persona to target.
     */
    setActivePersonaId(personaId: string) {
        this.activePersonaId = personaId;
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
                } catch (error: any) {
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
                } catch (error: any) {
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
                } catch (error: any) {
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
                } catch (error: any) {
                    return `Error listing folder: ${error.message}`;
                }
            }
        });
        // 5. Web Search
        this.tools.push({
            name: 'web_search',
            description: 'Searches the web for up-to-date information on a given topic.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query string' }
                },
                required: ['query']
            },
            execute: async ({ query }) => {
                try {
                    return await this.webSearch.search(query);
                } catch (error: any) {
                    return `Error searching web: ${error.message}`;
                }
            }
        });

        // 6. YouTube Transcript
        this.tools.push({
            name: 'get_youtube_transcript',
            description: 'Fetches the transcript/captions for a YouTube video URL.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The full YouTube video URL' }
                },
                required: ['url']
            },
            execute: async ({ url }) => {
                try {
                    return await this.ytTranscriber.getTranscript(url);
                } catch (error: any) {
                    return `Error fetching YouTube transcript: ${error.message}`;
                }
            }
        });

        // 7. Edit Note (Composer)
        this.tools.push({
            name: 'edit_note',
            description: 'Proposes an edit to a markdown note. Replaces exactly old_text with new_text. Will show a diff to the user for approval.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Full path to the note (e.g., "Folder/My Note.md")' },
                    old_text: { type: 'string', description: 'The exact text block to replace' },
                    new_text: { type: 'string', description: 'The new text to insert instead' }
                },
                required: ['path', 'old_text', 'new_text']
            },
            execute: async ({ path, old_text, new_text }) => {
                // Return a JSON string that ChatView can parse and render ComposerDiff
                return JSON.stringify({
                    _isComposerDiff: true,
                    path,
                    oldText: old_text,
                    newText: new_text
                });
            }
        });

        // 8. Read PDF
        this.tools.push({
            name: 'read_pdf',
            description: 'Reads and extracts text content from a PDF file in the vault.',
            parameters: {
                type: 'object',
                properties: {
                    path: { type: 'string', description: 'Path to the PDF file in the vault' }
                },
                required: ['path']
            },
            execute: async ({ path }) => {
                try {
                    return await this.pdfService.extractText(path);
                } catch (error: any) {
                    return `Error reading PDF: ${error.message}`;
                }
            }
        });

        // 9. Save Memory
        this.tools.push({
            name: 'save_memory',
            description: 'Saves a user preference or instruction to long-term memory. Use this when the user says "remember this", "always do X", or expresses a recurring preference.',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The preference or instruction to remember' }
                },
                required: ['content']
            },
            execute: async ({ content }) => {
                try {
                    return await this.memoryService.addMemory(content);
                } catch (error: any) {
                    return `Error saving memory: ${error.message}`;
                }
            }
        });

        // 10. List Memories
        this.tools.push({
            name: 'list_memories',
            description: 'Lists all saved user memories and preferences.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            execute: async () => {
                try {
                    return await this.memoryService.listMemories();
                } catch (error: any) {
                    return `Error listing memories: ${error.message}`;
                }
            }
        });

        // 11. Search Vault by Date
        this.tools.push({
            name: 'search_vault_by_date',
            description: 'Searches the vault for notes modified within a specific date range. Useful for queries like "what did I write last week?" or "find recent notes about X".',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query (what to look for)' },
                    time_range: { type: 'string', description: 'Natural language time range like "today", "yesterday", "last week", "last month", "last 3 days", "past 7 days"' }
                },
                required: ['query', 'time_range']
            },
            execute: async ({ query, time_range }) => {
                try {
                    if (!this.vaultQA) return "Vault QA is not initialized. Please enable and index the vault first.";
                    
                    const range = VaultQA.parseDateRange(time_range);
                    if (!range) return `Could not parse time range: "${time_range}". Try "today", "last week", "last 3 days", etc.`;
                    
                    const results = await this.vaultQA.searchByDate(query, range.start, range.end, 5);
                    if (results.length === 0) return `No matching notes found in the time range "${time_range}".`;
                    
                    return results.map((r, i) => `[${i + 1}] ${r.fileId}:\n${r.text.substring(0, 300)}`).join('\n\n');
                } catch (error: any) {
                    return `Error searching by date: ${error.message}`;
                }
            }
        });

        // 12. Summarize URL
        this.tools.push({
            name: 'summarize_url',
            description: 'Fetches content from any URL (YouTube video, blog post, article, podcast) and returns a structured summary with key points. Works best with YouTube videos that have captions and articles with readable text.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to summarize (YouTube, podcast, article, etc.)' },
                    detail_level: { type: 'string', enum: ['brief', 'detailed'], description: 'Level of detail for the summary. Default: brief' }
                },
                required: ['url']
            },
            execute: async ({ url, detail_level }) => {
                try {
                    // Step 1: Extract content
                    const extracted = await this.contentExtractor.extract(url);
                    
                    if (!extracted.content || 
                        extracted.content.startsWith('Failed to') || 
                        extracted.content.startsWith('No readable') ||
                        extracted.content.startsWith('No captions/transcript available')) {
                        return `Could not extract content from ${url}.\n\nDiagnostics:\n${extracted.extractionNotes.join('\n')}`;
                    }

                    // Step 2: Build context-aware summarization prompt
                    const isDetailed = detail_level === 'detailed';
                    const metaContext = this.buildMetaContext(extracted);
                    
                    const systemPrompt = `You are an expert content summarizer. Summarize the following ${extracted.type === 'youtube' ? 'video transcript' : extracted.type === 'apple_podcast' ? 'podcast transcript' : 'article'}.

${metaContext}

Provide your summary in this format:
## ${extracted.title || 'Summary'}

**Source:** ${extracted.type === 'youtube' ? 'YouTube' : extracted.siteName || 'Web'}
${extracted.metadata.channel ? `**Author/Channel:** ${extracted.metadata.channel}` : ''}
${extracted.metadata.show ? `**Podcast:** ${extracted.metadata.show}` : ''}
${extracted.metadata.duration ? `**Duration:** ${extracted.metadata.duration}` : ''}

### Key Points
- (bullet points of the most important takeaways)

${isDetailed ? '### Detailed Summary\n(comprehensive paragraph-form summary)\n\n### Notable Quotes or Data Points\n- (any specific quotes, statistics, or data mentioned)' : '### Summary\n(concise 2-3 sentence summary)'}

### Tags
(suggest 3-5 relevant tags as a comma-separated list)`;

                    // Step 3: Use AI provider for summarization
                    if (!this.aiProvider) {
                        // Fallback: return raw content with metadata header
                        return `## Content from ${url}\n\n**Type:** ${extracted.type}\n**Title:** ${extracted.title || 'Unknown'}\n\n---\n\n${extracted.content.substring(0, 3000)}\n\n---\n*AI summarization unavailable — raw content shown above.*`;
                    }

                    const contentToSummarize = extracted.content.substring(0, 60000); // Cap at 60K chars for LLM
                    const summary = await this.aiProvider.executeAction(contentToSummarize, systemPrompt);
                    return summary;
                } catch (error: any) {
                    return `Error summarizing URL: ${error.message}`;
                }
            }
        });

        // 14. List Skills
        this.tools.push({
            name: 'list_skills',
            description: 'Lists all available agentic skills with their names and descriptions. Call this first to discover which skills exist before using one.',
            parameters: {
                type: 'object',
                properties: {},
                required: []
            },
            execute: async () => {
                if (!this.skillService) return 'Error: SkillService is not configured.';
                try {
                    return await this.skillService.listSkills();
                } catch (error: any) {
                    return `Error listing skills: ${error.message}`;
                }
            }
        });

        // 15. Use Skill
        this.tools.push({
            name: 'use_skill',
            description: 'Loads a specific agentic skill by name and returns its full instructions. Use this to activate specialized expertise for a task. Call list_skills first if you are unsure which skill to use.',
            parameters: {
                type: 'object',
                properties: {
                    skill_name: { type: 'string', description: 'The name of the skill to load (e.g., "deep-research", "content-creator", "interview-prep")' },
                    task: { type: 'string', description: 'Brief description of what you want to accomplish with this skill' }
                },
                required: ['skill_name']
            },
            execute: async ({ skill_name, task }) => {
                if (!this.skillService) return 'Error: SkillService is not configured.';
                try {
                    // 1. Try exact name match
                    let skill = await this.skillService.findByName(skill_name);

                    // 2. Fallback to fuzzy search
                    if (!skill) {
                        const fuzzy = await this.skillService.findRelevant(skill_name, 3);
                        if (fuzzy.length > 0) {
                            skill = fuzzy[0];
                            const suggestions = fuzzy.map(s => `"${s.name}"`).join(', ');
                            if (fuzzy[0].name.toLowerCase() !== skill_name.toLowerCase()) {
                                return `Skill "${skill_name}" not found. Did you mean one of these? ${suggestions}\n\nCall use_skill again with the correct name.`;
                            }
                        } else {
                            return `Skill "${skill_name}" not found. Use list_skills to see all available skills.`;
                        }
                    }

                    // 3. Load full skill content
                    const content = this.skillService.getSkillContent(skill);
                    if (!content) return `Error: Could not read skill file for "${skill.name}".`;

                    // 4. Return structured skill activation block
                    const truncated = content.substring(0, 8000);
                    const taskLine = task ? `\n\n**YOUR TASK:** ${task}` : '';
                    return `=== SKILL ACTIVATED: ${skill.name} ===\n${skill.description}\n\n${truncated}${truncated.length < content.length ? '\n\n[... truncated, full skill is ' + content.length + ' chars]' : ''}${taskLine}\n=== END SKILL ===\n\nFollow the instructions in this skill to complete the task. Use your available tools as directed by the skill.`;
                } catch (error: any) {
                    return `Error loading skill: ${error.message}`;
                }
            }
        });

        // 16. Save Persona Memory
        this.tools.push({
            name: 'save_persona_memory',
            description: 'Saves a fact, mistake, or preference to this persona\'s persistent memory. Use this when the user tells you something important about themselves (fact), when you make an error and learn from it (mistake), or when the user expresses a recurring preference (preference).',
            parameters: {
                type: 'object',
                properties: {
                    content: { type: 'string', description: 'The memory content to save' },
                    category: { type: 'string', enum: ['fact', 'mistake', 'preference'], description: 'Category: fact (about the user), mistake (lesson learned), or preference (how user wants things done)' }
                },
                required: ['content', 'category']
            },
            execute: async ({ content, category }) => {
                if (!this.personaSoulService) return 'Error: PersonaSoulService is not configured.';
                try {
                    return await this.personaSoulService.addMemory(this.activePersonaId, content, category);
                } catch (error: any) {
                    return `Error saving persona memory: ${error.message}`;
                }
            }
        });

        // 17. Save Mistake (shorthand)
        this.tools.push({
            name: 'save_mistake',
            description: 'Shorthand to record a mistake you made and the correct approach. Call this when the user corrects you.',
            parameters: {
                type: 'object',
                properties: {
                    description: { type: 'string', description: 'What went wrong and the correct approach' }
                },
                required: ['description']
            },
            execute: async ({ description }) => {
                if (!this.personaSoulService) return 'Error: PersonaSoulService is not configured.';
                try {
                    return await this.personaSoulService.addMemory(this.activePersonaId, description, 'mistake');
                } catch (error: any) {
                    return `Error saving mistake: ${error.message}`;
                }
            }
        });

        // 13. Save Summary as Note
        this.tools.push({
            name: 'save_summary_as_note',
            description: 'Saves a URL summary as an Obsidian note with proper YAML frontmatter metadata (source, type, date, tags).',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'Source URL' },
                    title: { type: 'string', description: 'Title for the note' },
                    summary: { type: 'string', description: 'The summary content in markdown' },
                    folder: { type: 'string', description: 'Target folder path (e.g., "00_Inbox" or "Resources/Summaries"). Defaults to root.' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the note' },
                    content_type: { type: 'string', description: 'Type of content (youtube, podcast, article)' }
                },
                required: ['url', 'title', 'summary']
            },
            execute: async ({ url, title, summary, folder, tags, content_type }) => {
                try {
                    // Build frontmatter
                    const now = new Date().toISOString().split('T')[0];
                    const tagList = tags && tags.length > 0 ? tags : ['summary'];
                    const frontmatter = [
                        '---',
                        `source: "${url}"`,
                        `type: ${content_type || 'summary'}`,
                        `created: ${now}`,
                        `tags: [${tagList.map((t: string) => `"${t}"`).join(', ')}]`,
                        '---',
                    ].join('\n');

                    const fullContent = `${frontmatter}\n\n${summary}`;

                    // Determine path
                    const sanitizedTitle = title.replace(/[\\/:*?"<>|]/g, '-').substring(0, 100);
                    const folderPath = folder ? normalizePath(folder) : '';
                    const filePath = folderPath
                        ? normalizePath(`${folderPath}/${sanitizedTitle}.md`)
                        : normalizePath(`${sanitizedTitle}.md`);

                    // Ensure folders exist
                    await this.ensureFolders(filePath);

                    // Check if file exists
                    const existing = this.app.vault.getAbstractFileByPath(filePath);
                    if (existing) {
                        return `Note already exists at ${filePath}. Use a different title or folder.`;
                    }

                    const file = await this.app.vault.create(filePath, fullContent);
                    return `✅ Summary saved as note: ${file.path}`;
                } catch (error: any) {
                    return `Error saving summary note: ${error.message}`;
                }
            }
        });
    }

    private buildMetaContext(extracted: import('./ContentExtractor').ExtractedContent): string {
        const parts: string[] = [];
        if (extracted.title) parts.push(`Title: ${extracted.title}`);
        if (extracted.siteName) parts.push(`Source: ${extracted.siteName}`);
        if (extracted.metadata.channel) parts.push(`Channel: ${extracted.metadata.channel}`);
        if (extracted.metadata.show) parts.push(`Podcast: ${extracted.metadata.show}`);
        if (extracted.metadata.duration) parts.push(`Duration: ${extracted.metadata.duration}`);
        if (extracted.isTranscript) parts.push(`Note: This is a transcript, not written text. Interpret accordingly.`);
        return parts.length > 0 ? `Context:\n${parts.join('\n')}` : '';
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
        const files = folder.children.map((child: any) => {
            const type = child instanceof TFolder ? 'Folder' : 'File';
            return `- [${type}] ${child.name}`;
        }).join('\n');
        return files || "Empty folder";
    }

    public async getToolsDefinition() {
        const defs: any[] = this.tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters
            }
        }));

        if (this.mcpClientService) {
            try {
                const mcpTools = await this.mcpClientService.getAvailableTools();
                for (const t of mcpTools) {
                    defs.push({
                        type: 'function',
                        function: {
                            // Namespace the tool to route it easily
                            name: `mcp__${t.serverName.replace(/[^a-zA-Z0-9_-]/g, '_')}__${t.toolName.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
                            description: `[MCP: ${t.serverName}] ${t.description || t.toolName}`,
                            parameters: t.inputSchema
                        }
                    });
                }
            } catch (error) {
                console.error("[ToolManager] Error fetching MCP tools:", error);
            }
        }

        return defs;
    }

    public async executeTool(name: string, args: any): Promise<string> {
        // Handle MCP tools
        if (name.startsWith('mcp__')) {
            const parts = name.split('__');
            if (parts.length >= 3 && this.mcpClientService) {
                const serverName = parts[1];
                const toolName = parts.slice(2).join('__');
                try {
                    const result = await this.mcpClientService.callTool(serverName, toolName, args);
                    if (result && result.isError) {
                        return `MCP Tool Error: ${JSON.stringify(result.content)}`;
                    }
                    if (result && result.content) {
                        const textContent = result.content
                            .filter((c: any) => c.type === 'text')
                            .map((c: any) => c.text)
                            .join('\n');
                        return textContent || "Success (no output)";
                    }
                    return JSON.stringify(result);
                } catch (e: any) {
                    return `MCP Tool Execution Failed: ${e.message}`;
                }
            }
        }

        // Handle built-in tools
        const tool = this.tools.find(t => t.name === name);
        if (!tool) {
            return `Error: Tool ${name} not found.`;
        }
        return await tool.execute(args);
    }
}
