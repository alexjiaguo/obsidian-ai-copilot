<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { Persona } from "../settings/Settings";

  export let selectedPersonaId: string;
  export let personas: Persona[] = [];

  const dispatch = createEventDispatcher();
  let isOpen = false;

  $: selectedPersona =
    personas.find((p) => p.id === selectedPersonaId) || personas[0];

  function toggle() {
    isOpen = !isOpen;
  }

  function select(id: string) {
    selectedPersonaId = id;
    isOpen = false;
    dispatch("change", id);
  }

  function close(e: MouseEvent) {
    if (isOpen) isOpen = false;
  }
</script>

<div class="persona-selector">
  <button
    class="selector-btn"
    on:click|stopPropagation={toggle}
    title={selectedPersona?.description}
  >
    <span class="icon">🎭</span>
    <span class="persona-name">{selectedPersona?.name || "Select Persona"}</span
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
      class:rotated={isOpen}><polyline points="6 9 12 15 18 9"></polyline></svg
    >
  </button>

  {#if isOpen}
    <div class="dropdown-menu">
      {#each personas as persona}
        <button
          class="dropdown-item"
          class:active={persona.id === selectedPersonaId}
          on:click={() => select(persona.id)}
          title={persona.description}
        >
          <span class="item-name">{persona.name}</span>
          {#if persona.description}
            <span class="item-desc">{persona.description}</span>
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<svelte:window on:click={close} />

<style>
  .persona-selector {
    position: relative;
    display: inline-block;
  }

  .selector-btn {
    background: transparent;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
    transition:
      color 0.2s,
      background-color 0.2s;
  }

  .selector-btn:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  .persona-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  svg {
    transition: transform 0.2s;
    opacity: 0.7;
  }

  svg.rotated {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-width: 200px;
    padding: 4px;
    max-height: 300px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    flex-direction: column;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-normal);
  }

  .dropdown-item:hover {
    background-color: var(--background-modifier-hover);
  }

  .dropdown-item.active {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .dropdown-item.active .item-name,
  .dropdown-item.active .item-desc {
    color: var(--text-on-accent);
  }

  .item-name {
    font-weight: 500;
    font-size: var(--font-ui-smaller);
    margin-bottom: 2px;
  }

  .item-desc {
    font-size: 0.8em;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
