import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AICopilotSettings, SkillConfig } from '../settings/Settings';

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
        this.index = [];
        this.loaded = false;

        try {
            const entries = readdirSync(this.skillsPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                
                const skillFile = join(this.skillsPath, entry.name, 'SKILL.md');
                if (!existsSync(skillFile)) continue;

                try {
                    const content = readFileSync(skillFile, 'utf-8');
                    const parsed = this.parseFrontmatter(content);
                    
                    if (parsed.name && parsed.description) {
                        this.index.push({
                            name: parsed.name,
                            description: parsed.description,
                            folderPath: join(this.skillsPath, entry.name),
                            skillFilePath: skillFile
                        });
                    }
                } catch (e) {
                    // Skip unparseable skills
                }
            }
            
            this.loaded = true;
            console.debug(`SkillService: Indexed ${this.index.length} skills from ${this.skillsPath}`);
        } catch (e) {
            console.error('SkillService: Failed to scan skills folder:', e);
        }
    }

    /**
     * Expose the loaded index for UI display (e.g., Settings).
     */
    getIndex(): SkillEntry[] {
        return this.index;
    }

    isSkillEnabled(folderPath: string, settings?: AICopilotSettings): boolean {
        const cfg = settings?.skillConfigs?.find(c => c.folderPath === folderPath);
        return cfg?.enabled ?? false;
    }

    getEnabledFolderPaths(settings?: AICopilotSettings): Set<string> {
        const enabled = new Set<string>();
        for (const skill of this.index) {
            if (this.isSkillEnabled(skill.folderPath, settings)) {
                enabled.add(skill.folderPath);
            }
        }
        return enabled;
    }

    /**
     * Sync skillConfigs with the on-disk index. Adds missing entries, removes stale ones,
     * and updates names. Returns true if settings were modified.
     */
    syncSkillConfigs(settings: AICopilotSettings, defaultEnabled = false): boolean {
        let changed = false;

        if (!settings.skillConfigs) {
            settings.skillConfigs = [];
            changed = true;
        }

        const discoveredPaths = new Set(this.index.map(s => s.folderPath));
        const configByPath = new Map(settings.skillConfigs.map(c => [c.folderPath, c]));

        for (const skill of this.index) {
            const existing = configByPath.get(skill.folderPath);
            if (!existing) {
                settings.skillConfigs.push({
                    name: skill.name,
                    folderPath: skill.folderPath,
                    enabled: defaultEnabled,
                    mandatory: false,
                });
                changed = true;
            } else if (existing.name !== skill.name) {
                existing.name = skill.name;
                changed = true;
            }
        }

        const before = settings.skillConfigs.length;
        settings.skillConfigs = settings.skillConfigs.filter(c => discoveredPaths.has(c.folderPath));
        if (settings.skillConfigs.length !== before) {
            changed = true;
        }

        return changed;
    }

    /**
     * Find a skill by exact name (case-insensitive).
     * Falls back to matching against the folder name.
     * Optionally restricts to skills in enabledOnly set.
     */
    async findByName(name: string, enabledOnly?: Set<string>): Promise<SkillEntry | null> {
        if (!this.loaded) await this.loadIndex();
        const entry = this.findByNameInIndex(name);
        if (!entry) return null;
        if (enabledOnly && !enabledOnly.has(entry.folderPath)) return null;
        return entry;
    }

    /**
     * Find a skill by name without enabled/disabled filtering (for error messages).
     */
    async findByNameAny(name: string): Promise<SkillEntry | null> {
        if (!this.loaded) await this.loadIndex();
        return this.findByNameInIndex(name);
    }

    private findByNameInIndex(name: string): SkillEntry | null {
        const lower = name.toLowerCase().trim();
        const exact = this.index.find(s => s.name.toLowerCase() === lower);
        if (exact) return exact;
        const byFolder = this.index.find(s => {
            const folderName = s.folderPath.split('/').pop()?.toLowerCase() || '';
            return folderName === lower || folderName === lower.replace(/\s+/g, '-');
        });
        return byFolder || null;
    }

    /**
     * Find skills relevant to a user query by keyword matching against skill names and descriptions.
     * Optionally filters by an enabledSet — only skills in this set will be considered.
     * If enabledSet is provided and empty, returns [] immediately.
     */
    async findRelevant(query: string, maxResults = 3, enabledSet?: Set<string>): Promise<SkillEntry[]> {
        if (!this.loaded) await this.loadIndex();
        if (this.index.length === 0) return [];
        if (enabledSet !== undefined && enabledSet.size === 0) return [];

        const lowerQuery = query.toLowerCase();
        const words = lowerQuery.split(/\s+/).filter(w => w.length > 2);

        const candidates = enabledSet !== undefined
            ? this.index.filter(s => enabledSet.has(s.folderPath))
            : this.index;

        const scored = candidates.map(skill => {
            const text = `${skill.name} ${skill.description}`.toLowerCase();
            let score = 0;
            for (const word of words) {
                if (text.includes(word)) score++;
                if (skill.name.toLowerCase().includes(word)) score += 2;
            }
            return { skill, score };
        });

        scored.sort((a, b) => b.score - a.score);
        
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
            return readFileSync(skill.skillFilePath, 'utf-8');
        } catch (e) {
            return '';
        }
    }

    /**
     * Build a context block for matched skills to inject into the system prompt.
     * Respects enabled/disabled and mandatory settings from skillConfigs.
     *
     * - Mandatory + Enabled skills: always injected with a priority header.
     * - Enabled (non-mandatory) skills: injected only if keyword-relevant.
     * - Disabled skills: skipped entirely.
     */
    async buildSkillContext(query: string, settings?: AICopilotSettings): Promise<string> {
        if (!this.loaded) await this.loadIndex();

        const configs = settings?.skillConfigs || [];
        const configByPath = new Map<string, SkillConfig>();
        for (const cfg of configs) {
            configByPath.set(cfg.folderPath, cfg);
        }

        const enabledSet = this.getEnabledFolderPaths(settings);
        const mandatorySkills: SkillEntry[] = [];

        for (const skill of this.index) {
            if (!enabledSet.has(skill.folderPath)) continue;
            const cfg = configByPath.get(skill.folderPath);
            if (cfg?.enabled && cfg.mandatory) {
                mandatorySkills.push(skill);
            }
        }

        let context = '';

        if (mandatorySkills.length > 0) {
            context += '\n\n=== MANDATORY SKILLS (Always Consult First) ===\n';
            context += 'You MUST consult the following skills first before generating your response. If a mandatory skill is not suitable for this task, you may ignore it and proceed normally.\n\n';
            for (const skill of mandatorySkills) {
                const content = this.getSkillContent(skill);
                const truncated = content.substring(0, 3000);
                context += `--- Skill: ${skill.name} ---\n${truncated}\n\n`;
            }
            context += '=== END MANDATORY SKILLS ===\n';
        }

        const mandatoryPaths = new Set(mandatorySkills.map(s => s.folderPath));
        const relevantPool = new Set([...enabledSet].filter(p => !mandatoryPaths.has(p)));

        const matched = await this.findRelevant(query, 2, relevantPool);
        const additionalMatches = matched.filter(s => !mandatoryPaths.has(s.folderPath));

        if (additionalMatches.length > 0) {
            context += '\n\n=== RELEVANT SKILLS ===\n';
            context += 'The following skills may be useful for answering this query:\n\n';
            for (const skill of additionalMatches) {
                const content = this.getSkillContent(skill);
                const truncated = content.substring(0, 3000);
                context += `--- Skill: ${skill.name} ---\n${truncated}\n\n`;
            }
            context += '=== END SKILLS ===\n';
        }

        return context;
    }

    /**
     * List enabled skills (for UI or tool use).
     */
    async listSkills(settings?: AICopilotSettings): Promise<string> {
        if (!this.loaded) await this.loadIndex();
        const enabledSet = this.getEnabledFolderPaths(settings);
        const enabled = this.index.filter(s => enabledSet.has(s.folderPath));
        if (enabled.length === 0) {
            return settings
                ? 'No enabled skills. Enable skills in AI Copilot settings to use them.'
                : 'No skills found.';
        }
        return enabled.map((s, i) => `${i + 1}. **${s.name}**: ${s.description}`).join('\n');
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
