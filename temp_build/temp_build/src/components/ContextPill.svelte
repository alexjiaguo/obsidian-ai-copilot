<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let text: string;
  export let type: "file" | "folder" | "selection" | "image" | "heading";

  const dispatch = createEventDispatcher();
</script>

<div
  class="context-pill"
  class:file={type === "file"}
  class:folder={type === "folder"}
  class:selection={type === "selection"}
>
  <span class="icon">
    {#if type === "file"}
      📄
    {:else if type === "folder"}
      cpp
    {:else if type === "selection"}
      📝
    {:else if type === "image"}
      🖼️
    {:else if type === "heading"}
      #️⃣
    {/if}
  </span>

  <span class="text">{text}</span>

  <button
    class="remove-btn"
    on:click={() => dispatch("remove")}
    aria-label="Remove context"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      ><line x1="18" y1="6" x2="6" y2="18"></line><line
        x1="6"
        y1="6"
        x2="18"
        y2="18"
      ></line></svg
    >
  </button>
</div>

<style>
  .context-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: var(--font-ui-smaller);
    background-color: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    max-width: 100%;
    user-select: none;
  }

  .context-pill.selection {
    background-color: var(--interactive-accent-hover);
    color: var(--text-on-accent);
    border-color: transparent;
  }

  .icon {
    display: flex;
    align-items: center;
    opacity: 0.7;
  }

  .text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }

  .remove-btn {
    background: transparent;
    border: none;
    padding: 0;
    display: flex;
    align-items: center;
    cursor: pointer;
    opacity: 0.5;
    color: inherit;
    width: 14px;
    height: 14px;
  }

  .remove-btn:hover {
    opacity: 1;
    background-color: var(--background-modifier-hover);
    border-radius: 3px;
  }
</style>
