<script lang="ts">
  import { createEventDispatcher, afterUpdate, onMount } from "svelte";

  export let selectedProjectId: string | null = null;
  export let projects: { id: string; name: string }[] = [];

  const dispatch = createEventDispatcher();
  let selectEl: HTMLSelectElement;

  function handleChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    const finalVal = val === "null" || val === "" ? null : val;
    selectedProjectId = finalVal;
    dispatch("change", finalVal);
  }
</script>

<div class="project-selector">
  <select
    bind:this={selectEl}
    value={selectedProjectId || "null"}
    on:change={handleChange}
    class="project-input"
    title={selectedProjectId ? projects.find(p => p.id === selectedProjectId)?.name || "Select Project" : "No Project (Global)"}
  >
    <option value="null">No Project (Global)</option>
    {#each projects as project}
      <option value={project.id}>{project.name}</option>
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
  .project-selector {
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
    width: 140px; /* Fixed small width for the header */
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

  .chevron {
    position: absolute;
    right: 8px;
    pointer-events: none;
    color: var(--text-muted);
    flex-shrink: 0;
  }
</style>
