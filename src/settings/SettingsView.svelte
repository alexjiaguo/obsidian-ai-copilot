<script lang="ts">
  import { onMount } from "svelte";
  import type {
    AICopilotSettings,
    ProviderType,
    Persona,
    CustomAction,
    MCPServerConfig,
    SkillConfig,
  } from "./Settings";
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
  let editingCustomActionId: string | null = null;
  let editingProjectId: string | null = null;
  let editingMcpServerId: string | null = null;

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

  function addCustomAction() {
    // Ensure array exists to prevent issues with older settings profiles
    if (!settings.customActions) settings.customActions = [];
    const newAction: CustomAction = {
      id: generateId(),
      name: "New Action",
      promptTemplate: "Summarize this exactly as following:\n\n{{selection}}",
    };
    settings.customActions = [...settings.customActions, newAction];
    editingCustomActionId = newAction.id;
    saveSettings();
  }

  function deleteCustomAction(id: string) {
    settings.customActions = settings.customActions.filter((a) => a.id !== id);
    if (editingCustomActionId === id) editingCustomActionId = null;
    saveSettings();
  }

  function selectCustomAction(id: string) {
    editingCustomActionId = editingCustomActionId === id ? null : id;
  }

  function addProject() {
    if (!settings.projects) settings.projects = [];
    const newProject: any = {
      id: generateId(),
      name: "New Project",
      description: "",
      includeFolders: "",
      excludeFolders: "",
      includeTags: "",
      systemPrompt: "",
      defaultModel: "",
    };
    settings.projects = [...settings.projects, newProject];
    editingProjectId = newProject.id;
    saveSettings();
  }

  function deleteProject(id: string) {
    if (!settings.projects) return;
    settings.projects = settings.projects.filter((p) => p.id !== id);
    if (editingProjectId === id) editingProjectId = null;
    if (settings.activeProjectId === id) settings.activeProjectId = null;
    saveSettings();
  }

  function selectProject(id: string) {
    editingProjectId = editingProjectId === id ? null : id;
  }

  function addMcpServer() {
    if (!settings.mcpServers) settings.mcpServers = [];
    const newServer: MCPServerConfig = {
      id: generateId(),
      name: "New MCP Server",
      command: "npx",
      args: [],
      env: {},
      enabled: true,
    };
    settings.mcpServers = [...settings.mcpServers, newServer];
    editingMcpServerId = newServer.id;
    saveSettings();
    plugin.reconnectMCPServers();
  }

  function deleteMcpServer(id: string) {
    settings.mcpServers = settings.mcpServers.filter((s) => s.id !== id);
    if (editingMcpServerId === id) editingMcpServerId = null;
    saveSettings();
    plugin.reconnectMCPServers();
  }

  function selectMcpServer(id: string) {
    editingMcpServerId = editingMcpServerId === id ? null : id;
  }

  function toggleMcpServer(id: string) {
    const server = settings.mcpServers.find((s) => s.id === id);
    if (server) {
      server.enabled = !server.enabled;
      settings.mcpServers = settings.mcpServers;
      saveSettings();
      plugin.reconnectMCPServers();
    }
  }

  // Helpers for arg arrays
  function getArgsString(args: string[]): string {
    return args ? args.join(" ") : "";
  }
  function setArgsString(server: MCPServerConfig, str: string) {
    // Simple split by space. For paths with spaces, it might break,
    // but good enough for typical npx commands.
    server.args = str.split(" ").filter(Boolean);
    handleChange();
  }

  // Helpers for env vars
  function getEnvString(env: Record<string, string>): string {
    if (!env) return "";
    return Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
  }
  function setEnvString(server: MCPServerConfig, str: string) {
    const env: Record<string, string> = {};
    str
      .split("\n")
      .filter(Boolean)
      .forEach((line) => {
        const idx = line.indexOf("=");
        if (idx > 0) {
          const k = line.substring(0, idx).trim();
          const v = line.substring(idx + 1).trim();
          if (k) env[k] = v;
        }
      });
    server.env = env;
    handleChange();
  }

  $: currentModels = PROVIDER_MODELS[settings.provider as ProviderType] ?? [];
  $: currentProviderLabel =
    PROVIDER_LABELS[settings.provider as ProviderType] ?? settings.provider;

  // ── Skill Management ──
  let discoveredSkills: {
    name: string;
    description: string;
    folderPath: string;
  }[] = [];
  let skillsLoading = false;
  let skillsExpanded = false;
  let skillSearchQuery = "";

  $: filteredSkills = skillSearchQuery
    ? discoveredSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(skillSearchQuery.toLowerCase()) ||
          s.description.toLowerCase().includes(skillSearchQuery.toLowerCase()),
      )
    : discoveredSkills;

  onMount(async () => {
    try {
      await refreshSkills();
    } catch (e) {
      console.error("SettingsView onMount error:", e);
    }
  });

  async function refreshSkills() {
    if (!plugin?.skillService) return;
    skillsLoading = true;
    try {
      await plugin.skillService.loadIndex();
      discoveredSkills = plugin.skillService.getIndex().map((s: any) => ({
        name: s.name,
        description: s.description,
        folderPath: s.folderPath,
      }));
      // Sync: ensure every discovered skill has a config entry
      if (!settings.skillConfigs) settings.skillConfigs = [];
      for (const skill of discoveredSkills) {
        const existing = settings.skillConfigs.find(
          (c: SkillConfig) => c.folderPath === skill.folderPath,
        );
        if (!existing) {
          settings.skillConfigs = [
            ...settings.skillConfigs,
            {
              name: skill.name,
              folderPath: skill.folderPath,
              enabled: true,
              mandatory: false,
            },
          ];
        }
      }
      // Remove configs for skills that no longer exist on disk
      const discoveredPaths = new Set(
        discoveredSkills.map((s) => s.folderPath),
      );
      settings.skillConfigs = settings.skillConfigs.filter((c: SkillConfig) =>
        discoveredPaths.has(c.folderPath),
      );
      await saveSettings();
    } catch (e) {
      console.error("Failed to load skills:", e);
    } finally {
      skillsLoading = false;
    }
  }

  function getSkillConfig(folderPath: string): SkillConfig | undefined {
    return settings.skillConfigs?.find(
      (c: SkillConfig) => c.folderPath === folderPath,
    );
  }

  function toggleSkillEnabled(folderPath: string) {
    const cfg = settings.skillConfigs?.find(
      (c: SkillConfig) => c.folderPath === folderPath,
    );
    if (cfg) {
      cfg.enabled = !cfg.enabled;
      if (!cfg.enabled) cfg.mandatory = false; // disable mandatory when skill disabled
      settings.skillConfigs = [...settings.skillConfigs];
      saveSettings();
    }
  }

  function toggleSkillMandatory(folderPath: string) {
    const cfg = settings.skillConfigs?.find(
      (c: SkillConfig) => c.folderPath === folderPath,
    );
    if (cfg && cfg.enabled) {
      cfg.mandatory = !cfg.mandatory;
      settings.skillConfigs = [...settings.skillConfigs];
      saveSettings();
    }
  }
</script>

<div class="settings-padding-wrapper">
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
        Choose a model from {currentProviderLabel}
      </div>
    </div>
    <div class="setting-item-control">
      <select bind:value={settings.model} on:change={onModelChange}>
        {#each currentModels as m}
          <option value={m}>{m}</option>
        {/each}
        {#if !currentModels.includes(settings.model) && settings.model}
          <option value={settings.model}>{settings.model} (custom)</option>
        {/if}
      </select>
      <input
        type="text"
        bind:value={settings.model}
        on:change={handleChange}
        placeholder="or type custom model name"
      />
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

  <!-- Auto-Apply Edits -->
  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Auto-Apply Edits</div>
      <div class="setting-item-description">Apply AI edits directly without manual approval.</div>
    </div>
    <div class="setting-item-control">
      <input
        type="checkbox"
        bind:checked={settings.autoApplyEdits}
        on:change={handleChange}
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

  <!-- ── Vault QA & Embeddings ── -->
  <div class="setting-section-title">Vault QA & Embeddings</div>
  <div class="setting-description">
    Configure vector search settings for querying your notes.
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Embedding Provider</div>
      <div class="setting-item-description">
        Provider used to generate text embeddings
      </div>
    </div>
    <div class="setting-item-control">
      <select bind:value={settings.embeddingProvider} on:change={handleChange}>
        <option value="openai">OpenAI</option>
        <option value="ollama">Ollama (Local)</option>
      </select>
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Embedding Model</div>
      <div class="setting-item-description">
        Model name for embeddings (e.g., text-embedding-3-small,
        mxbai-embed-large)
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="text"
        bind:value={settings.embeddingModel}
        on:change={handleChange}
        placeholder="text-embedding-3-small"
      />
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Auto-Index Vault</div>
      <div class="setting-item-description">
        Automatically index notes on startup or change
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="checkbox"
        bind:checked={settings.autoIndexVault}
        on:change={handleChange}
      />
    </div>
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Index Exclusions</div>
      <div class="setting-item-description">
        Comma-separated list of folders or paths to exclude from indexing
      </div>
    </div>
    <div class="setting-item-control">
      <input
        type="text"
        bind:value={settings.indexExclusions}
        on:change={handleChange}
        placeholder="node_modules, .git, templates"
      />
    </div>
  </div>

  <!-- ── Projects ── -->
  <div class="setting-section-title">Projects</div>
  <div class="setting-description">
    Define scoped contexts. Manage project-level folders, tags, and system
    prompts.
  </div>

  <div class="personas-container">
    {#each settings.projects || [] as project (project.id)}
      <div
        class="persona-card {editingProjectId === project.id ? 'active' : ''}"
      >
        <div class="persona-header" on:click={() => selectProject(project.id)}>
          <div class="persona-name">
            <span class="name-text">{project.name}</span>
            {#if settings.activeProjectId === project.id}
              <span class="default-badge">Active</span>
            {/if}
          </div>
          <div class="persona-actions">
            {#if settings.activeProjectId !== project.id}
              <button
                class="icon-btn"
                on:click|stopPropagation={() => {
                  settings.activeProjectId = project.id;
                  saveSettings();
                }}
                title="Make Active">⭐</button
              >
            {:else}
              <button
                class="icon-btn"
                on:click|stopPropagation={() => {
                  settings.activeProjectId = null;
                  saveSettings();
                }}
                title="Deactivate">❌</button
              >
            {/if}
            <button
              class="icon-btn"
              on:click|stopPropagation={() => deleteProject(project.id)}
              title="Delete">🗑️</button
            >
            <span class="chevron"
              >{editingProjectId === project.id ? "▼" : "▶"}</span
            >
          </div>
        </div>

        {#if editingProjectId === project.id}
          <div class="persona-editor">
            <div class="form-group">
              <label>Project Name</label>
              <input
                type="text"
                bind:value={project.name}
                on:change={handleChange}
              />
            </div>
            <div class="form-group">
              <label>Description</label>
              <input
                type="text"
                bind:value={project.description}
                on:change={handleChange}
              />
            </div>
            <div class="form-group">
              <label>Include Folders (Comma separated paths)</label>
              <input
                type="text"
                bind:value={project.includeFolders}
                on:change={handleChange}
                placeholder="e.g. Work/ProjectA, Notes/Meetings"
              />
            </div>
            <div class="form-group">
              <label>Include Tags (Comma separated)</label>
              <input
                type="text"
                bind:value={project.includeTags}
                on:change={handleChange}
                placeholder="e.g. #projectA, #urgent"
              />
            </div>
            <div class="form-group">
              <label>Override System Prompt</label>
              <textarea
                bind:value={project.systemPrompt}
                on:change={handleChange}
                rows="4"
                placeholder="Optional. Leaves blank to use default persona."
              ></textarea>
            </div>
            <div class="form-group">
              <label>Override Model</label>
              <input
                type="text"
                bind:value={project.defaultModel}
                on:change={handleChange}
                placeholder="Optional (e.g. gpt-5-mini)"
              />
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <button class="add-btn" on:click={addProject}>+ Add New Project</button>
  </div>

  <!-- ── Personas ── -->
  <div class="setting-section-title">Personas</div>
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

  <!-- ── Custom Actions ── -->
  <div class="setting-section-title">Custom Actions</div>
  <div class="setting-description">
    Create custom commands that operate on your selected text. Use <code
      >{`{{selection}}`}</code
    > in your prompt to refer to the highlighted text. They will appear in the Obsidian
    Command Palette. Let the prompt guide the behavior.
  </div>

  <div class="personas-container">
    {#each settings.customActions || [] as action (action.id)}
      <div
        class="persona-card {editingCustomActionId === action.id
          ? 'active'
          : ''}"
      >
        <div
          class="persona-header"
          on:click={() => selectCustomAction(action.id)}
        >
          <div class="persona-name">
            <span class="name-text">{action.name}</span>
          </div>
          <div class="persona-actions">
            <button
              class="icon-btn"
              on:click|stopPropagation={() => deleteCustomAction(action.id)}
              title="Delete">🗑️</button
            >
            <span class="chevron"
              >{editingCustomActionId === action.id ? "▼" : "▶"}</span
            >
          </div>
        </div>

        {#if editingCustomActionId === action.id}
          <div class="persona-editor">
            <div class="form-group">
              <label>Command Name</label>
              <input
                type="text"
                bind:value={action.name}
                on:change={handleChange}
                placeholder="e.g. Expand, Translate to French"
              />
            </div>
            <div class="form-group">
              <label>Prompt Template</label>
              <textarea
                bind:value={action.promptTemplate}
                on:change={handleChange}
                rows="6"
                placeholder="Translate the following text into French:\n\n{`{{selection}}`}"
              ></textarea>
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <button class="add-btn" on:click={addCustomAction}
      >+ Add Custom Action</button
    >
  </div>

  <!-- ── MCP Servers ── -->
  <div class="setting-section-title">MCP Servers</div>
  <div class="setting-description">
    Connect to local Model Context Protocol (MCP) servers to give the AI access
    to external data and tools.
  </div>

  <div class="personas-container">
    {#each settings.mcpServers || [] as server (server.id)}
      <div
        class="persona-card {editingMcpServerId === server.id ? 'active' : ''}"
      >
        <div class="persona-header" on:click={() => selectMcpServer(server.id)}>
          <div class="persona-name">
            <span class="name-text">{server.name}</span>
            {#if !server.enabled}
              <span class="default-badge" style="background: var(--text-muted);"
                >Disabled</span
              >
            {:else}
              <span class="default-badge" style="background: #22c55e;"
                >Active</span
              >
            {/if}
          </div>
          <div class="persona-actions">
            <button
              class="icon-btn"
              on:click|stopPropagation={() => toggleMcpServer(server.id)}
              title={server.enabled ? "Disable Server" : "Enable Server"}
            >
              {server.enabled ? "🔌" : "🔌"}
            </button>
            <button
              class="icon-btn"
              on:click|stopPropagation={() => deleteMcpServer(server.id)}
              title="Delete">🗑️</button
            >
            <span class="chevron">
              {editingMcpServerId === server.id ? "▼" : "▶"}
            </span>
          </div>
        </div>

        {#if editingMcpServerId === server.id}
          <div class="persona-editor">
            <div class="form-group">
              <label>Name</label>
              <input
                type="text"
                bind:value={server.name}
                on:change={handleChange}
                placeholder="e.g. Postgres Database"
              />
            </div>
            <div class="form-group">
              <label>Command</label>
              <input
                type="text"
                bind:value={server.command}
                on:change={handleChange}
                placeholder="e.g. npx, node, python"
              />
            </div>
            <div class="form-group">
              <label>Arguments (Space separated)</label>
              <input
                type="text"
                value={getArgsString(server.args)}
                on:change={(e) => setArgsString(server, e.currentTarget.value)}
                placeholder="-y @modelcontextprotocol/server-postgres postgresql://localhost/mydb"
              />
            </div>
            <div class="form-group">
              <label>Environment Variables (KEY=VALUE, one per line)</label>
              <textarea
                value={getEnvString(server.env)}
                on:change={(e) => setEnvString(server, e.currentTarget.value)}
                rows="3"
                placeholder="API_KEY=your_secret_key"
              ></textarea>
            </div>
            <div class="form-group">
              <label>Working Directory (optional)</label>
              <input
                type="text"
                bind:value={server.cwd}
                on:change={handleChange}
                placeholder="e.g. /Users/you/.mcp/my-server"
              />
            </div>
          </div>
        {/if}
      </div>
    {/each}

    <button class="add-btn" on:click={addMcpServer}>+ Add MCP Server</button>
  </div>

  <!-- ── Skills Management ── -->
  <div class="setting-section-title">Skills</div>
  <div class="setting-description">
    Manage AI skills discovered from your skills folder. Enable or disable
    individual skills, and mark skills as mandatory to ensure they are always
    consulted first.
  </div>

  <div class="setting-item">
    <div class="setting-item-info">
      <div class="setting-item-name">Skills Path</div>
      <div class="setting-item-description">
        Absolute path to the folder containing skill subfolders (each with a
        SKILL.md)
      </div>
    </div>
    <div
      class="setting-item-control"
      style="display:flex; gap:6px; align-items:flex-start;"
    >
      <input
        type="text"
        bind:value={settings.skillsPath}
        on:change={handleChange}
        placeholder="/path/to/skills_hub"
        style="flex:1;"
      />
      <button
        class="test-btn"
        on:click={refreshSkills}
        disabled={skillsLoading}
        style="white-space:nowrap;"
      >
        {skillsLoading ? "Scanning…" : "🔄 Refresh"}
      </button>
    </div>
  </div>

  <!-- Collapsible skill list -->
  <div class="personas-container">
    <button
      class="add-btn"
      style="width:100%; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"
      on:click={() => (skillsExpanded = !skillsExpanded)}
    >
      <span
        >{skillsExpanded ? "▼" : "▶"} Skills ({discoveredSkills.length})</span
      >
      <span style="font-size:0.8em; color:var(--text-muted);">
        {settings.skillConfigs?.filter((c) => c.enabled).length ?? 0} enabled ·
        {settings.skillConfigs?.filter((c) => c.mandatory).length ?? 0} mandatory
      </span>
    </button>

    {#if skillsExpanded}
      {#if discoveredSkills.length > 5}
        <input
          type="text"
          bind:value={skillSearchQuery}
          placeholder="🔍 Search skills..."
          style="width:100%; margin-bottom:8px; padding:6px 10px; border-radius:6px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); font-size:0.9em;"
        />
      {/if}

      {#if filteredSkills.length === 0}
        <div style="color:var(--text-muted); font-size:0.9em; padding:8px 0;">
          {skillsLoading
            ? "Loading skills..."
            : skillSearchQuery
              ? "No skills match your search."
              : "No skills found. Check your skills path and click Refresh."}
        </div>
      {/if}

      {#each filteredSkills as skill (skill.folderPath)}
        {@const cfg = getSkillConfig(skill.folderPath)}
        <div class="persona-card">
          <div class="persona-header">
            <div class="persona-name" style="flex:1;">
              <span class="name-text">{skill.name}</span>
              {#if cfg?.enabled && cfg?.mandatory}
                <span class="default-badge" style="background:#f59e0b;"
                  >Mandatory</span
                >
              {/if}
              {#if cfg?.enabled}
                <span class="default-badge" style="background:#22c55e;"
                  >Enabled</span
                >
              {:else}
                <span
                  class="default-badge"
                  style="background:var(--text-muted);">Disabled</span
                >
              {/if}
            </div>
            <div class="persona-actions">
              <label
                class="skill-toggle"
                title={cfg?.enabled ? "Disable skill" : "Enable skill"}
              >
                <input
                  type="checkbox"
                  checked={cfg?.enabled}
                  on:change={() => toggleSkillEnabled(skill.folderPath)}
                />
              </label>
              {#if cfg?.enabled}
                <button
                  class="icon-btn"
                  on:click|stopPropagation={() =>
                    toggleSkillMandatory(skill.folderPath)}
                  title={cfg?.mandatory ? "Remove mandatory" : "Make mandatory"}
                  style={cfg?.mandatory ? "opacity:1;" : ""}
                >
                  {cfg?.mandatory ? "⭐" : "☆"}
                </button>
              {/if}
            </div>
          </div>
          <div
            style="padding:4px 15px 10px; color:var(--text-muted); font-size:0.85em;"
          >
            {skill.description}
          </div>
        </div>
      {/each}
    {/if}
  </div>
  </div>
</div>

<style>
  .settings-padding-wrapper {
    padding: 16px 20px 32px;
    margin: 0 auto;
    box-sizing: border-box;
    width: 100%;
  }
  
  .settings-view {
    box-sizing: border-box;
    max-width: var(--settings-max-width, 100%);
    margin: 0 auto;
  }

  /* ── Section Titles ── */
  .setting-section-title {
    font-size: 1.05em;
    font-weight: 700;
    color: var(--text-normal);
    margin: 24px 0 4px;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--interactive-accent);
  }
  .setting-section-title:first-child {
    margin-top: 0;
  }

  .setting-description {
    color: var(--text-muted);
    margin-bottom: 10px;
    font-size: 0.85em;
    line-height: 1.5;
  }

  /* ── Setting Rows ── */
  .setting-item {
    border-top: 1px solid var(--background-modifier-border);
    padding: 10px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .setting-item:first-of-type {
    border-top: none;
  }

  .setting-item-info {
    flex: 1;
    min-width: 0;
  }

  .setting-item-name {
    font-size: 0.9em;
    font-weight: 600;
    color: var(--text-normal);
    line-height: 1.3;
  }

  .setting-item-description {
    color: var(--text-muted);
    font-size: 0.8em;
    line-height: 1.4;
    margin-top: 2px;
  }

  /* ── Controls (right side) ── */
  .setting-item-control {
    flex-shrink: 0;
    width: 320px;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .setting-item-control select,
  .setting-item-control input[type="text"],
  .setting-item-control input[type="password"] {
    width: 320px;
    max-width: 320px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 0.85em;
    box-sizing: border-box;
    transition: border-color 0.15s;
    align-self: flex-end;
  }

  .setting-item-control input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: var(--interactive-accent);
    align-self: flex-end;
  }

  .setting-item-control select:focus,
  .setting-item-control input:focus {
    outline: none;
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb, 0, 122, 255), 0.15);
  }

  /* ── Test Connection ── */
  .test-control {
    align-items: flex-end;
  }

  .test-btn {
    padding: 5px 14px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 500;
    transition: background-color 0.15s;
  }
  .test-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }
  .test-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-result {
    margin-top: 6px;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 0.8em;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    word-break: break-word;
    max-width: 320px;
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

  /* ── Cards (Projects, Personas, Actions, MCP, Skills) ── */
  .personas-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 4px;
  }

  .persona-card {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s;
  }
  .persona-card.active {
    border-color: var(--interactive-accent);
  }

  .persona-header {
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    background: var(--background-primary);
    transition: background-color 0.1s;
  }
  .persona-header:hover {
    background: var(--background-secondary-alt);
  }

  .persona-name {
    font-weight: 600;
    font-size: 0.9em;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .default-badge {
    font-size: 0.65em;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .persona-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    font-size: 1em;
    padding: 2px;
    transition: opacity 0.12s;
  }
  .icon-btn:hover {
    opacity: 1;
  }

  .chevron {
    font-size: 0.75em;
    color: var(--text-muted);
    margin-left: 2px;
  }

  /* ── Editors inside cards ── */
  .persona-editor {
    padding: 12px 14px;
    border-top: 1px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--background-primary-alt, var(--background-secondary));
  }

  .form-group {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }

  .form-group label {
    font-size: 0.8em;
    color: var(--text-muted);
    font-weight: 500;
    min-width: 100px;
    flex-shrink: 0;
    text-align: right;
  }

  .form-group input,
  .form-group textarea {
    flex: 1;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-normal);
    border-radius: 4px;
    padding: 5px 8px;
    box-sizing: border-box;
    font-size: 0.85em;
    transition: border-color 0.15s;
  }

  .form-group textarea {
    font-family: var(--font-monospace);
    font-size: 0.8em;
    resize: vertical;
    line-height: 1.5;
  }

  .form-group input:focus,
  .form-group textarea:focus {
    border-color: var(--interactive-accent);
    outline: none;
    box-shadow: 0 0 0 2px rgba(var(--interactive-accent-rgb, 0, 122, 255), 0.15);
  }

  /* Skill toggle */
  .skill-toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .skill-toggle input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--interactive-accent);
  }

  /* ── Add Button ── */
  .add-btn {
    margin-top: 6px;
    padding: 6px 14px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85em;
    font-weight: 500;
    align-self: flex-start;
    transition: background-color 0.15s;
  }
  .add-btn:hover {
    background: var(--interactive-accent-hover);
  }
</style>
