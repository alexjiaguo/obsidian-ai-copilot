import { App, TFile } from 'obsidian';

export class PDFService {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Extract text from a PDF file in the vault.
     * Uses binary stream scanning to find text content without heavy dependencies.
     */
    async extractText(filePath: string): Promise<string> {
        try {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) {
                return `Error: PDF file not found at ${filePath}`;
            }
            if (!file.extension.toLowerCase().endsWith('pdf')) {
                return `Error: ${filePath} is not a PDF file.`;
            }

            const buffer = await this.app.vault.readBinary(file);
            const bytes = new Uint8Array(buffer);
            const text = this.extractFromBinary(bytes);
            
            if (!text || text.trim().length === 0) {
                return "Could not extract text from this PDF. It may be a scanned/image-only document.";
            }

            // Limit to ~20K chars to avoid overwhelming the LLM
            return text.substring(0, 20000);
        } catch (e: any) {
            console.error("PDFService Error:", e);
            return `Error extracting PDF text: ${e.message}`;
        }
    }

    /**
     * Lightweight PDF text extractor.
     * Scans for text stream objects in the binary PDF structure.
     * Handles both raw text and Tj/TJ operators.
     */
    private extractFromBinary(bytes: Uint8Array): string {
        const raw = new TextDecoder('latin1').decode(bytes);
        const textParts: string[] = [];

        // Strategy 1: Find text between BT (Begin Text) and ET (End Text) operators
        const btEtRegex = /BT\s([\s\S]*?)ET/g;
        let match: RegExpExecArray | null;

        while ((match = btEtRegex.exec(raw)) !== null) {
            const block = match[1];
            
            // Extract strings from Tj operator: (text) Tj
            const tjRegex = /\(([^)]*)\)\s*Tj/g;
            let tjMatch: RegExpExecArray | null;
            while ((tjMatch = tjRegex.exec(block)) !== null) {
                textParts.push(this.decodeEscaped(tjMatch[1]));
            }

            // Extract strings from TJ operator: [(text) num (text)] TJ
            const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
            let tjArrMatch: RegExpExecArray | null;
            while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
                const inner = tjArrMatch[1];
                const strRegex = /\(([^)]*)\)/g;
                let strMatch: RegExpExecArray | null;
                while ((strMatch = strRegex.exec(inner)) !== null) {
                    textParts.push(this.decodeEscaped(strMatch[1]));
                }
            }
        }

        // Strategy 2: Also check for decoded FlateDecode streams (already decoded by some PDFs)
        // Look for readable text patterns in stream objects
        if (textParts.length === 0) {
            const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
            while ((match = streamRegex.exec(raw)) !== null) {
                const streamContent = match[1];
                // Only grab streams that look like they contain readable text
                const readableChars = streamContent.replace(/[^\x20-\x7E\n\r]/g, '');
                if (readableChars.length > 50 && readableChars.length > streamContent.length * 0.3) {
                    textParts.push(readableChars.trim());
                }
            }
        }

        return textParts.join(' ').replace(/\s+/g, ' ').trim();
    }

    private decodeEscaped(str: string): string {
        return str
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\')
            .replace(/\\([()\\])/g, '$1');
    }

    /**
     * List all PDF files in the vault (for search/discovery).
     */
    listPDFs(): TFile[] {
        return this.app.vault.getFiles().filter((f: TFile) => f.extension === 'pdf');
    }
}
