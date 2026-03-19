<script lang="ts">
  import { onMount } from "svelte";
  import { Notice } from "obsidian";

  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  import ChatView from "./ChatView.svelte";
  import SessionHistory from "../components/SessionHistory.svelte";
  import type { ChatSession } from "../settings/Settings";

  export let plugin: any;

  let tabs = plugin.settings?.tabs || [{ id: 'default-tab', title: 'New Chat', sessionId: null, projectId: null, personaId: 'default', pinned: false }];
  let activeTabId = plugin.settings?.activeTabId || tabs[0]?.id;
  let isVaultQAMode = plugin.settings?.isVaultQAMode || false;
  let historyOpen = false;

  // On mount: purge sessions older than 24h (keep those loaded in active tabs)
  onMount(() => {
    const cutoff = Date.now() - TWENTY_FOUR_HOURS;
    const activeSessionIds = new Set(tabs.map((t: any) => t.sessionId).filter(Boolean));
    const before = plugin.settings.sessions?.length || 0;
    plugin.settings.sessions = (plugin.settings.sessions || []).filter(
      (s: any) => s.updatedAt >= cutoff || activeSessionIds.has(s.id)
    );
    const purged = before - (plugin.settings.sessions?.length || 0);
    if (purged > 0) {
      plugin.saveSettings();
      console.log(`AI Copilot: purged ${purged} sessions older than 24h`);
    }
  });

  // Tab rename state
  let renamingTabId: string | null = null;
  let renameValue = '';

  // We need to keep references to the ChatView instances to pass external events
  let tabRefs: Record<string, ChatView> = {};

  $: {
     if (plugin.settings) {
        plugin.settings.tabs = tabs;
        plugin.settings.activeTabId = activeTabId;
        plugin.saveSettings();
     }
  }

  // Global sessions list — only last 24h
  $: sessionsList = (plugin.settings?.sessions || []).filter(
    (s: any) => s.updatedAt >= Date.now() - TWENTY_FOUR_HOURS
  );
  $: activeTab = tabs.find((t: any) => t.id === activeTabId);
  $: currentSessionId = activeTab?.sessionId || '';

  // Sort tabs: pinned first, then unpinned
  $: sortedTabs = [...tabs].sort((a: any, b: any) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return 0;
  });

  // Public methods to expose to AIChatView
  export function addSelectionContext(text: string, filePath: string) {
    if (tabRefs[activeTabId]) {
      tabRefs[activeTabId].addSelectionContext(text, filePath);
    }
  }
  export function addFileContext(filePath: string, fileName: string) {
    if (tabRefs[activeTabId]) {
      tabRefs[activeTabId].addFileContext(filePath, fileName);
    }
  }
  export function addFolderContext(folderPath: string, folderName: string) {
    if (tabRefs[activeTabId]) {
      tabRefs[activeTabId].addFolderContext(folderPath, folderName);
    }
  }
  export function focusChatInput() {
    if (tabRefs[activeTabId]) {
      tabRefs[activeTabId].focusChatInput();
    }
  }

  function createTab() {
    const currentTab = tabs.find((t: any) => t.id === activeTabId);
    const id = crypto.randomUUID();
    tabs = [...tabs, {
      id,
      title: 'New Chat',
      sessionId: null,
      projectId: currentTab?.projectId || null,
      personaId: currentTab?.personaId || 'default',
      pinned: false
    }];
    activeTabId = id;
  }

  function closeTab(id: string, e: MouseEvent) {
    e.stopPropagation();
    const tab = tabs.find((t: any) => t.id === id);
    if (tab?.pinned) return; // can't close pinned tabs

    if (tabs.length === 1) {
       tabs = [{ id: crypto.randomUUID(), title: 'New Chat', sessionId: null, projectId: null, personaId: 'default', pinned: false }];
       activeTabId = tabs[0].id;
       return;
    }

    const idx = tabs.findIndex((t: any) => t.id === id);
    tabs = tabs.filter((t: any) => t.id !== id);
    delete tabRefs[id];
    tabRefs = tabRefs;

    if (activeTabId === id) {
       activeTabId = tabs[Math.max(0, idx - 1)]?.id;
    }
  }

  function togglePin(id: string, e: MouseEvent) {
    e.stopPropagation();
    const tabIndex = tabs.findIndex((t: any) => t.id === id);
    if (tabIndex !== -1) {
      tabs[tabIndex].pinned = !tabs[tabIndex].pinned;
      tabs = [...tabs];
    }
  }

  function startRename(tabId: string) {
    const tab = tabs.find((t: any) => t.id === tabId);
    if (tab) {
      renamingTabId = tabId;
      renameValue = tab.title;
    }
  }

  function commitRename() {
    if (renamingTabId) {
      const tabIndex = tabs.findIndex((t: any) => t.id === renamingTabId);
      if (tabIndex !== -1 && renameValue.trim()) {
        const newTitle = renameValue.trim();
        tabs[tabIndex].title = newTitle;
        // Sync title to the underlying session record
        const sid = tabs[tabIndex].sessionId;
        if (sid) {
          const session = plugin.settings.sessions?.find((s: any) => s.id === sid);
          if (session) {
            session.title = newTitle;
            plugin.saveSettings();
          }
        }
        tabs = [...tabs];
      }
      renamingTabId = null;
      renameValue = '';
    }
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      commitRename();
    } else if (e.key === 'Escape') {
      renamingTabId = null;
      renameValue = '';
    }
  }

  function handleTitleChange(tabId: string, event: CustomEvent<string>) {
     const tabIndex = tabs.findIndex((t: any) => t.id === tabId);
     if (tabIndex !== -1) {
        tabs[tabIndex].title = event.detail;
        tabs = [...tabs];
     }
  }

  function handleSessionChange(tabId: string, event: CustomEvent<string>) {
     const tabIndex = tabs.findIndex((t: any) => t.id === tabId);
     if (tabIndex !== -1) {
        tabs[tabIndex].sessionId = event.detail;
        tabs = [...tabs];
     }
  }

  function handleProjectChange(tabId: string, event: CustomEvent<string | null>) {
     const tabIndex = tabs.findIndex((t: any) => t.id === tabId);
     if (tabIndex !== -1) {
        tabs[tabIndex].projectId = event.detail;
        tabs = [...tabs];
     }
  }

  function handlePersonaChange(tabId: string, event: CustomEvent<string>) {
     const tabIndex = tabs.findIndex((t: any) => t.id === tabId);
     if (tabIndex !== -1) {
        tabs[tabIndex].personaId = event.detail;
        tabs = [...tabs];
     }
  }

  function handleHistorySelect(event: CustomEvent<string>) {
     const sessionId = event.detail;
     const tabIndex = tabs.findIndex((t: any) => t.id === activeTabId);
     if (tabIndex !== -1) {
        tabs[tabIndex].sessionId = sessionId;
        const session = plugin.settings.sessions.find((s: any) => s.id === sessionId);
        if (session) {
          tabs[tabIndex].title = session.title || 'Chat';
        }
        tabs = [...tabs];
     }
  }

  function handleHistoryDelete(event: CustomEvent<string>) {
     const idToDelete = event.detail;
     plugin.settings.sessions = plugin.settings.sessions.filter((s: any) => s.id !== idToDelete);
     plugin.saveSettings();
     plugin.settings = { ...plugin.settings };

     const tabIndex = tabs.findIndex((t: any) => t.id === activeTabId);
     if (tabIndex !== -1 && tabs[tabIndex].sessionId === idToDelete) {
        tabs[tabIndex].sessionId = null;
        tabs[tabIndex].title = 'New Chat';
        tabs = [...tabs];
     }
  }

  function openSettings() {
    // Open Obsidian settings pane directly to this plugin
    const app = plugin.app;
    const setting = (app as any).setting;
    if (setting) {
      setting.open();
      setting.openTabById(plugin.manifest.id);
    }
  }
</script>

<div class="chat-app-container">
  <div class="app-header">
    <div class="title-bar">
      <div class="title">
        AI Copilot
      </div>
      <div class="global-controls">
        <button
          class="header-btn"
          on:click={() => historyOpen = !historyOpen}
          title="Chat History"
          aria-label="Chat History"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>
        </button>
        <button
          class="header-btn"
          on:click={openSettings}
          title="Settings"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </div>
    </div>

    <div class="tab-bar">
       {#each sortedTabs as tab (tab.id)}
         <!-- svelte-ignore a11y_click_events_have_key_events -->
         <!-- svelte-ignore a11y_no_static_element_interactions -->
         <div
           class="tab {activeTabId === tab.id ? 'active' : ''} {tab.pinned ? 'pinned' : ''}"
           on:click={() => activeTabId = tab.id}
           on:dblclick={() => startRename(tab.id)}
           on:contextmenu|preventDefault={(e) => togglePin(tab.id, e)}
           title={tab.pinned ? '📌 ' + tab.title + ' (right-click to unpin)' : tab.title + ' (right-click to pin, double-click to rename)'}
         >
            {#if renamingTabId === tab.id}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                class="tab-rename-input"
                bind:value={renameValue}
                on:blur={commitRename}
                on:keydown={handleRenameKeydown}
                autofocus
              />
            {:else}
              {#if tab.pinned}<span class="pin-icon">📌</span>{/if}
              <span class="tab-title">{tab.title}</span>
            {/if}
            {#if !tab.pinned}
              <button class="tab-close" on:click={(e) => closeTab(tab.id, e)} aria-label="Close tab">✕</button>
            {/if}
         </div>
       {/each}
       <button class="new-tab-btn" on:click={createTab} title="New Tab" aria-label="New Tab">+</button>
    </div>
  </div>

  <div class="tabs-content">
    {#each tabs as tab (tab.id)}
      <div class="tab-container" style="display: {activeTabId === tab.id ? 'flex' : 'none'};">
         <ChatView
            {plugin}
            {isVaultQAMode}
            sessionId={tab.sessionId}
            projectId={tab.projectId}
            personaId={tab.personaId}
            bind:this={tabRefs[tab.id]}
            on:titleChange={(e) => handleTitleChange(tab.id, e)}
            on:sessionChange={(e) => handleSessionChange(tab.id, e)}
            on:projectChange={(e) => handleProjectChange(tab.id, e)}
            on:personaChange={(e) => handlePersonaChange(tab.id, e)}
         />
      </div>
    {/each}

    <SessionHistory
      sessions={sessionsList}
      {currentSessionId}
      bind:isOpen={historyOpen}
      on:select={handleHistorySelect}
      on:delete={handleHistoryDelete}
    />
  </div>
</div>

<style>
  .chat-app-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background-primary);
  }

  .app-header {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .title-bar {
    padding: 4px 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title {
    font-weight: 600;
    font-size: var(--font-ui-small);
    color: var(--text-normal);
  }

  .global-controls {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .header-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .header-btn:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  /* ─── Tab Bar ─── */
  .tab-bar {
    display: flex;
    align-items: center;
    background-color: var(--background-secondary);
    padding: 0 6px;
    overflow-x: auto;
    scrollbar-width: none;
    gap: 1px;
  }
  .tab-bar::-webkit-scrollbar {
    display: none;
  }

  .tab {
    display: flex;
    align-items: center;
    padding: 3px 8px;
    background-color: transparent;
    border-radius: 4px 4px 0 0;
    cursor: pointer;
    font-size: 11px;
    color: var(--text-muted);
    max-width: 140px;
    min-width: 40px;
    transition: background-color 0.12s, color 0.12s;
    line-height: 1.3;
    gap: 3px;
    flex-shrink: 0;
  }

  .tab:hover {
    background-color: var(--background-modifier-hover);
    color: var(--text-normal);
  }

  .tab.active {
    background-color: var(--background-primary);
    color: var(--text-normal);
    font-weight: 500;
  }

  .tab.pinned {
    min-width: unset;
    max-width: 100px;
  }

  .pin-icon {
    font-size: 9px;
    flex-shrink: 0;
  }

  .tab-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-grow: 1;
  }

  .tab-rename-input {
    background: var(--background-primary);
    border: 1px solid var(--interactive-accent);
    border-radius: 2px;
    color: var(--text-normal);
    font-size: 11px;
    padding: 1px 4px;
    width: 80px;
    outline: none;
  }

  .tab-close {
    background: transparent;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 0 2px;
    font-size: 10px;
    line-height: 1;
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.12s, color 0.12s;
    flex-shrink: 0;
  }
  .tab:hover .tab-close {
    opacity: 1;
  }
  .tab-close:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  .new-tab-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 3px 6px;
    font-size: 14px;
    font-weight: 300;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s;
    flex-shrink: 0;
  }
  .new-tab-btn:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  /* ─── Content area ─── */
  .tabs-content {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .tab-container {
    height: 100%;
    width: 100%;
    flex-direction: column;
  }
</style>
