import { requestUrl } from 'obsidian';

export interface YouTubeMetadata {
    title: string | null;
    channel: string | null;
    durationSeconds: number | null;
    description: string | null;
    language: string | null;
    captionSource: 'manual' | 'auto-generated' | null;
}

export interface YouTubeResult {
    transcript: string;
    metadata: YouTubeMetadata;
    notes: string[];
}

interface CaptionTrack {
    baseUrl: string;
    languageCode: string;
    kind?: string;
    name?: { simpleText?: string };
}

export class YouTubeTranscriber {

    /**
     * Original method — kept for backward compatibility.
     */
    async getTranscript(url: string, limit: number = 80000): Promise<string> {
        const result = await this.getTranscriptWithMetadata(url, limit);
        return result.transcript;
    }

    /**
     * Enhanced method — returns transcript + metadata + diagnostic notes.
     * Tries multiple extraction paths for reliability.
     */
    async getTranscriptWithMetadata(url: string, limit: number = 80000): Promise<YouTubeResult> {
        const notes: string[] = [];
        const metadata: YouTubeMetadata = {
            title: null, channel: null, durationSeconds: null,
            description: null, language: null, captionSource: null,
        };

        try {
            const videoId = this.extractId(url);
            if (!videoId) {
                return { transcript: "Invalid YouTube URL provided.", metadata, notes: ["Invalid URL"] };
            }

            // Step 1: Try fetching metadata via oEmbed (always works, no bot detection)
            await this.fetchOEmbedMetadata(videoId, metadata, notes);

            // Step 2: Fetch the YouTube watch page
            let html: string;
            try {
                const response = await requestUrl({
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9",
                    }
                });
                html = response.text;
                notes.push(`Page fetched: ${html.length} chars`);
            } catch (e: any) {
                notes.push(`Page fetch failed: ${e.message}`);
                return {
                    transcript: metadata.title
                        ? `Could not fetch YouTube page for "${metadata.title}". The video may be restricted or unavailable.`
                        : "Could not fetch YouTube page. The video may be restricted or unavailable.",
                    metadata, notes,
                };
            }

            // Step 3: Extract metadata from page HTML (fills in what oEmbed didn't)
            this.extractPageMetadata(html, metadata);

            // Step 4: Try to extract captions — multiple fallback methods
            const transcript = await this.extractCaptions(html, videoId, metadata, notes, limit);

            if (transcript) {
                return { transcript, metadata, notes };
            }

            // No captions available
            notes.push("No caption tracks found via any method");
            const titleInfo = metadata.title ? ` "${metadata.title}"` : "";
            const channelInfo = metadata.channel ? ` by ${metadata.channel}` : "";
            return {
                transcript: `No captions/transcript available for this video${titleInfo}${channelInfo}. The creator may not have enabled closed captions.`,
                metadata, notes,
            };

        } catch (e: any) {
            console.error("YouTubeTranscriber Error:", e);
            notes.push(`Unexpected error: ${e.message}`);
            return { transcript: `Error fetching transcript: ${e.message}`, metadata, notes };
        }
    }

    /**
     * Fetch metadata via YouTube oEmbed API — reliable, no bot detection.
     */
    private async fetchOEmbedMetadata(videoId: string, metadata: YouTubeMetadata, notes: string[]) {
        try {
            const response = await requestUrl({
                url: `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
            });
            const data = JSON.parse(response.text);
            metadata.title = data.title || null;
            metadata.channel = data.author_name || null;
            notes.push("oEmbed metadata fetched successfully");
        } catch (e: any) {
            notes.push(`oEmbed metadata fetch failed: ${e.message}`);
        }
    }

    /**
     * Extract metadata from the YouTube page HTML.
     */
    private extractPageMetadata(html: string, metadata: YouTubeMetadata) {
        // Title (prefer page data over oEmbed if available)
        const titleMatch = html.match(/"title":"([^"]+)"/);
        if (titleMatch?.[1] && titleMatch[1] !== ' ') {
            metadata.title = this.unescapeJson(titleMatch[1]);
        }

        // Channel
        const channelMatch = html.match(/"ownerChannelName":"([^"]+)"/);
        if (channelMatch?.[1]) {
            metadata.channel = this.unescapeJson(channelMatch[1]);
        }

        // Duration
        const durationMatch = html.match(/"lengthSeconds":"(\d+)"/);
        if (durationMatch?.[1]) {
            metadata.durationSeconds = parseInt(durationMatch[1]);
        }

        // Description (first 500 chars)
        const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
        if (descMatch?.[1]) {
            metadata.description = this.unescapeJson(descMatch[1]).substring(0, 500);
        }
    }

    /**
     * Try multiple caption extraction methods in order of preference.
     */
    private async extractCaptions(
        html: string, videoId: string,
        metadata: YouTubeMetadata, notes: string[],
        limit: number
    ): Promise<string | null> {

        // Method 1: Extract from ytInitialPlayerResponse (embedded JSON)
        const playerResponse = this.extractInitialPlayerResponse(html);
        if (playerResponse) {
            notes.push("Found ytInitialPlayerResponse");
            const tracks = this.extractCaptionTracks(playerResponse);
            if (tracks && tracks.length > 0) {
                notes.push(`Found ${tracks.length} caption track(s) in player response`);
                const result = await this.fetchBestTrack(tracks, metadata, notes, limit);
                if (result) return result;
            }
        }

        // Method 2: Extract from "captions" JSON block (current plugin method, improved)
        const captionsStart = html.indexOf('"captions":');
        if (captionsStart !== -1) {
            notes.push('Found "captions" section in HTML');
            const captionsJson = this.extractBalancedJson(html, captionsStart);
            if (captionsJson) {
                try {
                    const config = JSON.parse(captionsJson);
                    const tracks = config.playerCaptionsTracklistRenderer?.captionTracks as CaptionTrack[] | undefined;
                    if (tracks && tracks.length > 0) {
                        notes.push(`Found ${tracks.length} caption track(s) in captions section`);
                        const result = await this.fetchBestTrack(tracks, metadata, notes, limit);
                        if (result) return result;
                    }
                } catch (e: any) {
                    notes.push(`Failed to parse captions JSON: ${e.message}`);
                }
            }
        }

        // Method 3: Try InnerTube player API with Android client (fallback)
        notes.push("Trying InnerTube Android player API fallback...");
        const apiKey = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
        if (apiKey) {
            try {
                const playerRes = await requestUrl({
                    url: `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`,
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        context: { client: { clientName: "ANDROID", clientVersion: "20.10.38" } },
                        videoId,
                        contentCheckOk: true,
                        racyCheckOk: true,
                    }),
                });
                const data = JSON.parse(playerRes.text);
                if (data.captions) {
                    const tracks = data.captions.playerCaptionsTracklistRenderer?.captionTracks as CaptionTrack[] | undefined;
                    if (tracks && tracks.length > 0) {
                        notes.push(`InnerTube API returned ${tracks.length} caption track(s)`);
                        const result = await this.fetchBestTrack(tracks, metadata, notes, limit);
                        if (result) return result;
                    }
                } else {
                    const reason = data.playabilityStatus?.reason || data.playabilityStatus?.status || "unknown";
                    notes.push(`InnerTube API: no captions (${reason})`);
                }
            } catch (e: any) {
                notes.push(`InnerTube API failed: ${e.message}`);
            }
        }

        return null;
    }

    /**
     * Sort tracks by quality and fetch the best one.
     * Priority: manual English > manual other > auto-gen English > auto-gen other
     */
    private async fetchBestTrack(
        tracks: CaptionTrack[],
        metadata: YouTubeMetadata, notes: string[],
        limit: number
    ): Promise<string | null> {
        const sorted = [...tracks].sort((a, b) => {
            const aKind = a.kind || '';
            const bKind = b.kind || '';
            // Prefer manual over auto-generated
            if (aKind === 'asr' && bKind !== 'asr') return 1;
            if (bKind === 'asr' && aKind !== 'asr') return -1;
            // Prefer English
            const aEn = (a.languageCode || '').startsWith('en');
            const bEn = (b.languageCode || '').startsWith('en');
            if (aEn && !bEn) return -1;
            if (bEn && !aEn) return 1;
            return 0;
        });

        // De-duplicate by language
        const seen = new Set<string>();
        const unique = sorted.filter(t => {
            const lang = (t.languageCode || '').toLowerCase();
            if (lang && seen.has(lang)) return false;
            if (lang) seen.add(lang);
            return true;
        });

        // Try each track until one succeeds
        for (const track of unique) {
            const kind = track.kind === 'asr' ? 'auto-generated' : 'manual';
            notes.push(`Trying ${kind} ${track.languageCode} track...`);

            // Try json3 format first (cleaner)
            const json3Result = await this.fetchJson3Transcript(track.baseUrl, limit);
            if (json3Result) {
                metadata.language = track.languageCode;
                metadata.captionSource = track.kind === 'asr' ? 'auto-generated' : 'manual';
                notes.push(`✓ Got transcript via json3 (${kind} ${track.languageCode}, ${json3Result.length} chars)`);
                return json3Result;
            }

            // Fallback to XML
            const xmlResult = await this.fetchXmlTranscript(track.baseUrl, limit);
            if (xmlResult) {
                metadata.language = track.languageCode;
                metadata.captionSource = track.kind === 'asr' ? 'auto-generated' : 'manual';
                notes.push(`✓ Got transcript via XML (${kind} ${track.languageCode}, ${xmlResult.length} chars)`);
                return xmlResult;
            }

            notes.push(`✗ Track ${track.languageCode} failed`);
        }

        return null;
    }

    /**
     * Fetch transcript in json3 format (preferred — cleaner segmentation).
     */
    private async fetchJson3Transcript(baseUrl: string, limit: number): Promise<string | null> {
        try {
            const url = new URL(baseUrl);
            url.searchParams.set('fmt', 'json3');
            url.searchParams.set('alt', 'json');

            const response = await requestUrl({ url: url.toString() });
            const data = JSON.parse(response.text);
            const events = data.events || [];
            const segments = events
                .filter((e: any) => e.segs)
                .flatMap((e: any) => (e.segs || []).map((s: any) => s.utf8).filter(Boolean));

            const transcript = segments.join('').trim();
            return transcript.length > 0 ? transcript.substring(0, limit) : null;
        } catch {
            return null;
        }
    }

    /**
     * Fetch transcript in XML format (fallback).
     */
    private async fetchXmlTranscript(baseUrl: string, limit: number): Promise<string | null> {
        try {
            const xmlRes = await requestUrl({ url: baseUrl });
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlRes.text, "text/xml");
            const textNodes = Array.from(xmlDoc.getElementsByTagName("text"));

            let transcript = "";
            for (const node of textNodes) {
                const text = node.textContent
                    ?.replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"');
                transcript += text + " ";
            }

            const result = transcript.trim();
            return result.length > 0 ? result.substring(0, limit) : null;
        } catch {
            return null;
        }
    }

    /**
     * Extract ytInitialPlayerResponse JSON from page HTML.
     */
    private extractInitialPlayerResponse(html: string): any | null {
        const token = 'ytInitialPlayerResponse';
        const tokenIndex = html.indexOf(token);
        if (tokenIndex < 0) return null;

        const assignmentIndex = html.indexOf('=', tokenIndex);
        if (assignmentIndex < 0) return null;

        const jsonStr = this.extractBalancedJson(html, assignmentIndex);
        if (!jsonStr) return null;

        try {
            return JSON.parse(jsonStr);
        } catch {
            return null;
        }
    }

    /**
     * Extract caption tracks from a player response object.
     */
    private extractCaptionTracks(playerResponse: any): CaptionTrack[] | null {
        const renderer =
            playerResponse?.captions?.playerCaptionsTracklistRenderer ??
            playerResponse?.playerCaptionsTracklistRenderer;

        if (!renderer) return null;

        const captionTracks = renderer.captionTracks as CaptionTrack[] | undefined;
        const autoTracks = renderer.automaticCaptions as CaptionTrack[] | undefined;

        const all: CaptionTrack[] = [];
        if (captionTracks) all.push(...captionTracks);
        if (autoTracks) all.push(...autoTracks);

        return all.length > 0 ? all : null;
    }

    /**
     * Extract a balanced JSON object from a string starting after a given position.
     */
    private extractBalancedJson(source: string, startAfter: number): string | null {
        const start = source.indexOf('{', startAfter);
        if (start < 0) return null;

        let depth = 0;
        let inString = false;
        let escaping = false;

        for (let i = start; i < source.length; i++) {
            const ch = source[i];

            if (inString) {
                if (escaping) { escaping = false; continue; }
                if (ch === '\\') { escaping = true; continue; }
                if (ch === '"') { inString = false; }
                continue;
            }

            if (ch === '"') { inString = true; continue; }
            if (ch === '{') { depth++; continue; }
            if (ch === '}') {
                depth--;
                if (depth === 0) return source.slice(start, i + 1);
            }
        }
        return null;
    }

    /**
     * Unescape JSON string escapes.
     */
    private unescapeJson(str: string): string {
        try {
            return JSON.parse(`"${str}"`);
        } catch {
            return str.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
    }

    /**
     * Extract YouTube video ID from various URL formats.
     */
    private extractId(url: string): string | null {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }
}
