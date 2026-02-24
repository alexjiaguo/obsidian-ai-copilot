import { requestUrl } from 'obsidian';
import { YouTubeTranscriber } from './YouTubeTranscriber';
import type { YouTubeResult } from './YouTubeTranscriber';
import { PodcastTranscriber } from './PodcastTranscriber';
import type { PodcastResult } from './PodcastTranscriber';

export type ContentType = 'youtube' | 'webpage' | 'apple_podcast' | 'podcast_rss' | 'unknown';

export interface ExtractedContent {
    url: string;
    type: ContentType;
    title: string | null;
    description: string | null;
    siteName: string | null;
    content: string;
    isTranscript: boolean;
    metadata: Record<string, string>;
    extractionNotes: string[];
}

export class ContentExtractor {
    private youtubeTranscriber: YouTubeTranscriber;
    private podcastTranscriber: PodcastTranscriber;

    constructor() {
        this.youtubeTranscriber = new YouTubeTranscriber();
        this.podcastTranscriber = new PodcastTranscriber();
    }

    /**
     * Detect URL type and extract content + metadata.
     */
    async extract(url: string): Promise<ExtractedContent> {
        const type = this.detectType(url);

        switch (type) {
            case 'youtube':
                return this.extractYouTube(url);
            case 'apple_podcast':
                return this.extractPodcast(url);
            case 'webpage':
            default:
                return this.extractWebpage(url);
        }
    }

    /**
     * Detect the content type from a URL.
     */
    detectType(url: string): ContentType {
        const lower = url.toLowerCase();

        // YouTube
        if (lower.includes('youtube.com/watch') ||
            lower.includes('youtu.be/') ||
            lower.includes('youtube.com/shorts/') ||
            lower.includes('youtube.com/embed/')) {
            return 'youtube';
        }

        // Apple Podcasts
        if (lower.includes('podcasts.apple.com')) {
            return 'apple_podcast';
        }

        // Generic RSS feed (heuristic)
        if (lower.endsWith('/feed') || lower.endsWith('/rss') ||
            lower.includes('/feed.xml') || lower.includes('/rss.xml') ||
            lower.includes('feeds.') || lower.includes('/podcast/feed')) {
            return 'podcast_rss';
        }

        return 'webpage';
    }

    /**
     * Extract content from YouTube videos.
     */
    private async extractYouTube(url: string): Promise<ExtractedContent> {
        const result: YouTubeResult = await this.youtubeTranscriber.getTranscriptWithMetadata(url);

        const metadata: Record<string, string> = {};
        if (result.metadata.channel) metadata.channel = result.metadata.channel;
        if (result.metadata.durationSeconds) metadata.duration = this.formatDuration(result.metadata.durationSeconds);
        if (result.metadata.language) metadata.language = result.metadata.language;
        if (result.metadata.captionSource) metadata.captionSource = result.metadata.captionSource;

        return {
            url,
            type: 'youtube',
            title: result.metadata.title,
            description: result.metadata.description,
            siteName: 'YouTube',
            content: result.transcript,
            isTranscript: !result.transcript.startsWith('No captions') && !result.transcript.startsWith('Could not') && !result.transcript.startsWith('Error') && !result.transcript.startsWith('Invalid'),
            metadata,
            extractionNotes: result.notes,
        };
    }

    /**
     * Extract content from podcast URLs.
     */
    private async extractPodcast(url: string): Promise<ExtractedContent> {
        const result: PodcastResult = await this.podcastTranscriber.extract(url);

        const metadata: Record<string, string> = {};
        if (result.metadata.showName) metadata.show = result.metadata.showName;
        if (result.metadata.durationSeconds) metadata.duration = this.formatDuration(result.metadata.durationSeconds);
        if (result.metadata.feedUrl) metadata.feedUrl = result.metadata.feedUrl;

        // Build content: transcript if available, otherwise description
        let content: string;
        if (result.hasTranscript && result.transcript) {
            content = result.transcript;
        } else {
            const parts: string[] = [];
            if (result.metadata.episodeTitle) parts.push(`Episode: ${result.metadata.episodeTitle}`);
            if (result.metadata.showName) parts.push(`Show: ${result.metadata.showName}`);
            if (result.metadata.description) parts.push(`\nDescription:\n${result.metadata.description}`);
            if (!result.hasTranscript) parts.push("\n[No transcript available for this episode. Summary is based on metadata only.]");
            content = parts.join('\n') || "No content could be extracted from this podcast URL.";
        }

        return {
            url,
            type: 'apple_podcast',
            title: result.metadata.episodeTitle,
            description: result.metadata.description,
            siteName: result.metadata.showName,
            content,
            isTranscript: result.hasTranscript,
            metadata,
            extractionNotes: result.notes,
        };
    }

    /**
     * Extract readable content from a generic webpage.
     */
    private async extractWebpage(url: string): Promise<ExtractedContent> {
        const notes: string[] = [];

        try {
            const response = await requestUrl({
                url,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            });
            const html = response.text;
            notes.push(`Page fetched: ${html.length} chars`);

            // Extract metadata from OpenGraph / meta tags
            const title = this.extractMetaContent(html, 'og:title') ||
                         this.extractHtmlTitle(html);
            const description = this.extractMetaContent(html, 'og:description') ||
                              this.extractMetaContent(html, 'description', 'name');
            const siteName = this.extractMetaContent(html, 'og:site_name');

            // Extract main content
            const content = this.extractArticleContent(html);
            notes.push(`Extracted content: ${content.length} chars`);

            return {
                url,
                type: 'webpage',
                title: title || null,
                description: description?.substring(0, 500) || null,
                siteName: siteName || null,
                content: content || description || "No readable content could be extracted from this page.",
                isTranscript: false,
                metadata: {},
                extractionNotes: notes,
            };
        } catch (e: any) {
            notes.push(`Page fetch failed: ${e.message}`);
            return {
                url,
                type: 'webpage',
                title: null,
                description: null,
                siteName: null,
                content: `Failed to fetch page content: ${e.message}`,
                isTranscript: false,
                metadata: {},
                extractionNotes: notes,
            };
        }
    }

    /**
     * Extract article body text from HTML.
     * Targets <article>, <main>, or <body> and strips navigation/chrome.
     */
    private extractArticleContent(html: string, limit: number = 80000): string {
        // Remove scripts, styles, nav, header, footer, aside
        let cleaned = html
            .replace(/<script\b[\s\S]*?<\/script>/gi, '')
            .replace(/<style\b[\s\S]*?<\/style>/gi, '')
            .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
            .replace(/<header\b[\s\S]*?<\/header>/gi, '')
            .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
            .replace(/<aside\b[\s\S]*?<\/aside>/gi, '')
            .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '');

        // Try to find <article> or <main> first
        let body = '';
        const articleMatch = cleaned.match(/<article\b[\s\S]*?<\/article>/i);
        if (articleMatch) {
            body = articleMatch[0];
        } else {
            const mainMatch = cleaned.match(/<main\b[\s\S]*?<\/main>/i);
            if (mainMatch) {
                body = mainMatch[0];
            } else {
                // Fallback to body
                const bodyMatch = cleaned.match(/<body\b[\s\S]*?<\/body>/i);
                body = bodyMatch ? bodyMatch[0] : cleaned;
            }
        }

        // Convert block elements to newlines, strip all tags
        body = body
            .replace(/<\/?(h[1-6]|p|div|br|li|tr|blockquote)\b[^>]*>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, "'")
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]+/g, ' ')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');

        return body.substring(0, limit);
    }

    // ─── HTML helpers ─────────────────────────────────────

    private extractMetaContent(html: string, property: string, attr: string = 'property'): string | null {
        const re = new RegExp(`<meta[^>]*${attr}=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
        const match = html.match(re);
        if (match) return match[1];
        const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${property}["']`, 'i');
        return html.match(re2)?.[1] || null;
    }

    private extractHtmlTitle(html: string): string | null {
        const match = html.match(/<title>([^<]+)<\/title>/i);
        return match?.[1]?.trim() || null;
    }

    private formatDuration(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    }
}
