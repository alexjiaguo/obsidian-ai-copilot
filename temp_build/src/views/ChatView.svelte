<script lang="ts">
  import { onMount, tick } from "svelte";
  import { MarkdownRenderer, Notice } from "obsidian";
  import ChatInput from "../components/ChatInput.svelte";
  import MessageBubble from "../components/MessageBubble.svelte";
  import ContextPill from "../components/ContextPill.svelte";
  import ModelSelector from "../components/ModelSelector.svelte";
  import PersonaSelector from "../components/PersonaSelector.svelte";
  import { DEFAULT_PERSONAS, PROVIDER_MODELS } from "../settings/Settings";
  import type {
    ProviderType,
    ChatSession,
    ChatMessage,
  } from "../settings/Settings";

  export let plugin: any;

  let query = "";
  let messages: ChatMessage[] = [];
  let isLoading = false;
  let activeContextFile: { path: string; content: string } | null = null;

  // Current Session State
  let currentSessionId: string = "";
  let selectedContext: {
    type: "file" | "folder" | "selection" | "image" | "heading";
    text: string;
    data?: any;
    path?: string;
    heading?: string;
    file?: any;
    content?: string; // for uploaded local files
  }[] = [];
  let currentModel = "gpt-4o-mini";
  let selectedPersonaId = "default";

  onMount(async () => {
    if (plugin.settings) {
      currentModel = plugin.settings.model || "gpt-4o-mini";
      selectedPersonaId = plugin.settings.defaultPersonaId || "default";

      // Load or Create Session
      if (plugin.settings.activeSessionId) {
        loadSession(plugin.settings.activeSessionId);
      } else {
        createNewSession();
      }
    }

    // Check for active file context periodically or on focus
    checkActiveFile();
    // Register event for active leaf change to update context immediately
    plugin.app.workspace.on("active-leaf-change", () => checkActiveFile());
  });

  async function checkActiveFile() {
    if (plugin.contextManager) {
      activeContextFile = await plugin.contextManager.getActiveFileContent();
    }
  }

  function loadSession(id: string) {
    const session = plugin.settings.sessions.find((s: any) => s.id === id);
    if (session) {
      currentSessionId = session.id;
      messages = session.messages;
      plugin.settings.activeSessionId = session.id;
      plugin.saveSettings();
    } else {
      createNewSession();
    }
  }

  function createNewSession() {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    plugin.settings.sessions.push(newSession);
    plugin.settings.activeSessionId = newSession.id;
    currentSessionId = newSession.id;
    messages = newSession.messages;
    plugin.saveSettings();
  }

  function updateSessionTitle(firstMessage: string) {
    const session = plugin.settings.sessions.find(
      (s: any) => s.id === currentSessionId,
    );
    if (session && session.title === "New Chat") {
      session.title =
        firstMessage.slice(0, 30) + (firstMessage.length > 30 ? "..." : "");
      plugin.saveSettings();
    }
  }

  function saveMessageToHistory(
    role: "user" | "assistant" | "error",
    content: string,
  ) {
    const session = plugin.settings.sessions.find(
      (s: any) => s.id === currentSessionId,
    );
    if (session) {
      session.messages.push({ role, content });
      session.updatedAt = Date.now();
      messages = session.messages; // Force reactivity
      plugin.saveSettings();
    }
  }

  // Reactive: models list from provider
  $: currentModels = plugin.settings
    ? (PROVIDER_MODELS[plugin.settings.provider as ProviderType] ?? [
        currentModel,
      ])
    : [currentModel];

  function handleModelChange(model: string) {
    currentModel = model;
    if (plugin.settings) {
      plugin.settings.model = model;
      plugin.saveSettings?.();
    }
  }

  // ... checkSelection ...

  async function handleSearch(query: string) {
    if (!plugin || !plugin.contextManager) return [];
    return plugin.contextManager.searchFiles(query);
  }

  function handleAddContext(item: any) {
    // Deduplicate by path
    if (item.path && selectedContext.some((c) => c.path === item.path)) return;

    // Raw Obsidian TFile from @mention suggestions (has .extension, .basename, .path but no .type)
    if (!item.type && item.path && item.basename !== undefined) {
      selectedContext = [
        ...selectedContext,
        {
          type: "file",
          text: item.basename || item.name || item.path,
          path: item.path,
        },
      ];
    } else if (item.type === "image") {
      selectedContext = [
        ...selectedContext,
        {
          type: "image",
          text: item.basename || item.path,
          path: item.path,
          data: item.data,
        },
      ];
    } else if (item.type === "file") {
      // Could be a vault file (has TFile props) or an uploaded local file (has content)
      const displayName = item.basename || item.path;
      selectedContext = [
        ...selectedContext,
        {
          type: "file",
          text: displayName,
          path: item.path,
          content: item.content, // for uploaded files
        },
      ];
    } else if (item.type === "heading") {
      selectedContext = [
        ...selectedContext,
        {
          type: "heading",
          text: `${item.file?.basename ?? item.path} > ${item.heading}`,
          path: item.path,
          heading: item.heading,
        },
      ];
    }
  }

  async function sendMessage() {
    if ((!query.trim() && selectedContext.length === 0) || isLoading) return;

    // Separate text and images
    const textContexts = selectedContext.filter((c) => c.type !== "image");
    const imageContexts = selectedContext.filter((c) => c.type === "image");

    let contextText = "";
    if (plugin.contextManager && textContexts.length > 0) {
      // Some items may have pre-loaded content (uploaded files), others need vault read
      const vaultContexts = textContexts.filter((c: any) => !c.content);
      const inlineContexts = textContexts.filter((c: any) => c.content);

      if (vaultContexts.length > 0) {
        contextText =
          await plugin.contextManager.resolveContexts(vaultContexts);
      }
      if (inlineContexts.length > 0) {
        contextText += inlineContexts
          .map((c: any) => `\n\n--- ${c.text} ---\n${c.content}`)
          .join("");
      }
    }

    const fullPromptText = `${contextText}\n\nUser Question: ${query}`;

    // Include Active File Context if available and not explicitly added
    let systemBase = "";
    if (
      activeContextFile &&
      !textContexts.some((c) => c.path === activeContextFile?.path)
    ) {
      systemBase += `\n\n=== CURRENT ACTIVE FILE (${activeContextFile.path}) ===\n${activeContextFile.content}\n==========================\n`;
    }

    // Update Display History immediately
    const displayContent =
      query +
      (imageContexts.length > 0
        ? `\n[Attached ${imageContexts.length} images]`
        : "");

    saveMessageToHistory("user", displayContent);

    // Update Title if it's the first message
    if (messages.length === 1) {
      updateSessionTitle(query);
    }

    query = "";
    isLoading = true;

    try {
      let currentMessages: any[] = [];

      // 0. System Prompt from Persona
      const persona =
        plugin.settings.personas.find((p: any) => p.id === selectedPersonaId) ||
        DEFAULT_PERSONAS[0];

      // Prepend file context to system prompt if it exists (so it persists across the chat turn)
      const finalSystemPrompt =
        persona.prompt + (systemBase ? `\n\nContext:\n${systemBase}` : "");

      currentMessages.push({ role: "system", content: finalSystemPrompt });

      // Construct Initial Message Payload
      if (imageContexts.length > 0) {
        const contentParts = [];
        if (fullPromptText.trim()) {
          contentParts.push({ type: "text", text: fullPromptText });
        }
        for (const img of imageContexts) {
          contentParts.push({
            type: "image_url",
            image_url: { url: img.data },
          });
        }
        currentMessages.push({ role: "user", content: contentParts });
      } else {
        currentMessages.push({ role: "user", content: fullPromptText });
      }

      // Tool Loop
      let steps = 0;
      const maxSteps = 10;
      let finalContent = "";

      // Get Tools
      const tools = plugin.toolManager
        ? plugin.toolManager.getToolsDefinition()
        : [];

      while (steps < maxSteps) {
        const response = await plugin.aiProvider.generateResponse(
          currentMessages,
          { model: currentModel },
          tools,
        );

        if (response.tool_calls && response.tool_calls.length > 0) {
          // 1. Add Assistant Message with tool calls
          currentMessages.push({
            role: "assistant",
            content: response.content || null,
            tool_calls: response.tool_calls,
          });

          // 2. Execute Tools
          for (const tool of response.tool_calls) {
            // Show "Thinking/Working" in UI (Temporary, don't save to history yet or maybe save as 'assistant' with tool usage?)
            // For now, we won't push these to persistent history to keep it clean, or we just push transiently to local variable
            // But to keep UI consistently updated with 'messages', we might need a separate 'displayMessages' derived state.
            // For simplicity in this MVP, we will NOT save tool intermediate steps to persistent history, just show them.
            messages = [
              ...messages,
              {
                role: "assistant",
                content: `🛠️ Using tool: \`${tool.function.name}\`...`,
              },
            ];

            let result = "";
            try {
              const args = JSON.parse(tool.function.arguments);
              if (plugin.toolManager) {
                result = await plugin.toolManager.executeTool(
                  tool.function.name,
                  args,
                );
              } else {
                result = "Error: ToolManager not initialized.";
              }
            } catch (e) {
              result = `Error executing tool: ${e.message}`;
            }

            // Add Tool Result to Context
            currentMessages.push({
              role: "tool",
              tool_call_id: tool.id,
              content: result,
            });

            // Show Result in UI
            messages = [
              ...messages,
              { role: "assistant", content: `> ${result}` },
            ];
          }
          steps++;
        } else {
          // Final Text Response
          finalContent = response.content;
          break;
        }
      }

      // Save Final Response
      saveMessageToHistory("assistant", finalContent);
    } catch (error) {
      console.error("AI Chat Error:", error);
      saveMessageToHistory("error", "Error: " + error.message);
    } finally {
      isLoading = false;
      await tick();
      scrollToBottom();
    }
  }

  function removeContext(index: number) {
    selectedContext.splice(index, 1);
    selectedContext = selectedContext;
    // If selection was removed manually, maybe we should suppress auto-add for a bit?
    // For now, simple removal.
  }

  function scrollToBottom() {
    // ... same as before
    const container = document.querySelector(".chat-history");
    if (container) container.scrollTop = container.scrollHeight;
  }

  function handleInsert(content: string) {
    plugin.editorHandler.insertText(content, "insert");
  }

  function handleReplace(content: string) {
    plugin.editorHandler.insertText(content, "replace");
  }

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content);
    new Notice("Copied to clipboard");
  }
</script>

<div class="ai-copilot-container">
  <div class="header">
    <div class="title">
      AI Copilot <span
        style="font-size:9px;background:var(--interactive-accent);color:var(--text-on-accent);padding:1px 5px;border-radius:4px;margin-left:4px;"
        >v1.1</span
      >
    </div>
    <div class="controls">
      <button
        class="new-chat-btn"
        on:click={createNewSession}
        aria-label="New Chat"
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
          class="lucide lucide-plus-circle"
          ><circle cx="12" cy="12" r="10" /><path d="M8 12h8" /><path
            d="M12 8v8"
          /></svg
        >
      </button>
      <PersonaSelector
        bind:selectedPersonaId
        personas={plugin.settings?.personas || DEFAULT_PERSONAS}
      />
      <ModelSelector
        bind:selectedModel={currentModel}
        models={currentModels}
        on:change={(e) => handleModelChange(e.detail)}
      />
    </div>
  </div>

  <div class="chat-history">
    {#if messages.length === 0}
      <div class="empty-state">
        <div class="empty-icon">✨</div>
        <h3>How can I help you today?</h3>
        <div class="suggestions">
          <button
            on:click={() => {
              query = "Summarize this note";
              sendMessage();
            }}>Summarize this note</button
          >
          <button
            on:click={() => {
              query = "Fix grammar";
              sendMessage();
            }}>Fix grammar</button
          >
        </div>
      </div>
    {/if}

    {#each messages as message}
      <MessageBubble
        role={message.role}
        content={message.content}
        isStreaming={isLoading && message === messages[messages.length - 1]}
        on:insert={() => handleInsert(message.content)}
        on:replace={() => handleReplace(message.content)}
        on:copy={() => handleCopy(message.content)}
      />
    {/each}
  </div>

  <div class="input-area">
    {#if activeContextFile}
      <div class="active-file-indicator">
        <span class="indicator-icon">📄</span>
        <span class="indicator-text">Viewing: {activeContextFile.path}</span>
      </div>
    {/if}
    {#if selectedContext.length > 0}
      <div class="context-pills">
        {#each selectedContext as context, i}
          <ContextPill
            text={context.text}
            type={context.type}
            on:remove={() => removeContext(i)}
          />
        {/each}
      </div>
    {/if}

    <ChatInput
      bind:value={query}
      on:submit={sendMessage}
      on:add-context={(e) => handleAddContext(e.detail)}
      onSearch={handleSearch}
    >
      <!-- <button slot="actions">Add</button> -->
    </ChatInput>
  </div>
</div>

<style>
  .ai-copilot-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--background-primary);
  }

  .header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .title {
    font-weight: 600;
    font-size: var(--font-ui-medium);
  }

  .chat-history {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
  }

  .input-area {
    padding: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }

  .context-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }

  /* ... (rest of styles) */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-icon {
    font-size: 32px;
    margin-bottom: 16px;
  }

  .suggestions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 24px;
    width: 100%;
    box-sizing: border-box;
  }

  .suggestions button {
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.2s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .suggestions button:hover {
    background: var(--background-modifier-hover);
  }

  .controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .new-chat-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
  }
  .new-chat-btn:hover {
    color: var(--text-normal);
  }

  .active-file-indicator {
    font-size: 10px;
    color: var(--text-muted);
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
  }
</style>
