<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let selectedModel = "gpt-4o-mini";
  export let models: string[] = ["gpt-4o-mini", "gpt-4o"];

  const dispatch = createEventDispatcher();

  function handleChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    selectedModel = val;
    dispatch("change", val);
  }
</script>

<div class="model-selector">
  <select value={selectedModel} on:change={handleChange} title={selectedModel}>
    {#each models as model}
      <option value={model} selected={model === selectedModel}>{model}</option>
    {/each}
  </select>
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
    class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg
  >
</div>

<style>
  .model-selector {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  select {
    appearance: none;
    -webkit-appearance: none;
    background: var(--background-modifier-hover);
    border: 1px solid var(--background-modifier-border);
    padding: 4px 28px 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    font-family: inherit;
    transition:
      color 0.2s,
      background-color 0.2s,
      border-color 0.2s;
    white-space: nowrap;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    outline: none;
  }

  select:hover {
    color: var(--text-normal);
    background-color: var(--background-secondary);
    border-color: var(--interactive-accent);
  }

  select:focus {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  /* Style the dropdown options to match Obsidian theme */
  select option {
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: var(--font-ui-smaller);
  }

  .chevron {
    position: absolute;
    right: 8px;
    pointer-events: none;
    color: var(--text-muted);
    flex-shrink: 0;
  }
</style>
