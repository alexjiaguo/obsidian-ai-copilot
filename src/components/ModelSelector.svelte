<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { onMount } from "svelte";

  export let selectedModel = "gpt-4o-mini";
  export let models: string[] = ["gpt-4o-mini", "gpt-4o"];

  const dispatch = createEventDispatcher();
  let selectEl: HTMLSelectElement;
  let measureSpan: HTMLSpanElement;

  function handleChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    selectedModel = val;
    dispatch("change", val);
    updateWidth();
  }

  function updateWidth() {
    if (!measureSpan || !selectEl) return;
    measureSpan.textContent = selectedModel;
    // Add padding: 10px left + 28px right (for chevron) + 2px border
    const textWidth = measureSpan.offsetWidth;
    selectEl.style.width = `${textWidth + 40}px`;
  }

  // React to external changes in selectedModel
  $: if (selectedModel && measureSpan && selectEl) {
    tick().then(updateWidth);
  }

  onMount(() => {
    updateWidth();
  });
</script>

<div class="model-selector">
  <span class="measure-span" bind:this={measureSpan}>{selectedModel}</span>
  <select
    bind:this={selectEl}
    value={selectedModel}
    on:change={handleChange}
    title={selectedModel}
  >
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

  .measure-span {
    position: absolute;
    visibility: hidden;
    height: 0;
    overflow: hidden;
    white-space: nowrap;
    font-size: var(--font-ui-smaller);
    font-family: inherit;
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
      border-color 0.2s,
      width 0.15s ease;
    white-space: nowrap;
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
