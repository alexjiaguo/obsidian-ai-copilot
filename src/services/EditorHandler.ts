import { Editor, MarkdownView, Notice, App, WorkspaceLeaf } from 'obsidian';

export class EditorHandler {
    private app: App;
    private lastActiveEditor: Editor | null = null;
    private lastActiveFile: string | null = null;

    constructor(app: App) {
        this.app = app;
    }

    // Called by main.ts on active-leaf-change
    updateActiveLeaf(leaf: WorkspaceLeaf | null) {
        if (leaf && leaf.view instanceof MarkdownView) {
            this.lastActiveEditor = leaf.view.editor;
            this.lastActiveFile = leaf.view.file?.basename || null;

        }
    }

    private getEditor(): Editor | null {
        // First try the current active view via getActiveViewOfType
        // This is often more reliable than activeLeaf if focus is momentarily elsewhere
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
            this.lastActiveEditor = activeView.editor;
            this.lastActiveFile = activeView.file?.basename || null;
            return activeView.editor;
        }

        // Fallback to cached editor if we are in the sidebar
        return this.lastActiveEditor;
    }

    getSelectedText(): string | null {
        const editor = this.getEditor();
        if (!editor) return null;
        if (!editor.somethingSelected()) return null;
        return editor.getSelection();
    }

    insertText(text: string, mode: 'insert' | 'replace'): boolean {
        const editor = this.getEditor();
        if (!editor) {
            new Notice('No active editor found to insert text');
            return false;
        }

        if (mode === 'replace') {
            editor.replaceSelection(text);
        } else {
            // Insert below
            const cursor = editor.getCursor('to');
            // Ensure we are on a new line
            const lineContent = editor.getLine(cursor.line);
            const isEndOfLine = cursor.ch === lineContent.length;
            
            let insertText = text;
            if (!text.startsWith('\n')) insertText = '\n' + insertText;
            
            if (isEndOfLine) {
                 editor.replaceRange(insertText, cursor);
            } else {
                 editor.replaceRange(insertText, cursor);
            }
        }
        return true;
    }

    getActiveFileName(): string | null {
        // refresh
        this.getEditor(); 
        return this.lastActiveFile;
    }
}
