<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import { MarkdownRenderer, Component } from "obsidian";
  import { createEventDispatcher } from "svelte";

  export let role: "user" | "assistant" | "error" | "tool";
  export let content: string;
  export let isStreaming = false;
  export let app: any = null; // Obsidian App instance for MarkdownRenderer

  const dispatch = createEventDispatcher();

  let markdownEl: HTMLElement;
  let renderComponent: Component | null = null;
  let lastRenderedContent = "";

  // Helper for "Thinking" state
  let dots = "";
  $: if (role === "assistant" && content === "" && isStreaming) {
    const interval = setInterval(() => {
      dots = dots.length < 3 ? dots + "." : "";
    }, 500);
  }

  function renderMarkdown() {
    if (!markdownEl || !content || !app) return;
    if (role === "user") return; // User messages stay plain text
    if (content === lastRenderedContent) return; // Skip if already rendered

    // Clean up previous render component
    if (renderComponent) {
      renderComponent.unload();
    }

    markdownEl.empty();
    renderComponent = new Component();
    renderComponent.load();

    MarkdownRenderer.render(
      app,
      content,
      markdownEl,
      "", // sourcePath - empty string is fine for chat
      renderComponent,
    );

    lastRenderedContent = content;
  }

  onMount(() => {
    renderMarkdown();
    return () => {
      if (renderComponent) {
        renderComponent.unload();
      }
    };
  });

  afterUpdate(() => {
    renderMarkdown();
  });
</script>

<div class="message-container {role}">
  <div class="avatar">
    {#if role === "user"}
      <span>👤</span>
    {:else if role === "assistant"}
      <span>🤖</span>
    {:else}
      <span>⚠️</span>
    {/if}
  </div>

  <div class="message-body">
    <div class="content-bubble">
      {#if role === "assistant" && !content}
        <span class="thinking">AI is thinking{dots}</span>
      {:else if role === "user"}
        <div class="user-content">{content}</div>
      {:else}
        <div class="markdown-content" bind:this={markdownEl}></div>
      {/if}
    </div>

    {#if role === "user" || (role === "assistant" && content)}
      <div class="message-actions">
        {#if role === "user"}
          <button
            class="action-btn"
            on:click={() => dispatch("edit")}
            title="Edit"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
              /><path d="m15 5 4 4" /></svg
            >
          </button>
          <button
            class="action-btn"
            on:click={() => dispatch("copy")}
            title="Copy"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path
                d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
              /></svg
            >
          </button>
          <button
            class="action-btn"
            on:click={() => dispatch("delete")}
            title="Delete"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M3 6h18" /><path
                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
              /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg
            >
          </button>
        {:else}
          <button
            class="action-btn"
            on:click={() => dispatch("quote")}
            title="Quote & follow up"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg
            >
          </button>
          <button
            class="action-btn"
            on:click={() => dispatch("insert")}
            title="Insert at cursor"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path
                d="M19 21H5"
              /></svg
            >
          </button>
          <button
            class="action-btn"
            on:click={() => dispatch("copy")}
            title="Copy"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path
                d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
              /></svg
            >
          </button>
          <button
            class="action-btn"
            on:click={() => dispatch("regenerate")}
            title="Regenerate"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path
                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
              /><path d="M3 3v5h5" /></svg
            >
          </button>
          <button
            class="action-btn"
            on:click={() => dispatch("delete")}
            title="Delete"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M3 6h18" /><path
                d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
              /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg
            >
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .message-container {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
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

  .message-body {
    display: flex;
    flex-direction: column;
    max-width: 85%;
    min-width: 0;
  }

  .message-container.user .message-body {
    align-items: flex-end;
  }

  .content-bubble {
    background-color: var(--background-secondary);
    padding: 8px 12px;
    border-radius: 8px;
    font-size: var(--font-ui-medium);
    line-height: 1.5;
    overflow-wrap: break-word;
    word-break: break-word;
  }

  .message-container.user .content-bubble {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .message-container.error .content-bubble {
    background-color: var(--background-modifier-error);
    color: var(--text-on-accent);
  }

  .user-content {
    white-space: pre-wrap;
  }

  /* Markdown rendered content styling */
  .markdown-content :global(p) {
    margin: 0.4em 0;
  }
  .markdown-content :global(p:first-child) {
    margin-top: 0;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 0.6em 0 0.3em 0;
    line-height: 1.3;
  }
  .markdown-content :global(h1) {
    font-size: 1.4em;
  }
  .markdown-content :global(h2) {
    font-size: 1.25em;
  }
  .markdown-content :global(h3) {
    font-size: 1.1em;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.3em 0;
    padding-left: 1.5em;
  }

  .markdown-content :global(li) {
    margin: 0.15em 0;
  }

  .markdown-content :global(code) {
    background-color: var(--background-primary);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.9em;
  }

  .markdown-content :global(pre) {
    background-color: var(--background-primary);
    padding: 8px 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.5em 0;
  }

  .markdown-content :global(pre code) {
    background: none;
    padding: 0;
    font-size: 0.85em;
  }

  .markdown-content :global(blockquote) {
    border-left: 3px solid var(--interactive-accent);
    margin: 0.5em 0;
    padding: 0.2em 0.8em;
    color: var(--text-muted);
  }

  .markdown-content :global(table) {
    border-collapse: collapse;
    margin: 0.5em 0;
    width: 100%;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid var(--background-modifier-border);
    padding: 4px 8px;
    text-align: left;
  }

  .markdown-content :global(th) {
    background-color: var(--background-primary);
    font-weight: 600;
  }

  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--background-modifier-border);
    margin: 0.8em 0;
  }

  .markdown-content :global(a) {
    color: var(--text-accent);
    text-decoration: underline;
  }

  .markdown-content :global(img) {
    max-width: 100%;
    border-radius: 4px;
  }

  .thinking {
    color: var(--text-muted);
    font-style: italic;
  }

  .message-actions {
    display: flex;
    gap: 2px;
    margin-top: 2px;
    visibility: hidden;
    height: 22px;
  }

  .message-container:hover .message-actions {
    visibility: visible;
  }

  .action-btn {
    background: transparent;
    border: none;
    border-radius: 4px;
    width: 24px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    color: var(--text-muted);
    transition:
      color 0.15s,
      background-color 0.15s;
  }

  .action-btn:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }
</style>
