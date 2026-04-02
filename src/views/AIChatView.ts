import { ItemView, WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import ChatApp from './ChatApp.svelte';

export const VIEW_TYPE_AI_CHAT = 'ai-chat-view';

export class AIChatView extends ItemView {
    component!: ReturnType<typeof mount>;
    private svelteExports: any = null;
    plugin: any; // Using any for now to avoid circular dependency issues in MVP

    constructor(leaf: WorkspaceLeaf, plugin: any) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return VIEW_TYPE_AI_CHAT;
    }

    getDisplayText() {
        return 'AI Copilot Chat';
    }

    getIcon() {
        return 'bot';
    }

    async onOpen() {
        const container = this.contentEl;
        container.empty();
        
        this.component = mount(ChatApp, {
            target: container,
            props: {
                plugin: this.plugin
            }
        });

        // Store reference to Svelte exports for external method calls
        this.svelteExports = this.component;
    }

    // Public method to inject selection context from command palette
    addSelectionContext(text: string, filePath: string) {
        if (this.svelteExports && typeof this.svelteExports.addSelectionContext === 'function') {
            this.svelteExports.addSelectionContext(text, filePath);
        }
    }

    // Public method to inject file context from file explorer right-click
    addFileContext(filePath: string, fileName: string) {
        if (this.svelteExports && typeof this.svelteExports.addFileContext === 'function') {
            this.svelteExports.addFileContext(filePath, fileName);
        }
    }

    // Public method to inject folder context from file explorer right-click
    addFolderContext(folderPath: string, folderName: string) {
        if (this.svelteExports && typeof this.svelteExports.addFolderContext === 'function') {
            this.svelteExports.addFolderContext(folderPath, folderName);
        }
    }

    // Public method to focus the chat input — only call on explicit user action
    focusChatInput() {
        // Direct DOM approach: find the visible textarea in the active tab.
        // We use a polling mechanism because restored tabs (especially empty or pinned ones) 
        // trigger session creation on mount, causing Svelte to re-render the tabs 
        // array. This reactivity pass can temporarily detach or hide the textarea
        // (offsetParent === null) right when this function is called.
        let attempts = 0;
        const maxAttempts = 10;
        
        const tryFocus = () => {
            attempts++;
            const textareas = this.contentEl.querySelectorAll('.chat-input-wrapper textarea');
            for (const ta of Array.from(textareas)) {
                if (ta instanceof HTMLTextAreaElement && ta.offsetParent !== null) {
                    ta.focus();
                    return; // Success
                }
            }
            
            if (attempts < maxAttempts) {
                setTimeout(tryFocus, 50); // Retry until Svelte finishes rendering
            } else {
                // Fallback: try Svelte exports chain if DOM fails
                if (this.svelteExports && typeof this.svelteExports.focusChatInput === 'function') {
                    this.svelteExports.focusChatInput();
                }
            }
        };
        
        requestAnimationFrame(tryFocus);
    }

    async onClose() {
        if (this.component) {
            unmount(this.component);
        }
    }
}
