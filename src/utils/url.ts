import type { ProviderType } from '../settings/Settings';
import { PROVIDER_DEFAULT_URLS } from '../settings/Settings';

export function normalizeBaseUrl(url: string, provider?: ProviderType): string {
    const trimmed = url.trim();
    if (!trimmed) {
        throw new Error('URL is empty');
    }
    if (!/^https?:\/\//i.test(trimmed)) {
        throw new Error('URL must start with http:// or https://');
    }

    let normalized = trimmed.replace(/\/+$/, '');

    if (provider && PROVIDER_DEFAULT_URLS[provider]) {
        try {
            const parsed = new URL(normalized);
            const defaultUrl = new URL(PROVIDER_DEFAULT_URLS[provider]);
            if (
                parsed.hostname.toLowerCase() === defaultUrl.hostname.toLowerCase() &&
                (parsed.pathname === '/' || parsed.pathname === '')
            ) {
                normalized = PROVIDER_DEFAULT_URLS[provider].replace(/\/+$/, '');
            }
        } catch {
            // If URL parsing fails here, fall through to return the raw normalized string
        }
    }

    return normalized;
}

export function getUrlValidationError(url: string): string | null {
    if (!url.trim()) {
        return 'URL cannot be empty';
    }
    if (!/^https?:\/\//i.test(url)) {
        return 'URL must start with http:// or https://';
    }
    try {
        new URL(url);
    } catch {
        return 'Invalid URL format';
    }
    return null;
}

export function getProviderMismatchWarning(url: string, selected: ProviderType): string | null {
    try {
        const host = new URL(url).hostname.toLowerCase();
        if (selected !== 'anthropic' && host.includes('anthropic')) {
            return 'This looks like an Anthropic URL. Check your AI provider selection.';
        }
        if (selected !== 'openai' && host.includes('openai') && !host.includes('groq')) {
            return 'This looks like an OpenAI URL. Check your AI provider selection.';
        }
        if (selected !== 'groq' && host.includes('groq')) {
            return 'This looks like a Groq URL. Check your AI provider selection.';
        }
        if (
            selected !== 'gemini' &&
            host.includes('google') &&
            host.includes('generative')
        ) {
            return 'This looks like a Gemini URL. Check your AI provider selection.';
        }
    } catch {
        // Invalid URL — validation error is handled separately
    }
    return null;
}
