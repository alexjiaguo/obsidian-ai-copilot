<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ChatSession } from "../settings/Settings";

  export let sessions: ChatSession[] = [];
  export let currentSessionId: string;
  export let isOpen: boolean = false;

  const dispatch = createEventDispatcher();

  $: sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  export function toggle() {
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
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-backdrop" on:click={() => isOpen = false}></div>
  <div class="history-drawer">
    <div class="drawer-header">
      <span class="drawer-title">Chat History</span>
      <button class="drawer-close" on:click={() => isOpen = false} aria-label="Close history">✕</button>
    </div>
    <div class="drawer-list">
      {#each sortedSessions as session}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="session-item"
          class:current={session.id === currentSessionId}
          on:click={() => select(session.id)}
          title={session.title}
        >
          <div class="session-info">
            <span class="item-name">{session.title || "New Chat"}</span>
            <span class="item-date">{new Date(session.updatedAt).toLocaleDateString()}</span>
          </div>
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span class="delete-btn" on:click={(e) => deleteSession(session.id, e)} title="Delete session">✕</span>
        </div>
      {/each}
      {#if sortedSessions.length === 0}
        <div class="empty-state">No history yet</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    z-index: 999;
  }

  .history-drawer {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 280px;
    max-width: 80%;
    background-color: var(--background-primary);
    border-left: 1px solid var(--background-modifier-border);
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .drawer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid var(--background-modifier-border);
    flex-shrink: 0;
  }

  .drawer-title {
    font-weight: 600;
    font-size: var(--font-ui-small);
  }

  .drawer-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    font-size: 12px;
  }
  .drawer-close:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  .drawer-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .session-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-normal);
    gap: 6px;
    margin-bottom: 1px;
  }

  .session-item:hover {
    background-color: var(--background-modifier-hover);
  }

  .session-item.current {
    background-color: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .session-item.current .item-date,
  .session-item.current .delete-btn {
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
    margin-bottom: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-date {
    font-size: 0.75em;
    color: var(--text-muted);
  }

  .empty-state {
    text-align: center;
    padding: 24px;
    color: var(--text-muted);
    font-size: var(--font-ui-smaller);
  }

  .delete-btn {
    background: transparent;
    border: none;
    padding: 3px;
    border-radius: 4px;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    font-size: 11px;
    transition: opacity 0.15s, background-color 0.15s, color 0.15s;
  }

  .session-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background-color: var(--background-modifier-error-hover) !important;
    color: var(--text-error) !important;
    opacity: 1;
  }
</style>
