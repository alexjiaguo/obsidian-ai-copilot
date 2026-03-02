import { App, TFile, TFolder, normalizePath } from 'obsidian';

const SOUL_DIR = '.ai-copilot/personas';

type MemoryCategory = 'fact' | 'mistake' | 'preference';

export class PersonaSoulService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    // ── Path helpers ──────────────────────────────────────────

    private personaDir(personaId: string): string {
        return normalizePath(`${SOUL_DIR}/${personaId}`);
    }

    private soulPath(personaId: string): string {
        return normalizePath(`${this.personaDir(personaId)}/soul.md`);
    }

    private memoryPath(personaId: string): string {
        return normalizePath(`${this.personaDir(personaId)}/memory.md`);
    }

    // ── Folder creation ──────────────────────────────────────

    private async ensureDir(dirPath: string): Promise<void> {
        const parts = dirPath.split('/');
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            const normalized = normalizePath(current);
            const existing = this.app.vault.getAbstractFileByPath(normalized);
            if (!existing) {
                await this.app.vault.createFolder(normalized);
            }
        }
    }

    // ── Soul (personality / behavioral instructions) ─────────

    async loadSoul(personaId: string): Promise<string> {
        const path = this.soulPath(personaId);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        return '';
    }

    async saveSoul(personaId: string, content: string): Promise<void> {
        const path = this.soulPath(personaId);
        await this.ensureDir(this.personaDir(personaId));
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            await this.app.vault.modify(file, content);
        } else {
            await this.app.vault.create(path, content);
        }
    }

    /**
     * Initialise default soul.md for a persona if it doesn't exist yet.
     */
    async ensureDefaultSoul(personaId: string, personaName: string): Promise<void> {
        const path = this.soulPath(personaId);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing) return; // already has a soul file

        const defaultSoul = this.getDefaultSoulContent(personaId, personaName);
        await this.ensureDir(this.personaDir(personaId));
        await this.app.vault.create(path, defaultSoul);
    }

    // ── Memory (facts, mistakes, preferences) ────────────────

    async loadMemory(personaId: string): Promise<string> {
        const path = this.memoryPath(personaId);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        return '';
    }

    /**
     * Append a memory entry under the appropriate category heading.
     * Creates the file and category headings if they don't exist.
     */
    async addMemory(personaId: string, content: string, category: MemoryCategory): Promise<string> {
        const path = this.memoryPath(personaId);
        await this.ensureDir(this.personaDir(personaId));

        let existing = '';
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            existing = await this.app.vault.read(file);
        }

        // Deduplicate (case-insensitive check)
        if (existing.toLowerCase().includes(content.toLowerCase().trim())) {
            return 'This memory already exists.';
        }

        // Build entry
        const timestamp = new Date().toISOString().split('T')[0];
        const entry = category === 'mistake'
            ? `- [${timestamp}] ${content.trim()}`
            : `- ${content.trim()}`;

        // Ensure the file has the proper structure
        if (!existing) {
            existing = `# Memory\n\n## Facts\n\n## Mistakes\n\n## Preferences\n`;
        }

        // Find the right section and append
        const sectionHeading = `## ${category.charAt(0).toUpperCase() + category.slice(1)}`;
        // Pluralise for the heading
        const headingMap: Record<MemoryCategory, string> = {
            fact: '## Facts',
            mistake: '## Mistakes',
            preference: '## Preferences',
        };
        const heading = headingMap[category];

        if (existing.includes(heading)) {
            // Find the heading and insert the entry right after it
            const headingIndex = existing.indexOf(heading);
            const afterHeading = headingIndex + heading.length;
            const updated = existing.slice(0, afterHeading) + '\n' + entry + existing.slice(afterHeading);

            if (file && file instanceof TFile) {
                await this.app.vault.modify(file, updated);
            } else {
                await this.app.vault.create(path, updated);
            }
        } else {
            // Section doesn't exist, append it
            const updated = existing + `\n${heading}\n${entry}\n`;
            if (file && file instanceof TFile) {
                await this.app.vault.modify(file, updated);
            } else {
                await this.app.vault.create(path, updated);
            }
        }

        return `Memory saved (${category}): "${content.trim().substring(0, 50)}..."`;
    }

    // ── Build preamble for system prompt injection ───────────

    /**
     * Combine soul.md + memory.md into a single block for the system prompt.
     */
    async buildSoulPreamble(personaId: string): Promise<string> {
        const soul = await this.loadSoul(personaId);
        const memory = await this.loadMemory(personaId);

        let preamble = '';

        if (soul) {
            preamble += `\n\n=== PERSONA SOUL ===\n${soul}\n=== END SOUL ===\n`;
        }

        if (memory) {
            preamble += `\n\n=== PERSONA MEMORY ===\n${memory}\n=== END MEMORY ===\n`;
        }

        return preamble;
    }

    // ── Default soul content per persona ─────────────────────

    private getDefaultSoulContent(personaId: string, personaName: string): string {
        const toolInstructions = `
## Your Tools

You have access to powerful tools inside Obsidian. Always use the right tool for the job:

### Reading & Navigating
- \`read_note\` — Read the content of any note in the vault
- \`list_folder\` — List files and folders in a directory
- \`read_pdf\` — Extract text from PDF files
- \`search_vault_by_date\` — Find notes by date range (e.g. "last week")

### Writing & Editing
- **To edit an existing file**: FIRST use \`read_note\` to get the current content, THEN use \`edit_note\` with exact \`old_text\` and \`new_text\`. When the user provides a file via @mention, its content is already in context — go straight to \`edit_note\`.
- \`create_note\` — Create a new file
- \`append_to_note\` — Append content to an existing note

### Web & Media
- \`web_search\` — Search the web for current information
- \`get_youtube_transcript\` — Get transcript from a YouTube video
- \`summarize_url\` — Summarize any URL (article, video, podcast)
- \`save_summary_as_note\` — Save a URL summary as a vault note with metadata

### Skills
- \`list_skills\` — Discover available agentic skills
- \`use_skill\` — Activate a skill for specialized expertise
- Before answering domain-specific questions, consider if a skill exists that could help. Check with \`list_skills\` first.

### MCP (External Integrations)
- Tools prefixed with \`mcp__\` are external integrations (calendars, databases, etc.)
- When the user's request involves external services, check if an MCP tool is available

### Memory
- \`save_memory\` — Save a general user preference to long-term memory
- \`save_persona_memory\` — Save a fact, mistake, or preference specific to this persona
- \`list_memories\` — List all saved memories

## Memory Protocol

You have persistent memory across conversations. Use it wisely:

1. **Facts**: When the user tells you something important about themselves, their preferences, or their workflow, use \`save_persona_memory\` with category "fact".
2. **Mistakes**: When you make a mistake and the user corrects you, use \`save_persona_memory\` with category "mistake" to remember the lesson. Always describe what went wrong and the correct approach.
3. **Preferences**: When the user expresses a recurring preference about how they want things done, use \`save_persona_memory\` with category "preference".

Do NOT ask for permission before saving memories — just do it when appropriate.
`;

        const personas: Record<string, string> = {
            'default': `# Soul — Default Assistant

You are a helpful AI assistant embedded in Obsidian. You help users write, think, organize, and manage their knowledge vault. You are proactive, concise, and action-oriented.

When the user asks you to do something, DO it — don't just explain how to do it.
${toolInstructions}`,

            'code-expert': `# Soul — Code Expert

You are an expert software engineer and architect embedded in Obsidian. You provide concise, high-quality code solutions using modern best practices. You prefer TypeScript and think in systems.

When reviewing code, be direct about issues. When writing code, include comments only where logic is non-obvious.
${toolInstructions}`,

            'creative-writer': `# Soul — Creative Writer

You are a creative writer embedded in Obsidian. You help brainstorm ideas, draft content, refine prose, and develop narrative. You are imaginative, engaging, and have a keen eye for voice and flow.

Match the user's writing style when editing their work. Offer bold suggestions but respect their creative vision.
${toolInstructions}`,

            'academic': `# Soul — Academic Researcher

You are an academic research assistant embedded in Obsidian. You provide formal, well-structured, and evidence-based responses. You maintain academic rigor and cite sources where possible.

Structure your responses with clear sections. Use precise language and avoid informal phrasing.
${toolInstructions}`,
        };

        return personas[personaId] || personas['default'].replace('Default Assistant', personaName);
    }
}
