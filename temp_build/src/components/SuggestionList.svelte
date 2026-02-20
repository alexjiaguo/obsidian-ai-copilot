<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let items: any[] = [];
  export let selectedIndex = 0;

  const dispatch = createEventDispatcher();

  function select(item: any) {
    if (item.type === "file") {
      dispatch("select", item.file);
    } else if (item.type === "heading") {
      dispatch("select", {
        type: "heading",
        file: item.file,
        heading: item.heading.heading,
        path: item.file.path,
      });
    } else {
      dispatch("select", item);
    }
  }
</script>

<div class="suggestion-popover">
  <div class="suggestion-header">Suggested Context</div>
  <div class="suggestion-scroll">
    {#each items as item, i}
      <button
        class="suggestion-item"
        class:selected={i === selectedIndex}
        on:click|stopPropagation={() => select(item)}
        on:mouseenter={() => (selectedIndex = i)}
        tabindex="-1"
      >
        <div class="icon-wrapper">
          {#if item.type === "heading"}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="lucide lucide-hash"
              ><line x1="4" y1="9" x2="20" y2="9"></line><line
                x1="4"
                y1="15"
                x2="20"
                y2="15"
              ></line><line x1="10" y1="3" x2="8" y2="21"></line><line
                x1="16"
                y1="3"
                x2="14"
                y2="21"
              ></line></svg
            >
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="lucide lucide-file-text"
              ><path
                d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
              ></path><polyline points="14 2 14 8 20 8"></polyline><line
                x1="16"
                y1="13"
                x2="8"
                y2="13"
              ></line><line x1="16" y1="17" x2="8" y2="17"></line><line
                x1="10"
                y1="9"
                x2="8"
                y2="9"
              ></line></svg
            >
          {/if}
        </div>

        <div class="content-wrapper">
          <div class="main-text">
            {#if item.type === "heading"}
              <span class="file-ref">{item.file.basename}</span>
              <span class="separator">/</span>
              <span class="heading-name">{item.heading.heading}</span>
            {:else if item.file}
              <span class="file-name">{item.file.basename}</span>
            {:else}
              <span class="file-name">{item.basename}</span>
            {/if}
          </div>
          <div class="sub-text">{item.file ? item.file.path : item.path}</div>
        </div>

        {#if i === selectedIndex}
          <div class="enter-hint">↵</div>
        {/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .suggestion-popover {
    position: absolute;
    bottom: 100%;
    left: 0;
    width: 100%;
    max-height: 240px;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.2);
    z-index: 1000;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .suggestion-header {
    padding: 6px 12px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    background-color: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
    font-weight: 600;
    flex-shrink: 0;
  }

  .suggestion-scroll {
    overflow-y: auto;
    flex: 1;
    padding: 4px;
  }

  .suggestion-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    border-radius: 4px;
    gap: 10px;
    transition: background-color 0.1s;
    color: var(--text-normal);
  }

  .suggestion-item.selected {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  /* Adjust internal colors when selected */
  .suggestion-item.selected .sub-text,
  .suggestion-item.selected .file-ref,
  .suggestion-item.selected .separator {
    color: var(--text-on-accent);
    opacity: 0.8;
  }

  .suggestion-item.selected .icon-wrapper {
    color: var(--text-on-accent);
  }

  .icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .content-wrapper {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .main-text {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .file-ref {
    opacity: 0.7;
    font-weight: 400;
  }

  .separator {
    opacity: 0.5;
    font-size: 0.9em;
  }

  .sub-text {
    font-size: 10px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-monospace);
  }

  .enter-hint {
    font-size: 10px;
    opacity: 0.7;
    padding-left: 8px;
  }
</style>
