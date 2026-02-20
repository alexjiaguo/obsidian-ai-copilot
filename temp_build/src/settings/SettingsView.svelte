<script lang="ts">
  import { onMount } from "svelte";
  import type { AICopilotSettings, ProviderType, Persona } from "./Settings";
  import {
    PROVIDER_MODELS,
    PROVIDER_DEFAULT_URLS,
    PROVIDER_LABELS,
    ALL_PROVIDERS,
  } from "./Settings";
  import { Notice } from "obsidian";

  export let settings: AICopilotSettings;
  export let saveSettings: () => Promise<void>;
  export let plugin: any = null; // passed to test connectivity

  let testStatus: "idle" | "loading" | "ok" | "error" = "idle";
  let testMessage = "";

  let editingPersonaId: string | null = null;

  // When provider changes, auto-update baseUrl and reset model
  function onProviderChange() {
    settings.baseUrl =
      PROVIDER_DEFAULT_URLS[settings.provider as ProviderType] ?? "";
    const models = PROVIDER_MODELS[settings.provider as ProviderType] ?? [];
    if (!models.includes(settings.model)) {
      settings.model = models[0] ?? "";
    }
    saveSettings();
  }

  function onModelChange() {
    saveSettings();
  }

  async function handleChange() {
    await saveSettings();
  }

  async function testConnection() {
    testStatus = "loading";
    testMessage = "Testing connection...";
    try {
      const { OpenAIProvider } = await import("../services/APIService");
      const provider = new OpenAIProvider(settings);
      const result = await provider.testConnection();
      testStatus = result.ok ? "ok" : "error";
      testMessage = result.message;
    } catch (e: any) {
      testStatus = "error";
      testMessage = e.message;
    }
  }

  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  function addPersona() {
    const newPersona: Persona = {
      id: generateId(),
      name: "New Persona",
      description: "",
      prompt: "You are a helpful assistant.",
    };
    settings.personas = [...settings.personas, newPersona];
    editingPersonaId = newPersona.id;
    saveSettings();
  }

  function deletePersona(id: string) {
    settings.personas = settings.personas.filter((p) => p.id !== id);
    if (editingPersonaId === id) editingPersonaId = null;
    if (settings.defaultPersonaId === id && settings.personas.length > 0) {
      settings.defaultPersonaId = settings.personas[0].id;
    }
    saveSettings();
  }

  function selectPersona(id: string) {
    editingPersonaId = editingPersonaId === id ? null : id;
  }

  function setDefault(id: string) {
    settings.defaultPersonaId = id;
    const p = settings.personas.find((p) => p.id === id);
    if (p) settings.systemPrompt = p.prompt;
    saveSettings();
  }

  $: currentModels = PROVIDER_MODELS[settings.provider as ProviderType] ?? [];
</script>

<div class="settings-view">
  <!-- ── Model Configuration ── -->
  <div class="setting-section-title">Model Configuration</div>

  <!-- Provider -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">AI Provider</div>
      <div class="setting-item-description">Select your AI provider</div>
    </div>
    <div class="setting-item-control">
      <select bind:value={settings.provider} on:change={onProviderChange}>
        {#each ALL_PROVIDERS as p}
          <option value={p}>{PROVIDER_LABELS[p]}</option>
        {/each}
      </select>
    </div>
  </div>

  <!-- Model -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Model</div>
      <div class="setting-item-description">
        Choose a model from {PROVIDER_LABELS[
          settings.provider as ProviderType
        ] ?? settings.provider}
      </div>
    </div>
    <div class="setting-item-control">
      <select bind:value={settings.model} on:change={onModelChange}>
        {#each currentModels as m}
          <option value={m}>{m}</option>
        {/each}
        <!-- Allow a custom value not in list -->
        {#if !currentModels.includes(settings.model) && settings.model}
          <option value={settings.model}>{settings.model} (custom)</option>
        {/if}
      </select>
      <!-- Custom model input for Ollama or edge cases -->
      {#if settings.provider === "ollama"}
        <input
          type="text"
          bind:value={settings.model}
          on:change={handleChange}
          placeholder="or type custom model name"
          style="margin-top: 6px; width: 100%;"
        />
      {/if}
    </div>
  </div>

  <!-- API Key -->
  {#if settings.provider !== "ollama"}
    <div class="setting-item">
      <div class="setting-item-info">
        <div class="setting-item-name">API Key</div>
        <div class="setting-item-description">Your secret API key</div>
      </div>
      <div class="setting-item-control">
        <input
          type="password"
          bind:value={settings.apiKey}
          on:change={handleChange}
          placeholder="sk-..."
        />
      </div>
    </div>
  {/if}

  <!-- Base URL -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Base URL</div>
      <div class="setting-item-description">
        API endpoint URL. Change for proxies or local models (Ollama).
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="text"
        bind:value={settings.baseUrl}
        on:change={handleChange}
        placeholder="https://api.openai.com/v1"
      />
    </div>
  </div>

  <!-- Test Connection -->
  <div class="setting-item test-row">
    <div class="setting-item-info">
      <div class="setting-item-name">Connection Test</div>
      <div class="setting-item-description">
        Verify your API key and endpoint are working.
      </div>
    </div>
    <div class="setting-item-control test-control">
      <button
        class="test-btn"
        class:loading={testStatus === "loading"}
        on:click={testConnection}
        disabled={testStatus === "loading"}
      >
        {testStatus === "loading" ? "Testing…" : "Test Connection"}
      </button>
      {#if testStatus !== "idle"}
        <div
          class="test-result"
          class:ok={testStatus === "ok"}
          class:error={testStatus === "error"}
        >
          {testStatus === "ok"
            ? "✅ "
            : testStatus === "error"
              ? "❌ "
              : ""}{testMessage}
        </div>
      {/if}
    </div>
  </div>

  <!-- ── Personas ── -->
  <div class="setting-section-title" style="margin-top:24px;">Personas</div>
  <div class="setting-description">
    Manage AI personalities and system prompts.
  </div>

  <div class="personas-container">
    {#each settings.personas as persona (persona.id)}
      <div
        class="persona-card {editingPersonaId === persona.id ? 'active' : ''}"
      >
        <div class="persona-header" on:click={() => selectPersona(persona.id)}>
          <div class="persona-name">
            <span class="name-text">{persona.name}</span>
            {#if settings.defaultPersonaId === persona.id}
              <span class="default-badge">Default</span>
            {/if}
          </div>
          <div class="persona-actions">
            {#if settings.defaultPersonaId !== persona.id}
              <button
                class="icon-btn"
                on:click|stopPropagation={() => setDefault(persona.id)}
                title="Set as Default">⭐</button
              >
            {/if}
            <button
              class="icon-btn"
              on:click|stopPropagation={() => deletePersona(persona.id)}
              title="Delete">🗑️</button
            >
            <span class="chevron"
              >{editingPersonaId === persona.id ? "▼" : "▶"}</span
            >
          </div>
        </div>

        {#if editingPersonaId === persona.id}
          <div class="persona-editor">
            <div class="form-group">
              <label>Name</label>
              <input
                type="text"
                bind:value={persona.name}
                on:change={handleChange}
              />
            </div>
            <div class="form-group">
              <label>Description</label>
              <input
                type="text"
                bind:value={persona.description}
                on:change={handleChange}
                placeholder="Optional description"
              />
            </div>
            <div class="form-group">
              <label>System Prompt</label>
              <textarea
                bind:value={persona.prompt}
                on:change={handleChange}
                rows="6"
              ></textarea>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <button class="add-btn" on:click={addPersona}>+ Add New Persona</button>
  </div>
</div>

<style>
  .settings-view {
    padding-top: 10px;
  }

  .setting-section-title {
    font-size: 1.1em;
    font-weight: 700;
    color: var(--text-normal);
    margin-bottom: 4px;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--interactive-accent);
  }

  .setting-description {
    color: var(--text-muted);
    margin-bottom: 12px;
    font-size: 0.9em;
  }

  .setting-item {
    border-top: 1px solid var(--background-modifier-border);
    padding: 14px 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
  }

  .setting-item:first-of-type {
    border-top: none;
  }

  .setting-item-info {
    flex: 1;
    min-width: 0;
  }

  .setting-item-name {
    font-size: var(--font-ui-medium);
    font-weight: 600;
    color: var(--text-normal);
  }

  .setting-item-description {
    color: var(--text-muted);
    font-size: var(--font-ui-small);
    line-height: 1.5;
    margin-top: 4px;
  }

  .setting-item-control {
    flex-shrink: 0;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-item-control select,
  .setting-item-control input[type="text"],
  .setting-item-control input[type="password"] {
    width: 100%;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    border-radius: 4px;
    padding: 6px 10px;
    font-size: var(--font-ui-small);
  }

  .setting-item-control select:focus,
  .setting-item-control input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  /* Test connection */
  .test-control {
    align-items: flex-start;
  }

  .test-btn {
    padding: 6px 16px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: var(--font-ui-small);
    transition: background-color 0.2s;
  }

  .test-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .test-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .test-result {
    margin-top: 8px;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: var(--font-ui-small);
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    word-break: break-word;
  }

  .test-result.ok {
    border-color: #22c55e;
    color: #16a34a;
    background: #f0fdf4;
  }

  .test-result.error {
    border-color: #ef4444;
    color: #dc2626;
    background: #fef2f2;
  }

  /* Personas */
  .personas-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .persona-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    overflow: hidden;
  }

  .persona-card.active {
    border-color: var(--interactive-accent);
  }

  .persona-header {
    padding: 10px 15px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    background: var(--background-primary);
  }

  .persona-header:hover {
    background: var(--background-secondary-alt);
  }

  .persona-name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .default-badge {
    font-size: 0.7em;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .persona-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.6;
    font-size: 1.1em;
    padding: 2px;
  }

  .icon-btn:hover {
    opacity: 1;
  }

  .persona-editor {
    padding: 15px;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label {
    font-size: 0.85em;
    color: var(--text-muted);
  }

  .form-group input,
  .form-group textarea {
    width: 100%;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    border-radius: 4px;
    padding: 8px;
    box-sizing: border-box;
  }

  textarea {
    font-family: var(--font-monospace);
    font-size: var(--font-ui-smaller);
    resize: vertical;
    line-height: 1.5;
  }

  textarea:focus,
  input:focus {
    border-color: var(--interactive-accent);
    outline: none;
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .add-btn {
    margin-top: 10px;
    padding: 8px 16px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    align-self: flex-start;
  }

  .add-btn:hover {
    background: var(--interactive-accent-hover);
  }
</style>
