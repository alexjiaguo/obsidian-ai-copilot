import { requestUrl } from 'obsidian';

export interface PodcastMetadata {
    showName: string | null;
    episodeTitle: string | null;
    durationSeconds: number | null;
    description: string | null;
    feedUrl: string | null;
    audioUrl: string | null;
}

export interface PodcastResult {
    transcript: string | null;
    metadata: PodcastMetadata;
    hasTranscript: boolean;
    notes: string[];
}

export class PodcastTranscriber {

    /**
     * Extract transcript and metadata from a podcast URL.
     * Supports Apple Podcasts URLs and direct RSS feed URLs.
     */
    async extract(url: string): Promise<PodcastResult> {
        const notes: string[] = [];
        const metadata: PodcastMetadata = {
            showName: null, episodeTitle: null, durationSeconds: null,
            description: null, feedUrl: null, audioUrl: null,
        };

        try {
            if (this.isApplePodcastUrl(url)) {
                return await this.extractFromApplePodcast(url, metadata, notes);
            }

            // Try as RSS feed
            const feedResult = await this.tryRssFeed(url, null, metadata, notes);
            if (feedResult) {
                return feedResult;
            }

            // Fallback: scrape page for metadata
            return await this.scrapePageMetadata(url, metadata, notes);

        } catch (e: any) {
            notes.push(`Error: ${e.message}`);
            return { transcript: null, metadata, hasTranscript: false, notes };
        }
    }

    private isApplePodcastUrl(url: string): boolean {
        return /podcasts\.apple\.com/i.test(url);
    }

    /**
     * Extract from Apple Podcasts URLs.
     * Flow: iTunes Lookup API → RSS feed → <podcast:transcript>
     */
    private async extractFromApplePodcast(
        url: string, metadata: PodcastMetadata, notes: string[]
    ): Promise<PodcastResult> {
        notes.push("Detected Apple Podcasts URL");

        // Extract show ID and episode ID from URL
        const ids = this.extractApplePodcastIds(url);
        if (!ids) {
            notes.push("Could not extract podcast IDs from URL");
            return await this.scrapeApplePodcastPage(url, metadata, notes);
        }

        notes.push(`Show ID: ${ids.showId}, Episode ID: ${ids.episodeId || 'none'}`);

        // Step 1: iTunes Lookup API → get feed URL
        try {
            const lookupRes = await requestUrl({
                url: `https://itunes.apple.com/lookup?id=${ids.showId}&entity=podcast`,
            });
            const lookupData = JSON.parse(lookupRes.text);
            const results = lookupData.results || [];
            const show = results.find((r: any) => r.wrapperType === 'collection');

            if (show) {
                metadata.showName = show.collectionName || null;
                metadata.feedUrl = show.feedUrl || null;
                notes.push(`iTunes: ${metadata.showName}, feed: ${metadata.feedUrl ? 'found' : 'not found'}`);
            }
        } catch (e: any) {
            notes.push(`iTunes lookup failed: ${e.message}`);
        }

        // Step 2: If we have a feed URL, try to get transcript from RSS
        if (metadata.feedUrl) {
            const rssResult = await this.tryRssFeed(metadata.feedUrl, ids.episodeId, metadata, notes);
            if (rssResult) {
                return rssResult;
            }
        }

        // Step 3: Fallback to scraping Apple Podcast page
        return await this.scrapeApplePodcastPage(url, metadata, notes);
    }

    /**
     * Try to extract transcript from an RSS feed.
     * Looks for <podcast:transcript> tag in items.
     */
    private async tryRssFeed(
        feedUrl: string, episodeId: string | null,
        metadata: PodcastMetadata, notes: string[]
    ): Promise<PodcastResult | null> {
        try {
            const feedRes = await requestUrl({ url: feedUrl });
            const xml = feedRes.text;

            if (!this.looksLikeRss(xml)) {
                notes.push("URL does not appear to be RSS/Atom feed");
                return null;
            }
            notes.push(`Fetched RSS feed: ${xml.length} chars`);

            // Extract items
            const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
            notes.push(`Found ${items.length} RSS items`);

            if (items.length === 0) return null;

            // Pick the right item (by episodeId match or first)
            let targetItem: string | null = null;

            if (episodeId) {
                // Try to find the specific episode
                for (const item of items) {
                    if (item.includes(episodeId)) {
                        targetItem = item;
                        notes.push(`Matched episode by ID: ${episodeId}`);
                        break;
                    }
                }
            }

            // Fallback: try to match by title from metadata
            if (!targetItem && metadata.episodeTitle) {
                const normalized = this.normalizeTitle(metadata.episodeTitle);
                for (const item of items) {
                    const title = this.extractXmlTag(item, 'title');
                    if (title && this.normalizeTitle(title) === normalized) {
                        targetItem = item;
                        notes.push(`Matched episode by title: ${title}`);
                        break;
                    }
                }
            }

            // Use first item if no match
            if (!targetItem) {
                targetItem = items[0];
                notes.push("Using first RSS item (no specific episode match)");
            }

            // Extract item metadata
            const itemTitle = this.extractXmlTag(targetItem, 'title');
            if (itemTitle) metadata.episodeTitle = itemTitle;

            const duration = this.extractDurationSeconds(targetItem);
            if (duration) metadata.durationSeconds = duration;

            const description = this.extractXmlTag(targetItem, 'description') ||
                                this.extractXmlTag(targetItem, 'itunes:summary');
            if (description) metadata.description = this.stripHtml(description).substring(0, 500);

            const enclosureUrl = this.extractEnclosureUrl(targetItem);
            if (enclosureUrl) metadata.audioUrl = this.decodeXmlEntities(enclosureUrl);

            // Check for <podcast:transcript> tag
            const transcriptUrl = this.extractPodcastTranscriptUrl(targetItem);
            if (transcriptUrl) {
                notes.push(`Found <podcast:transcript>: ${transcriptUrl}`);
                const transcript = await this.fetchTranscript(transcriptUrl, notes);
                if (transcript) {
                    return { transcript, metadata, hasTranscript: true, notes };
                }
            } else {
                notes.push("No <podcast:transcript> tag found in RSS item");
            }

            // No transcript available, but we got metadata
            return {
                transcript: null, metadata, hasTranscript: false,
                notes: [...notes, "Metadata extracted from RSS but no transcript tag available"],
            };

        } catch (e: any) {
            notes.push(`RSS feed fetch failed: ${e.message}`);
            return null;
        }
    }

    /**
     * Fetch transcript content from a URL (supports VTT, JSON, plain text).
     */
    private async fetchTranscript(url: string, notes: string[]): Promise<string | null> {
        try {
            const res = await requestUrl({
                url: this.decodeXmlEntities(url),
                headers: { "Accept": "text/vtt,text/plain,application/json;q=0.9,*/*;q=0.8" },
            });
            const body = res.text;
            const contentType = res.headers?.['content-type']?.toLowerCase() || '';

            // VTT format
            if (contentType.includes('text/vtt') || url.toLowerCase().endsWith('.vtt')) {
                const text = this.vttToPlainText(body);
                if (text.length > 0) {
                    notes.push(`Parsed VTT transcript: ${text.length} chars`);
                    return text;
                }
            }

            // JSON format (podcast namespace)
            if (contentType.includes('application/json') || url.toLowerCase().endsWith('.json')) {
                try {
                    const data = JSON.parse(body);
                    const text = this.jsonTranscriptToPlainText(data);
                    if (text.length > 0) {
                        notes.push(`Parsed JSON transcript: ${text.length} chars`);
                        return text;
                    }
                } catch { /* not valid JSON */ }
            }

            // SRT format
            if (contentType.includes('text/srt') || url.toLowerCase().endsWith('.srt')) {
                const text = this.srtToPlainText(body);
                if (text.length > 0) {
                    notes.push(`Parsed SRT transcript: ${text.length} chars`);
                    return text;
                }
            }

            // Plain text fallback
            const plain = body.trim();
            if (plain.length > 0) {
                notes.push(`Got plain text transcript: ${plain.length} chars`);
                return plain;
            }

            notes.push("Transcript URL returned empty content");
            return null;
        } catch (e: any) {
            notes.push(`Failed to fetch transcript: ${e.message}`);
            return null;
        }
    }

    /**
     * Scrape the Apple Podcasts page for embedded metadata.
     */
    private async scrapeApplePodcastPage(
        url: string, metadata: PodcastMetadata, notes: string[]
    ): Promise<PodcastResult> {
        try {
            const res = await requestUrl({
                url,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            });
            const html = res.text;
            notes.push(`Fetched Apple Podcasts page: ${html.length} chars`);

            // Extract OpenGraph metadata
            const ogTitle = this.extractMetaContent(html, 'og:title');
            const ogDesc = this.extractMetaContent(html, 'og:description');

            if (ogTitle) metadata.episodeTitle = ogTitle;
            if (ogDesc) metadata.description = ogDesc.substring(0, 500);

            // Try to find embedded feedUrl in JSON
            const feedUrl = this.extractEmbeddedJsonUrl(html, 'feedUrl');
            if (feedUrl && !metadata.feedUrl) {
                metadata.feedUrl = feedUrl;
                notes.push(`Found feedUrl in page: ${feedUrl}`);

                // Try RSS from embedded feedUrl
                const rssResult = await this.tryRssFeed(feedUrl, null, metadata, notes);
                if (rssResult) return rssResult;
            }

            return { transcript: null, metadata, hasTranscript: false, notes };
        } catch (e: any) {
            notes.push(`Apple page scrape failed: ${e.message}`);
            return { transcript: null, metadata, hasTranscript: false, notes };
        }
    }

    /**
     * Scrape a generic page for podcast metadata via OpenGraph tags.
     */
    private async scrapePageMetadata(
        url: string, metadata: PodcastMetadata, notes: string[]
    ): Promise<PodcastResult> {
        try {
            const res = await requestUrl({ url, headers: { "User-Agent": "Mozilla/5.0" } });
            const html = res.text;

            metadata.episodeTitle = this.extractMetaContent(html, 'og:title') ||
                                   this.extractHtmlTitle(html);
            metadata.description = (this.extractMetaContent(html, 'og:description') || '').substring(0, 500);
            metadata.showName = this.extractMetaContent(html, 'og:site_name');

            // Check for og:audio
            const audioUrl = this.extractMetaContent(html, 'og:audio');
            if (audioUrl) metadata.audioUrl = audioUrl;

            notes.push("Extracted metadata from page HTML");
            return { transcript: null, metadata, hasTranscript: false, notes };
        } catch (e: any) {
            notes.push(`Page scrape failed: ${e.message}`);
            return { transcript: null, metadata, hasTranscript: false, notes };
        }
    }

    // ─── Helpers ──────────────────────────────────────────

    private extractApplePodcastIds(url: string): { showId: string; episodeId: string | null } | null {
        // Format: podcasts.apple.com/.../podcast/.../id{showId}?i={episodeId}
        const showMatch = url.match(/\/id(\d+)/);
        if (!showMatch) return null;
        const episodeMatch = url.match(/[?&]i=(\d+)/);
        return {
            showId: showMatch[1],
            episodeId: episodeMatch ? episodeMatch[1] : null,
        };
    }

    private looksLikeRss(text: string): boolean {
        const head = text.slice(0, 2048).trimStart().toLowerCase();
        return head.includes('<rss') || head.includes('<feed') ||
               (head.startsWith('<?xml') && (head.includes('<rss') || head.includes('<feed')));
    }

    private extractXmlTag(xml: string, tag: string): string | null {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
        const match = xml.match(re);
        if (!match?.[1]) return null;
        return match[1]
            .replace(/<!\[CDATA\[/gi, '')
            .replace(/\]\]>/g, '')
            .trim() || null;
    }

    private extractDurationSeconds(itemXml: string): number | null {
        const match = itemXml.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
        if (!match?.[1]) return null;
        const raw = match[1].replace(/<!\[CDATA\[/gi, '').replace(/\]\]>/g, '').trim();
        if (!raw) return null;

        if (/^\d+$/.test(raw)) {
            const s = parseInt(raw);
            return s > 0 ? s : null;
        }

        const parts = raw.split(':').map(p => p.trim()).filter(Boolean).map(Number);
        if (parts.some(n => isNaN(n) || n < 0)) return null;
        if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
        if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
        return null;
    }

    private extractEnclosureUrl(itemXml: string): string | null {
        const match = itemXml.match(/<enclosure\b[^>]*\burl\s*=\s*(['"])([^'"]+)\1/i);
        return match?.[2] || null;
    }

    private extractPodcastTranscriptUrl(itemXml: string): string | null {
        // Prefer JSON, then VTT, then SRT, then any
        const matches = [...itemXml.matchAll(/<podcast:transcript\b[^>]*\burl\s*=\s*(['"])([^'"]+)\1[^>]*>/gi)];
        if (matches.length === 0) return null;

        const candidates = matches.map(m => {
            const tag = m[0];
            const url = m[2]?.trim();
            const type = tag.match(/\btype\s*=\s*(['"])([^'"]+)\1/i)?.[2]?.trim()?.toLowerCase() || null;
            return { url, type };
        }).filter(c => c.url);

        const json = candidates.find(c => c.type?.includes('json') || c.url?.endsWith('.json'));
        if (json) return json.url;
        const vtt = candidates.find(c => c.type?.includes('vtt') || c.url?.endsWith('.vtt'));
        if (vtt) return vtt.url;
        return candidates[0]?.url || null;
    }

    private extractMetaContent(html: string, property: string): string | null {
        const re = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
        const match = html.match(re);
        if (match) return match[1];
        // Try reversed order
        const re2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i');
        return html.match(re2)?.[1] || null;
    }

    private extractHtmlTitle(html: string): string | null {
        const match = html.match(/<title>([^<]+)<\/title>/i);
        return match?.[1]?.trim() || null;
    }

    private extractEmbeddedJsonUrl(html: string, key: string): string | null {
        const re = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i');
        return html.match(re)?.[1] || null;
    }

    private decodeXmlEntities(str: string): string {
        return str
            .replace(/&amp;/gi, '&')
            .replace(/&#38;/g, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, "'");
    }

    private normalizeTitle(value: string): string {
        return value.toLowerCase().normalize('NFKD')
            .replace(/[^a-z0-9\u4e00-\u9fff\u3400-\u4dbf]+/g, ' ')
            .trim();
    }

    private stripHtml(html: string): string {
        return html.replace(/<!\[CDATA\[/gi, '').replace(/\]\]>/g, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private vttToPlainText(vtt: string): string {
        const lines = vtt.split('\n');
        const textLines: string[] = [];
        let prevLine = '';

        for (const line of lines) {
            const trimmed = line.trim();
            // Skip header, timestamps, notes
            if (trimmed === 'WEBVTT' || trimmed === '') continue;
            if (/^\d{2}:\d{2}/.test(trimmed)) continue;
            if (/^NOTE\b/.test(trimmed)) continue;
            if (/^STYLE\b/.test(trimmed)) continue;
            if (/^\d+$/.test(trimmed)) continue; // numeric cue IDs

            // Remove HTML tags from text
            const clean = trimmed.replace(/<[^>]+>/g, '').trim();
            if (clean.length === 0) continue;

            // De-duplicate consecutive identical lines
            if (clean !== prevLine) {
                textLines.push(clean);
                prevLine = clean;
            }
        }

        return textLines.join(' ');
    }

    private srtToPlainText(srt: string): string {
        const lines = srt.split('\n');
        const textLines: string[] = [];
        let prevLine = '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === '') continue;
            if (/^\d+$/.test(trimmed)) continue;
            if (/\d{2}:\d{2}:\d{2}/.test(trimmed) && trimmed.includes('-->')) continue;

            const clean = trimmed.replace(/<[^>]+>/g, '').trim();
            if (clean.length > 0 && clean !== prevLine) {
                textLines.push(clean);
                prevLine = clean;
            }
        }

        return textLines.join(' ');
    }

    private jsonTranscriptToPlainText(data: any): string {
        // Adobe Podcast / Podcasting 2.0 JSON transcript format
        if (Array.isArray(data)) {
            return data.map((seg: any) => seg.body || seg.text || seg.content || '').join(' ').trim();
        }
        if (data.segments) {
            return data.segments.map((s: any) => s.body || s.text || '').join(' ').trim();
        }
        return '';
    }
}
