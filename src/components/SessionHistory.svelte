<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ChatSession } from "../settings/Settings";

  export let sessions: ChatSession[] = [];
  export let currentSessionId: string;

  const dispatch = createEventDispatcher();
  let isOpen = false;

  $: sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  function toggle() {
    isOpen = !isOpen;
  }

  function select(id: string) {
    isOpen = false;
    if (id !== currentSessionId) {
      dispatch("select", id);
    }
  }

  function deleteSession(id: string, e: MouseEvent) {
    e.stopPropagation();
    dispatch("delete", id);
  }

  function close(e: MouseEvent) {
    if (isOpen) isOpen = false;
  }
</script>

<div class="session-selector">
  <button
    class="selector-btn"
    class:active={isOpen}
    on:click|stopPropagation={toggle}
    title="Chat History"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="lucide lucide-history"
      ><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path
        d="M3 3v5h5"
      /><path d="M12 7v5l4 2" /></svg
    >
  </button>

  {#if isOpen}
    <div class="dropdown-menu">
      {#each sortedSessions as session}
        <button
          class="dropdown-item"
          class:current={session.id === currentSessionId}
          on:click={() => select(session.id)}
          title={session.title}
        >
          <div class="session-info">
            <span class="item-name">{session.title || "New Chat"}</span>
            <span class="item-date"
              >{new Date(session.updatedAt).toLocaleDateString()}</span
            >
          </div>
          <div
            class="delete-btn"
            on:click={(e) => deleteSession(session.id, e)}
            title="Delete Session"
            aria-label="Delete Session"
          >
            ✕
          </div>
        </button>
      {/each}
      {#if sortedSessions.length === 0}
        <div class="dropdown-item empty">No history found</div>
      {/if}
    </div>
  {/if}
</div>

<svelte:window on:click={close} />

<style>
  .session-selector {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .selector-btn {
    background: transparent;
    border: none;
    padding: 4px;
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

  .selector-btn:hover,
  .selector-btn.active {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    min-width: 260px;
    padding: 4px;
    max-height: 350px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-normal);
    gap: 8px;
  }

  .dropdown-item:hover {
    background-color: var(--background-modifier-hover);
  }

  .dropdown-item.current {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .dropdown-item.current .item-date,
  .dropdown-item.current .delete-btn {
    color: var(--text-on-accent);
    opacity: 0.8;
  }

  .session-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
  }

  .item-name {
    font-weight: 500;
    font-size: var(--font-ui-smaller);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-date {
    font-size: 0.8em;
    color: var(--text-muted);
  }

  .empty {
    justify-content: center;
    color: var(--text-muted);
    cursor: default;
  }
  .empty:hover {
    background-color: transparent;
  }

  .delete-btn {
    background: transparent;
    border: none;
    padding: 4px;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition:
      opacity 0.2s,
      background-color 0.2s,
      color 0.2s;
  }

  .dropdown-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background-color: var(--background-modifier-error-hover) !important;
    color: var(--text-error) !important;
    opacity: 1;
  }
</style>
