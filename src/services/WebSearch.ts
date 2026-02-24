import { requestUrl } from 'obsidian';

export class WebSearch {
    async search(query: string, maxResults = 5): Promise<string> {
        try {
            // Using DuckDuckGo HTML search for a free, no-key scraping approach
            const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const response = await requestUrl({ 
                url, 
                method: 'GET', 
                headers: { 
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                } 
            });
            
            const html = response.text;
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const results = Array.from(doc.querySelectorAll('.result')).slice(0, maxResults);
            
            if (results.length === 0) {
                return "No results found or search was blocked.";
            }
            
            return results.map(r => {
                const title = r.querySelector('.result__title')?.textContent?.trim() || 'No Title';
                const snippet = r.querySelector('.result__snippet')?.textContent?.trim() || 'No snippet';
                const link = r.querySelector('.result__url')?.getAttribute('href') || r.querySelector('.result__url')?.textContent?.trim() || '';
                
                // Clean up DuckDuckGo redirect URLs
                let cleanLink = link;
                if (link.startsWith('//duckduckgo.com/l/?uddg=')) {
                    try {
                        cleanLink = decodeURIComponent(link.split('uddg=')[1].split('&')[0]);
                    } catch (e) { }
                }

                return `Title: ${title}\nURL: ${cleanLink}\nSummary: ${snippet}`;
            }).join('\n\n');
        } catch (e: any) {
            console.error("WebSearch Error:", e);
            return `Failed to fetch web search: ${e.message}`;
        }
    }
}
