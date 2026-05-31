import { App, TFile, normalizePath } from 'obsidian';
import type { AICopilotSettings } from '../settings/Settings';
import { DEFAULT_MEMORY_CAPS } from '../settings/Settings';

const SOUL_DIR = '.ai-copilot/personas';

export type MemoryCategory = 'fact' | 'mistake' | 'preference';

const SECTION_HEADINGS: Record<MemoryCategory, string> = {
    fact: '## Facts',
    mistake: '## Mistakes',
    preference: '## Preferences',
};

const EMPTY_MEMORY_TEMPLATE = `# Memory

## Facts

## Mistakes

## Preferences
`;

export class PersonaSoulService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    private personaDir(personaId: string): string {
        return normalizePath(`${SOUL_DIR}/${personaId}`);
    }

    private soulPath(personaId: string): string {
        return normalizePath(`${this.personaDir(personaId)}/soul.md`);
    }

    private memoryPath(personaId: string): string {
        return normalizePath(`${this.personaDir(personaId)}/memory.md`);
    }

    getMemoryFilePath(personaId: string): string {
        return this.memoryPath(personaId);
    }

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

    async ensureDefaultSoul(personaId: string, personaName: string): Promise<void> {
        const path = this.soulPath(personaId);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing) return;

        const defaultSoul = this.getDefaultSoulContent(personaId, personaName);
        await this.ensureDir(this.personaDir(personaId));
        await this.app.vault.create(path, defaultSoul);
    }

    async loadMemory(personaId: string): Promise<string> {
        const path = this.memoryPath(personaId);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            return await this.app.vault.read(file);
        }
        return '';
    }

    async saveMemoryFile(personaId: string, content: string): Promise<void> {
        const path = this.memoryPath(personaId);
        await this.ensureDir(this.personaDir(personaId));
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            await this.app.vault.modify(file, content);
        } else {
            await this.app.vault.create(path, content || EMPTY_MEMORY_TEMPLATE);
        }
    }

    parseMemorySections(content: string): Record<MemoryCategory, string[]> {
        const sections: Record<MemoryCategory, string[]> = {
            fact: [],
            mistake: [],
            preference: [],
        };

        for (const category of Object.keys(SECTION_HEADINGS) as MemoryCategory[]) {
            sections[category] = this.parseSectionLines(content, SECTION_HEADINGS[category]);
        }

        return sections;
    }

    private parseSectionLines(content: string, heading: string): string[] {
        if (!content.includes(heading)) return [];

        const start = content.indexOf(heading) + heading.length;
        const rest = content.slice(start);
        const nextHeading = rest.search(/\n## /);
        const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading);

        return section
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('- '));
    }

    buildMemoryMarkdown(sections: Record<MemoryCategory, string[]>): string {
        const renderSection = (heading: string, lines: string[]) => {
            const body = lines.length > 0 ? `\n${lines.join('\n')}\n` : '\n';
            return `${heading}${body}`;
        };

        return `# Memory\n\n${renderSection('## Facts', sections.fact)}${renderSection('## Mistakes', sections.mistake)}${renderSection('## Preferences', sections.preference)}`;
    }

    applyMemoryCaps(
        content: string,
        caps: { facts: number; mistakes: number; preferences: number },
    ): string {
        const sections = this.parseMemorySections(content || EMPTY_MEMORY_TEMPLATE);

        return this.buildMemoryMarkdown({
            fact: this.capLines(sections.fact, caps.facts),
            mistake: this.capLines(sections.mistake, caps.mistakes),
            preference: this.capLines(sections.preference, caps.preferences),
        });
    }

    private capLines(lines: string[], max: number): string[] {
        if (max <= 0 || lines.length <= max) return lines;
        return lines.slice(-max);
    }

    async addMemory(personaId: string, content: string, category: MemoryCategory): Promise<string> {
        const path = this.memoryPath(personaId);
        await this.ensureDir(this.personaDir(personaId));

        let existing = await this.loadMemory(personaId);
        if (existing.toLowerCase().includes(content.toLowerCase().trim())) {
            return 'This memory already exists.';
        }

        const timestamp = new Date().toISOString().split('T')[0];
        const entry = category === 'mistake'
            ? `- [${timestamp}] ${content.trim()}`
            : `- ${content.trim()}`;

        if (!existing) {
            existing = EMPTY_MEMORY_TEMPLATE;
        }

        const heading = SECTION_HEADINGS[category];
        let updated: string;

        if (existing.includes(heading)) {
            const headingIndex = existing.indexOf(heading);
            const afterHeading = headingIndex + heading.length;
            updated = existing.slice(0, afterHeading) + '\n' + entry + existing.slice(afterHeading);
        } else {
            updated = existing + `\n${heading}\n${entry}\n`;
        }

        const file = this.app.vault.getAbstractFileByPath(path);
        if (file && file instanceof TFile) {
            await this.app.vault.modify(file, updated);
        } else {
            await this.app.vault.create(path, updated);
        }

        return `Memory saved (${category}): "${content.trim().substring(0, 50)}..."`;
    }

    async deleteMemory(
        personaId: string,
        content: string,
        category?: MemoryCategory,
    ): Promise<string> {
        const existing = await this.loadMemory(personaId);
        if (!existing) return 'No persona memory file found.';

        const needle = content.toLowerCase().trim();
        if (!needle) return 'Provide text to match the memory entry to delete.';

        const categories = category
            ? [category]
            : (Object.keys(SECTION_HEADINGS) as MemoryCategory[]);

        const sections = this.parseMemorySections(existing);
        let removed = 0;

        for (const cat of categories) {
            const before = sections[cat].length;
            sections[cat] = sections[cat].filter(line => !line.toLowerCase().includes(needle));
            removed += before - sections[cat].length;
        }

        if (removed === 0) {
            return `No memory entry matched "${content.trim()}".`;
        }

        await this.saveMemoryFile(personaId, this.buildMemoryMarkdown(sections));
        return `Removed ${removed} memory ${removed === 1 ? 'entry' : 'entries'}.`;
    }

    async clearSection(personaId: string, category: MemoryCategory): Promise<string> {
        const existing = await this.loadMemory(personaId);
        const sections = this.parseMemorySections(existing || EMPTY_MEMORY_TEMPLATE);
        const count = sections[category].length;
        sections[category] = [];
        await this.saveMemoryFile(personaId, this.buildMemoryMarkdown(sections));
        return `Cleared ${count} ${category} ${count === 1 ? 'entry' : 'entries'}.`;
    }

    async listMemorySummary(personaId: string): Promise<string> {
        const content = await this.loadMemory(personaId);
        if (!content) return 'No persona memory saved yet.';

        const sections = this.parseMemorySections(content);
        const format = (label: string, lines: string[]) => {
            if (lines.length === 0) return `${label}: (none)`;
            return `${label}:\n${lines.map(l => `  ${l}`).join('\n')}`;
        };

        return [
            format('Facts', sections.fact),
            format('Mistakes', sections.mistake),
            format('Preferences', sections.preference),
        ].join('\n\n');
    }

    async buildSoulPreamble(personaId: string, settings?: AICopilotSettings): Promise<string> {
        const soul = await this.loadSoul(personaId);
        let preamble = '';

        if (soul) {
            preamble += `\n\n=== PERSONA SOUL ===\n${soul}\n=== END SOUL ===\n`;
        }

        const personaMemoryEnabled = settings?.enablePersonaMemory ?? true;
        if (personaMemoryEnabled) {
            const rawMemory = await this.loadMemory(personaId);
            if (rawMemory) {
                const caps = {
                    facts: settings?.memoryMaxFacts ?? DEFAULT_MEMORY_CAPS.facts,
                    mistakes: settings?.memoryMaxMistakes ?? DEFAULT_MEMORY_CAPS.mistakes,
                    preferences: settings?.memoryMaxPreferences ?? DEFAULT_MEMORY_CAPS.preferences,
                };
                const memory = this.applyMemoryCaps(rawMemory, caps);
                preamble += `\n\n=== PERSONA MEMORY (obey Mistakes & Preferences before replying) ===\n${memory}\n=== END MEMORY ===\n`;
            }
        }

        return preamble;
    }

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
- \`list_skills\` — Discover enabled agentic skills
- \`use_skill\` — Activate an enabled skill for specialized expertise

### MCP (External Integrations)
- Tools prefixed with \`mcp__\` are external integrations (calendars, databases, etc.)

### Memory
- \`save_persona_memory\` — Save a fact, mistake, or preference for this persona (preferred)
- \`delete_persona_memory\` — Remove a memory when the user says "forget" or asks to drop a rule
- \`save_mistake\` — Shorthand to record a correction as a mistake
- \`save_memory\` — Save a vault-wide preference (use sparingly; prefer persona memory)
- \`list_memories\` — List global vault memories

## Memory Protocol — follow every turn

You have persistent persona memory in \`.ai-copilot/personas/<persona>/memory.md\`.

**Before replying:** Read Mistakes and Preferences in PERSONA MEMORY and comply.

**When to save (do not ask permission):**
1. **Mistake** — User corrects you ("wrong", "no", "don't", "not what I meant"). Use \`save_persona_memory\` category \`mistake\` with: \`Wrong: … → Correct: …\`. Or use \`save_mistake\`.
2. **Fact** — Stable info about the user ("I'm in Singapore", "my vault uses PARA"). Category \`fact\`.
3. **Preference** — How they want work done ("plain markdown only", "always cite sources"). Category \`preference\`.
4. **Remember** — Phrases like "remember this", "keep in mind", "always …" → save immediately.

**When to delete:**
- User says "forget that", "remove that memory", "don't remember …" → \`delete_persona_memory\` with matching text.

**Do NOT** ask "Should I save this?" — just save or delete when the situation matches.
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
