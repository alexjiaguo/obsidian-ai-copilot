import { App, TFile, TFolder, normalizePath } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';

interface SkillEntry {
    name: string;
    description: string;
    folderPath: string;   // absolute path on disk
    skillFilePath: string; // absolute path to SKILL.md
}

export class SkillService {
    private app: App;
    private skillsPath: string;
    private index: SkillEntry[] = [];
    private loaded = false;

    constructor(app: App, skillsPath: string) {
        this.app = app;
        this.skillsPath = skillsPath;
    }

    /**
     * Scan the skills folder and build an in-memory index of all skills.
     * Each skill must have a SKILL.md with YAML frontmatter containing `name` and `description`.
     */
    async loadIndex(): Promise<void> {
        if (this.loaded) return;
        this.index = [];

        try {
            const entries = fs.readdirSync(this.skillsPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                
                const skillFile = path.join(this.skillsPath, entry.name, 'SKILL.md');
                if (!fs.existsSync(skillFile)) continue;

                try {
                    const content = fs.readFileSync(skillFile, 'utf-8');
                    const parsed = this.parseFrontmatter(content);
                    
                    if (parsed.name && parsed.description) {
                        this.index.push({
                            name: parsed.name,
                            description: parsed.description,
                            folderPath: path.join(this.skillsPath, entry.name),
                            skillFilePath: skillFile
                        });
                    }
                } catch (e) {
                    // Skip unparseable skills
                }
            }
            
            this.loaded = true;
            console.log(`SkillService: Indexed ${this.index.length} skills from ${this.skillsPath}`);
        } catch (e) {
            console.error('SkillService: Failed to scan skills folder:', e);
        }
    }

    /**
     * Find skills relevant to a user query by keyword matching against skill names and descriptions.
     */
    async findRelevant(query: string, maxResults = 3): Promise<SkillEntry[]> {
        await this.loadIndex();
        if (this.index.length === 0) return [];

        const lowerQuery = query.toLowerCase();
        const words = lowerQuery.split(/\s+/).filter(w => w.length > 2);

        // Score each skill by word overlap with name + description
        const scored = this.index.map(skill => {
            const text = `${skill.name} ${skill.description}`.toLowerCase();
            let score = 0;
            for (const word of words) {
                if (text.includes(word)) score++;
                // Bonus for exact name match
                if (skill.name.toLowerCase().includes(word)) score += 2;
            }
            return { skill, score };
        });

        scored.sort((a, b) => b.score - a.score);
        
        // Only return skills with a meaningful match (score > 0)
        return scored
            .filter(s => s.score > 0)
            .slice(0, maxResults)
            .map(s => s.skill);
    }

    /**
     * Load the full content of a SKILL.md file.
     */
    getSkillContent(skill: SkillEntry): string {
        try {
            return fs.readFileSync(skill.skillFilePath, 'utf-8');
        } catch (e) {
            return '';
        }
    }

    /**
     * Build a context block for matched skills to inject into the system prompt.
     */
    async buildSkillContext(query: string): Promise<string> {
        const matched = await this.findRelevant(query, 2);
        if (matched.length === 0) return '';

        let context = '\n\n=== RELEVANT SKILLS ===\n';
        context += 'The following skills may be useful for answering this query:\n\n';
        
        for (const skill of matched) {
            const content = this.getSkillContent(skill);
            // Limit skill content to avoid overwhelming the prompt
            const truncated = content.substring(0, 3000);
            context += `--- Skill: ${skill.name} ---\n${truncated}\n\n`;
        }

        context += '=== END SKILLS ===\n';
        return context;
    }

    /**
     * List all available skills (for UI or tool use).
     */
    async listSkills(): Promise<string> {
        await this.loadIndex();
        if (this.index.length === 0) return 'No skills found.';
        return this.index.map((s, i) => `${i + 1}. **${s.name}**: ${s.description}`).join('\n');
    }

    /**
     * Simple YAML frontmatter parser (no dependencies).
     */
    private parseFrontmatter(content: string): Record<string, string> {
        const result: Record<string, string> = {};
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) return result;

        const lines = fmMatch[1].split('\n');
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            const key = line.substring(0, colonIdx).trim();
            const value = line.substring(colonIdx + 1).trim();
            result[key] = value;
        }
        return result;
    }
}
