export interface Persona {
    id: string;
    name: string;
    description?: string;
    prompt: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'error';
    content: string;
}

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
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
    sessions: ChatSession[];
    activeSessionId: string;
}

// Provider-specific model lists (verified Feb 2026 - Text Generation Only)
export const PROVIDER_MODELS: Record<ProviderType, string[]> = {
    openai: [
        'gpt-5.3-spark',
        'gpt-5.2-pro',
        'gpt-5.2',
        'gpt-5-mini',
        'gpt-5-nano',
        'o4-mini-deep-research',
        'o3-deep-research',
        'o4-mini',
        'o3',
        'o3-mini',
        'gpt-oss-120b',
        'gpt-oss-20b',
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4o',
        'gpt-4o-mini',
    ],
    anthropic: [
        'claude-4-6-opus-20260210',
        'claude-4-6-sonnet-20260218',
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-latest',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-latest',
    ],
    ollama: [
        'llama4',
        'qwen3',
        'gemma3',
        'deepseek-r1',
        'phi4-reasoning',
        'llama3.3',
        'mistral-small-3.2',
        'deepseek-v3',
    ],
    groq: [
        'meta-llama/llama-4-maverick-17b-128e-instruct',
        'meta-llama/llama-4-scout-17b-16e-instruct',
        'qwen/qwen3-32b',
        'qwen/qwen2.5-coder-32b',
        'llama-3.3-70b-versatile',
        'deepseek-r1-distill-qwen-32b',
    ],
    gemini: [
        'gemini-3-pro',
        'gemini-3-flash',
        'gemini-3-flash-lite',
        'gemini-2.5-pro-latest',
        'gemini-2.5-flash-latest',
        'gemini-2.5-flash-lite',
        'gemma-3-27b',
        'gemma-3-4b',
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
        prompt: 'You are a helpful AI assistant in Obsidian. Help the user write and think better.'
    },
    {
        id: 'code-expert',
        name: 'Code Expert',
        description: 'Specialized in programming and software architecture',
        prompt: 'You are an expert software engineer and architect. Provide concise, high-quality code solutions and explanations. Prefer modern best practices and TypeScript.'
    },
    {
        id: 'creative-writer',
        name: 'Creative Writer',
        description: 'Helps with brainstorming and drafting',
        prompt: 'You are a creative writer. Help the user brainstorm ideas, draft content, and improve their writing style. Be imaginative and engaging.'
    },
    {
        id: 'academic',
        name: 'Academic Researcher',
        description: 'Formal and citation-focused',
        prompt: 'You are an academic research assistant. Provide formal, well-structured responses. Cite sources where possible and maintain a neutral, objective tone.'
    }
];

export const DEFAULT_SETTINGS: AICopilotSettings = {
    apiKey: '',
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: DEFAULT_PERSONAS[0].prompt,
    baseUrl: PROVIDER_DEFAULT_URLS.openai,
    personas: DEFAULT_PERSONAS,
    defaultPersonaId: 'default',
    sessions: [],
    activeSessionId: ''
};
