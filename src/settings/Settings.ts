export interface CustomPrompt {
    id: string;
    name: string;
    template: string;
}

export interface MCPServerConfig {
    id: string;
    name: string;
    command: string; // e.g., "npx" or "/path/to/python"
    args: string[];  // e.g., ["-y", "@modelcontextprotocol/server-postgres", "postgresql://..."]
    env: Record<string, string>; // Custom environment variables
    cwd?: string; // Working directory for the server process
    enabled: boolean;
}

export interface CustomAction {
    id: string;
    name: string;
    promptTemplate: string;
}

export interface SkillConfig {
    name: string;        // matches discovered skill name
    folderPath: string;  // matches discovered skill folderPath
    enabled: boolean;
    mandatory: boolean;  // if true, always inject this skill's content before generating
}

export interface Project {
    id: string;
    name: string;
    description: string;
    includeFolders: string; // Comma separated paths
    excludeFolders: string; // Comma separated paths
    includeTags: string;    // Comma separated tags
    systemPrompt: string;   // Override system prompt
    defaultModel: string;   // Override model
}

export interface Persona {
    id: string;
    name: string;
    description?: string;
    prompt: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'error' | 'tool';
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
    composerDiff?: {
        path: string;
        oldText: string;
        newText: string;
        status: 'pending' | 'accepted' | 'rejected';
    };
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
    projectId?: string | null;
}

export type ProviderType = 'openai' | 'anthropic' | 'ollama' | 'groq' | 'gemini';

export interface AICopilotSettings {
    apiKey: string;
    provider: ProviderType;
    model: string;
    systemPrompt: string;
    baseUrl: string;
    personas: Persona[];
    defaultPersonaId: string;
    customActions: CustomAction[];
    customPrompts: CustomPrompt[];
    mcpServers: MCPServerConfig[];
    sessions: ChatSession[];
    activeSessionId: string;
    
    // Projects Mode
    projects: Project[];
    activeProjectId: string | null;

    // Vault QA & Embeddings
    isVaultQAMode: boolean;
    embeddingProvider: 'openai' | 'ollama';
    embeddingModel: string;
    autoIndexVault: boolean;
    indexExclusions: string;
    qaModeThreshold: number;

    // Skills
    skillsPath: string;
    skillConfigs: SkillConfig[];

    // Composer
    autoApplyEdits: boolean;

    // Tabs
    tabs: { id: string; title: string; sessionId: string | null; projectId: string | null; personaId: string; pinned: boolean }[];
    activeTabId: string;
}

// Provider-specific model lists (verified Mar 2026 - Text Generation Only)
export const PROVIDER_MODELS: Record<ProviderType, string[]> = {
    openai: [
        'gpt-5-pro',
        'gpt-5',
        'gpt-5.4',
        'gpt-5.4-pro',
        'gpt-5.2-pro',
        'gpt-5.2',
        'gpt-5.1',
        'gpt-5-mini',
        'gpt-5-nano',
        'o3',
        'o1',
        'o1-preview',
        'o1-mini',
        'o4-mini',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
    ],
    anthropic: [
        'claude-opus-4-6',
        'claude-sonnet-4-6',
        'claude-haiku-4-5-20251001',
    ],
    ollama: [
        'llama4',
        'qwen3',
        'gemma3',
        'deepseek-r1',
        'phi4-reasoning',
        'glm4',
        'mistral-small-3.2',
    ],
    groq: [
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'qwen/qwen3-32b',
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'moonshotai/kimi-k2-instruct-0905',
    ],
    gemini: [
        'gemini-3.1-pro-preview',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-3-pro-preview',
    ],
};

export const PROVIDER_DEFAULT_URLS: Record<ProviderType, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com/v1',
    ollama: 'http://localhost:11434/v1',
    groq: 'https://api.groq.com/openai/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    ollama: 'Ollama (Local)',
    groq: 'Groq',
    gemini: 'Google Gemini',
};

export const ALL_PROVIDERS: ProviderType[] = ['openai', 'anthropic', 'ollama', 'groq', 'gemini'];

export const DEFAULT_PERSONAS: Persona[] = [
    {
        id: 'default',
        name: 'Default Assistant',
        description: 'Standard helpful AI assistant',
        prompt: 'You are a helpful AI assistant embedded in Obsidian. You help users write, think, organize, and manage their knowledge vault. You are proactive, concise, and action-oriented. When the user asks you to do something, DO it — don\'t just explain how.\n\nYou have tools: use `read_note` to read files, `edit_note` (with exact old_text/new_text) to edit them, `create_note` to create, `web_search` for web info, `list_skills`/`use_skill` for specialized expertise. When a file is provided via @mention, its content is in context — go straight to `edit_note`. For mistakes, save them with `save_persona_memory`. For user facts/preferences, save them too.'
    },
    {
        id: 'code-expert',
        name: 'Code Expert',
        description: 'Specialized in programming and software architecture',
        prompt: 'You are an expert software engineer and architect embedded in Obsidian. Provide concise, high-quality code solutions using modern best practices (TypeScript preferred). Be direct about code issues.\n\nYou have tools: use `read_note` to read files, `edit_note` (with exact old_text/new_text) to edit them, `create_note` to create, `web_search` for web info, `list_skills`/`use_skill` for specialized expertise. When a file is provided via @mention, its content is in context — go straight to `edit_note`. For mistakes, save them with `save_persona_memory`. For user facts/preferences, save them too.'
    },
    {
        id: 'creative-writer',
        name: 'Creative Writer',
        description: 'Helps with brainstorming and drafting',
        prompt: 'You are a creative writer embedded in Obsidian. Help brainstorm ideas, draft content, refine prose, and develop narrative. Be imaginative and engaging. Match the user\'s writing style when editing their work.\n\nYou have tools: use `read_note` to read files, `edit_note` (with exact old_text/new_text) to edit them, `create_note` to create, `web_search` for web info, `list_skills`/`use_skill` for specialized expertise. When a file is provided via @mention, its content is in context — go straight to `edit_note`. For mistakes, save them with `save_persona_memory`. For user facts/preferences, save them too.'
    },
    {
        id: 'academic',
        name: 'Academic Researcher',
        description: 'Formal and citation-focused',
        prompt: 'You are an academic research assistant embedded in Obsidian. Provide formal, well-structured, evidence-based responses. Cite sources where possible. Use precise language and clear structure.\n\nYou have tools: use `read_note` to read files, `edit_note` (with exact old_text/new_text) to edit them, `create_note` to create, `web_search` for web info, `list_skills`/`use_skill` for specialized expertise. When a file is provided via @mention, its content is in context — go straight to `edit_note`. For mistakes, save them with `save_persona_memory`. For user facts/preferences, save them too.'
    }
];

export const DEFAULT_SETTINGS: AICopilotSettings = {
    apiKey: '',
    provider: 'openai',
    model: 'gpt-5-mini',
    systemPrompt: DEFAULT_PERSONAS[0].prompt,
    baseUrl: PROVIDER_DEFAULT_URLS.openai,
    personas: DEFAULT_PERSONAS,
    defaultPersonaId: 'default',
    customActions: [],
    customPrompts: [],
    mcpServers: [],
    sessions: [],
    activeSessionId: '',
    projects: [],
    activeProjectId: null,
    embeddingProvider: 'openai',
    embeddingModel: 'text-embedding-3-small',
    autoIndexVault: false,
    indexExclusions: 'node_modules, .git, .obsidian',
    qaModeThreshold: 0.75,
    isVaultQAMode: false,
    skillsPath: '/Users/boss/Documents/ai_skills_hub',
    skillConfigs: [],
    autoApplyEdits: true,
    tabs: [{ id: 'default-tab', title: 'New Chat', sessionId: null, projectId: null, personaId: 'default', pinned: false }],
    activeTabId: 'default-tab'
};
