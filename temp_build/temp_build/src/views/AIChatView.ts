import { ItemView, WorkspaceLeaf } from 'obsidian';
import { mount, unmount } from 'svelte';
import ChatView from './ChatView.svelte';

export const VIEW_TYPE_AI_CHAT = 'ai-chat-view';

export class AIChatView extends ItemView {
    component: ReturnType<typeof mount>;
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
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        this.component = mount(ChatView, {
            target: container,
            props: {
                plugin: this.plugin
            }
        });
    }

    async onClose() {
        if (this.component) {
            unmount(this.component);
        }
    }
}

