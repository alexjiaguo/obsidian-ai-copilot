<script lang="ts">
  import { createEventDispatcher } from "svelte";
  export let path: string;
  export let oldText: string;
  export let newText: string;
  export let status: "pending" | "accepted" | "rejected" = "pending";

  const dispatch = createEventDispatcher();

  function splitLines(text: string) {
    if (!text) return [];
    return text.split("\n");
  }

  $: oldLines = splitLines(oldText);
  $: newLines = splitLines(newText);
</script>

<div class="composer-diff">
  <div class="diff-header {status}">
    <span class="diff-file">{path}</span>
    <div class="diff-actions">
      {#if status === "pending"}
        <button
          class="accept-btn"
          on:click={() => dispatch("accept")}
          title="Accept Edit">✓ Accept</button
        >
        <button
          class="reject-btn"
          on:click={() => dispatch("reject")}
          title="Reject Edit">✕ Reject</button
        >
      {:else}
        <span class="status-badge">{status.toUpperCase()}</span>
        {#if status === "accepted"}
          <button
            class="revert-btn"
            on:click={() => dispatch("revert")}
            title="Revert Edit">↺ Revert</button
          >
        {/if}
      {/if}
    </div>
  </div>
  <div class="diff-content">
    {#if oldLines.length > 0}
      <pre class="diff-old">
        {#each oldLines as line}
          <div class="diff-line removed"><span class="diff-sigil">-</span
            > {line}</div>
        {/each}
      </pre>
    {/if}
    {#if newLines.length > 0}
      <pre class="diff-new">
        {#each newLines as line}
          <div class="diff-line added"><span class="diff-sigil">+</span
            > {line}</div>
        {/each}
      </pre>
    {/if}
  </div>
</div>

<style>
  .composer-diff {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    margin: 12px 0;
    overflow: hidden;
    background-color: var(--background-primary);
  }
  .diff-header {
    background-color: var(--background-secondary);
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  .diff-header.accepted {
    background-color: rgba(var(--color-green-rgb), 0.1);
  }
  .diff-header.rejected {
    background-color: rgba(var(--color-red-rgb), 0.1);
  }
  .diff-file {
    font-family: var(--font-monospace);
    font-size: 0.9em;
    font-weight: 600;
  }
  .diff-actions {
    display: flex;
    gap: 6px;
  }
  .diff-actions button {
    font-size: 0.8em;
    padding: 4px 8px;
    cursor: pointer;
    border-radius: 4px;
    border: none;
    font-weight: 500;
  }
  .accept-btn {
    background-color: var(--color-green);
    color: var(--text-on-accent);
  }
  .reject-btn {
    background-color: var(--color-red);
    color: var(--text-on-accent);
  }
  .revert-btn {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  .status-badge {
    font-size: 0.8em;
    font-weight: bold;
    padding: 4px 8px;
    border-radius: 4px;
    background-color: var(--background-modifier-active-hover);
  }
  .diff-content {
    overflow-x: auto;
    font-family: var(--font-monospace);
    font-size: 0.85em;
    max-height: 400px;
  }
  .diff-line {
    padding: 0 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .diff-sigil {
    opacity: 0.5;
    user-select: none;
    display: inline-block;
    width: 1em;
  }
  .diff-old,
  .diff-new {
    margin: 0;
    padding: 8px 0;
  }
  .removed {
    background-color: rgba(var(--color-red-rgb), 0.15);
    color: var(--text-error);
  }
  .added {
    background-color: rgba(var(--color-green-rgb), 0.15);
    color: var(--text-success);
  }
</style>
