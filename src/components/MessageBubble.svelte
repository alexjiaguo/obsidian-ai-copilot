<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    // We assume a markdown renderer is passed or available globally in Obsidian context
    // For now, we'll just display text, but in real plugin we'd use MarkdownRenderer
    export let role: 'user' | 'assistant' | 'error';
    export let content: string;
    export let isStreaming = false;

    const dispatch = createEventDispatcher();

    // Helper for "Thinking" state
    let dots = '';
    $: if (role === 'assistant' && content === '' && isStreaming) {
        const interval = setInterval(() => {
            dots = dots.length < 3 ? dots + '.' : '';
        }, 500);
    }
</script>

<div class="message-container {role}">
    <div class="avatar">
        {#if role === 'user'}
            <span>👤</span>
        {:else if role === 'assistant'}
            <span>🤖</span>
        {:else}
            <span>⚠️</span>
        {/if}
    </div>
    
    <div class="content-bubble">
        {#if role === 'assistant' && !content}
             <span class="thinking">AI is thinking{dots}</span>
        {:else}
             <div class="markdown-content">
                 <!-- In a real implementation, bind:this and use Obsidian's MarkdownRenderer -->
                 {@html content.replace(/\n/g, '<br>')}
             </div>
        {/if}

        {#if role === 'assistant' && content}
            <div class="message-actions">
                <button class="action-btn" on:click={() => dispatch('copy')}>Copy</button>
                <button class="action-btn" on:click={() => dispatch('insert')}>Insert</button>
                <button class="action-btn" on:click={() => dispatch('replace')}>Replace Selection</button>
            </div>
        {/if}
    </div>
</div>

<style>
    .message-container {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        align-items: flex-start;
    }

    .message-container.user {
        flex-direction: row-reverse;
    }

    .avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: var(--background-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
    }

    .content-bubble {
        background-color: var(--background-secondary);
        padding: 8px 12px;
        border-radius: 8px;
        max-width: 85%;
        font-size: var(--font-ui-medium);
        line-height: 1.5;
        position: relative;
    }

    .message-container.user .content-bubble {
        background-color: var(--interactive-accent);
        color: var(--text-on-accent);
    }
    
    .message-container.error .content-bubble {
        background-color: var(--background-modifier-error);
        color: var(--text-on-accent);
    }

    .thinking {
        color: var(--text-muted);
        font-style: italic;
    }

    .message-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        opacity: 0;
        transition: opacity 0.2s;
    }

    .content-bubble:hover .message-actions {
        opacity: 1;
    }

    .action-btn {
        background: transparent;
        border: 1px solid var(--background-modifier-border);
        border-radius: 4px;
        padding: 2px 6px;
        font-size: var(--font-ui-smaller);
        cursor: pointer;
        color: var(--text-muted);
    }

    .action-btn:hover {
        background-color: var(--background-modifier-hover);
        color: var(--text-normal);
    }
</style>
