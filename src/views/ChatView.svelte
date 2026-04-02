<script lang="ts">
  import { onMount, onDestroy, tick } from "svelte";
  import { Notice } from "obsidian";
  import ChatInput from "../components/ChatInput.svelte";
  import MessageBubble from "../components/MessageBubble.svelte";
  import ContextPill from "../components/ContextPill.svelte";

  import PersonaSelector from "../components/PersonaSelector.svelte";
  import ProjectSelector from "../components/ProjectSelector.svelte";
  import ComposerDiff from "../components/ComposerDiff.svelte";
  import { DEFAULT_PERSONAS } from "../settings/Settings";
  import type { ChatSession, ChatMessage } from "../settings/Settings";

  export let plugin: any;
  export let sessionId: string | null = null;
  export let projectId: string | null = null;
  export let personaId: string = 'default';
  export let isVaultQAMode: boolean = false;
  
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  // Public method for external context injection (e.g., from command palette)
  export function addSelectionContext(text: string, filePath: string) {
    selectedContext = [
      ...selectedContext,
      {
        type: "selection",
        text: `📋 Selection from ${filePath}`,
        path: filePath,
        data: text,
        content: text,
      },
    ];
  }

  export function addFileContext(filePath: string, fileName: string) {
    // Deduplicate
    if (
      selectedContext.some((c) => c.path === filePath && c.type !== "selection")
    )
      return;
    selectedContext = [
      ...selectedContext,
      {
        type: "file",
        text: fileName,
        path: filePath,
      },
    ];
  }

  export function addFolderContext(folderPath: string, folderName: string) {
    // Deduplicate
    if (
      selectedContext.some((c) => c.path === folderPath && c.type === "folder")
    )
      return;
    selectedContext = [
      ...selectedContext,
      {
        type: "folder",
        text: `📁 ${folderName}`,
        path: folderPath,
      },
    ];
  }

  let chatInputRef: ChatInput;

  // Public method — called from AIChatView.ts when user explicitly opens copilot
  export function focusChatInput() {
    if (chatInputRef && typeof chatInputRef.focusInput === 'function') {
      chatInputRef.focusInput();
    }
  }

  let query = "";
  let messages: ChatMessage[] = [];
  let isLoading = false;
  let activeContextFile: { path: string; content: string } | null = null;

  // Current Session State
  let currentSessionId: string = "";
  let quotedMessage: { index: number; content: string } | null = null;
  let messageQueue: {
    text: string;
    context: any[];
    displayContent: string;
    qaSources: string[];
    systemBase: string;
    quotedMessage: { index: number; content: string } | null;
  }[] = [];
  let selectedContext: {
    type: "file" | "folder" | "selection" | "image" | "heading";
    text: string;
    data?: any;
    path?: string;
    heading?: string;
    file?: any;
    content?: string; // for uploaded local files
  }[] = [];
  let currentModel = "gpt-5-mini";
  let selectedPersonaId = personaId || "default";

  // Store event callback reference for cleanup
  let activeLeafChangeCallback: (() => void) | null = null;
  let _mounted = false;
  let _prevSessionId: string | null = sessionId;

  onMount(async () => {
    if (plugin.settings) {
      currentModel = plugin.settings.model || "gpt-5-mini";
      selectedPersonaId = personaId || plugin.settings.defaultPersonaId || "default";

      // Load or Create Session specific to this Tab
      if (sessionId) {
        loadSession(sessionId);
      } else {
        createNewSession();
      }
    }

    // Check for active file context periodically or on focus
    checkActiveFile();
    // Register event for active leaf change to update context immediately
    activeLeafChangeCallback = () => checkActiveFile();
    plugin.app.workspace.on("active-leaf-change", activeLeafChangeCallback);
    _mounted = true;
  });

  // React to sessionId prop changes (e.g. from history drawer)
  $: if (_mounted && sessionId !== _prevSessionId) {
    _prevSessionId = sessionId;
    if (sessionId) {
      loadSession(sessionId);
    } else {
      createNewSession();
    }
  }

  // Cleanup event listeners on component destroy
  onDestroy(() => {
    if (activeLeafChangeCallback) {
      plugin.app.workspace.off("active-leaf-change", activeLeafChangeCallback);
      activeLeafChangeCallback = null;
    }
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
      sessionId = session.id;
      messages = session.messages;
      dispatch("sessionChange", session.id);
      dispatch("titleChange", session.title || "New Chat");
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
      projectId: plugin.settings.activeProjectId || null,
    };

    plugin.settings.sessions = [...plugin.settings.sessions, newSession];
    currentSessionId = newSession.id;
    sessionId = newSession.id;
    messages = newSession.messages;
    plugin.saveSettings();
    dispatch("sessionChange", newSession.id);
    dispatch("titleChange", newSession.title);

    // Trigger reactivity for the session list
    plugin.settings = { ...plugin.settings };
  }

  function updateSessionTitle(firstMessage: string) {
    const session = plugin.settings.sessions.find(
      (s: any) => s.id === currentSessionId,
    );
    if (session && session.title === "New Chat") {
      const newTitle = firstMessage.slice(0, 30) + (firstMessage.length > 30 ? "..." : "");
      session.title = newTitle;
      plugin.saveSettings();
      dispatch("titleChange", newTitle);
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

      // Force reactivity for session list update (date change)
      plugin.settings.sessions = [...plugin.settings.sessions];
      plugin.settings = { ...plugin.settings };

      plugin.saveSettings();
    }
  }

  // Reactive: use per-tab projectId for API calls
  $: activeProject = plugin.settings?.projects?.find(
    (p: any) => p.id === projectId
  ) || null;

  // ... checkSelection ...

  async function handleSearch(query: string) {
    if (!plugin || !plugin.contextManager) return [];
    return plugin.contextManager.searchFiles(query);
  }

  function handleAddContext(item: any) {
    // Deduplicate by path (but allow multiple selections)
    if (
      item.type !== "selection" &&
      item.path &&
      selectedContext.some(
        (c) => c.path === item.path && c.type !== "selection",
      )
    )
      return;

    // Selection from editor
    if (item.type === "selection") {
      selectedContext = [
        ...selectedContext,
        {
          type: "selection",
          text: item.text || "📋 Selection",
          path: item.path,
          data: item.data,
          content: item.content,
        },
      ];
      // Raw Obsidian TFile from @mention suggestions (has .extension, .basename, .path but no .type)
    } else if (!item.type && item.path && item.basename !== undefined) {
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
    } else if (item.type === "folder") {
      selectedContext = [
        ...selectedContext,
        {
          type: "folder",
          text: `📁 ${item.name || item.path}`,
          path: item.path,
        },
      ];
    }
  }

  async function sendMessage() {
    if (!query.trim() && selectedContext.length === 0) return;

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
        const inlineParts = inlineContexts.map(
          (c: any) => `\n\n--- ${c.text} ---\n${c.content}`
        );
        contextText += inlineParts.join("");
      }
    }

    // Vault QA Mode specific context
    let qaSources: string[] = [];
    if (isVaultQAMode && plugin.vaultQA && plugin.vaultQA.isIndexed) {
      const results = await plugin.vaultQA.search(query, 5, activeProject);
      if (results && results.length > 0) {
        contextText += `\n\n=== RELEVANT VAULT CONTEXT ===\n`;
        results.forEach((res: any, i: number) => {
          contextText += `[Source ${i + 1} - ${res.fileId}]:\n${res.text}\n\n`;
          if (!qaSources.includes(res.fileId)) qaSources.push(res.fileId);
        });
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

    messageQueue = [
      ...messageQueue,
      {
        text: fullPromptText,
        context: [...imageContexts],
        displayContent: displayContent,
        qaSources: qaSources,
        systemBase: systemBase,
        quotedMessage: quotedMessage,
      },
    ];

    // Clear quote state after queuing
    quotedMessage = null;

    // Update Title if it's the first message
    if (messages.length === 0 && messageQueue.length === 1) {
      updateSessionTitle(query);
    }

    query = "";
    selectedContext = [];

    // Auto-scroll to bottom immediately so the user sees their message
    await tick();
    scrollToBottom();

    if (!isLoading) {
      processQueue();
    }
  }

  async function processQueue() {
    if (isLoading || messageQueue.length === 0) return;

    isLoading = true;
    const nextMessage = messageQueue.shift();
    messageQueue = [...messageQueue];

    if (!nextMessage) {
      isLoading = false;
      return;
    }

    saveMessageToHistory("user", nextMessage.displayContent);
    await tick();
    scrollToBottom();

    try {
      let currentMessages: any[] = [];

      // 0. System Prompt from Persona or Active Project
      const persona =
        plugin.settings.personas.find((p: any) => p.id === selectedPersonaId) ||
        DEFAULT_PERSONAS[0];

      let baseSystemPrompt = persona.prompt;
      if (activeProject && activeProject.systemPrompt) {
        baseSystemPrompt = activeProject.systemPrompt;
      }

      // Inject long-term memories into system prompt
      let memoryPreamble = "";
      if (plugin.memoryService) {
        try {
          memoryPreamble = await plugin.memoryService.getMemoryPreamble();
        } catch (e) {
          console.warn("Could not load memories:", e);
        }
      }

      // Inject relevant skills based on the user query
      let skillContext = "";
      if (plugin.skillService) {
        try {
          skillContext = await plugin.skillService.buildSkillContext(
            nextMessage.text,
            plugin.settings,
          );
          if (skillContext) {
            console.debug("SkillService: Injected relevant skills into prompt");
          }
        } catch (e) {
          console.warn("Could not load skills:", e);
        }
      }

      // Load persona soul + memory
      let soulPreamble = "";
      if (plugin.personaSoulService) {
        try {
          soulPreamble =
            await plugin.personaSoulService.buildSoulPreamble(
              selectedPersonaId,
            );
        } catch (e) {
          console.warn("Could not load persona soul:", e);
        }
      }

      // Set active persona on toolManager for persona-specific memory tools
      if (plugin.toolManager) {
        plugin.toolManager.setActivePersonaId(selectedPersonaId);
      }

      const actualModel =
        activeProject?.defaultModel
          ? activeProject.defaultModel
          : currentModel;

      // Prepend file context to system prompt if it exists (so it persists across the chat turn)
      // Inject quoted message as high-priority context if present
      let quoteContext = "";
      if (nextMessage.quotedMessage) {
        quoteContext = `\n\n=== QUOTED MESSAGE (The user is asking a follow-up question about this specific response. Treat it as the primary context.) ===\n${nextMessage.quotedMessage.content}\n=== END QUOTED MESSAGE ===`;
      }

      const finalSystemPrompt =
        baseSystemPrompt +
        soulPreamble +
        memoryPreamble +
        skillContext +
        quoteContext +
        (nextMessage.systemBase
          ? `\n\nContext:\n${nextMessage.systemBase}`
          : "");

      currentMessages.push({ role: "system", content: finalSystemPrompt });

      // Inject prior conversation history
      // If quoting, only include messages up to and including the quoted message
      // Otherwise, include all messages except the one we just pushed
      const historyEnd = nextMessage.quotedMessage
        ? nextMessage.quotedMessage.index + 1
        : messages.length - 1;
      const priorMessages = messages
        .slice(0, historyEnd)
        .filter((msg) => msg.role === "user" || msg.role === "assistant")
        .map((msg) => ({ role: msg.role, content: msg.content }));
      currentMessages.push(...priorMessages);

      // Construct Initial Message Payload
      if (nextMessage.context.length > 0) {
        const contentParts = [];
        if (nextMessage.text.trim()) {
          contentParts.push({ type: "text", text: nextMessage.text });
        }
        for (const img of nextMessage.context) {
          contentParts.push({
            type: "image_url",
            image_url: { url: img.data },
          });
        }
        currentMessages.push({ role: "user", content: contentParts });
      } else {
        currentMessages.push({ role: "user", content: nextMessage.text });
      }

      // Tool Loop
      let steps = 0;
      const maxSteps = 10;
      let finalContent = "";

      // Get Tools
      const tools = plugin.toolManager
        ? await plugin.toolManager.getToolsDefinition()
        : [];

      while (steps < maxSteps) {
        const response = await plugin.aiProvider.generateResponse(
          currentMessages,
          { model: actualModel },
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
            } catch (e: any) {
              result = `Error executing tool: ${e.message}`;
            }

            // Check if result is a Composer Diff
            let parsedComposerDiff = null;
            if (
              tool.function.name === "edit_note" &&
              result.trim().startsWith("{")
            ) {
              try {
                const parsed = JSON.parse(result);
                if (parsed._isComposerDiff) {
                  parsedComposerDiff = parsed;
                  // Keep status from tool if auto-applied, otherwise set to pending
                  if (!parsedComposerDiff.status) {
                    parsedComposerDiff.status = "pending";
                  }
                  result =
                    parsed.status === "accepted"
                      ? `File edit auto-applied to ${parsed.path}.`
                      : `File edit proposed for ${parsed.path}.`;
                }
              } catch (e) {}
            }

            // Add Tool Result to Context
            currentMessages.push({
              role: "tool",
              tool_call_id: tool.id,
              content: result,
            });

            // Show Result in UI
            if (parsedComposerDiff) {
              messages = [
                ...messages,
                {
                  role: "assistant",
                  content: "",
                  composerDiff: parsedComposerDiff,
                },
              ];
            } else {
              messages = [
                ...messages,
                { role: "assistant", content: `> ${result}` },
              ];
            }
          }
          steps++;
        } else {
          // Final Text Response
          finalContent = response.content;
          break;
        }
      }

      // Append Sources if in Vault QA mode
      if (isVaultQAMode && nextMessage.qaSources.length > 0 && finalContent) {
        finalContent += `\n\n**Sources:**\n${nextMessage.qaSources.map((s: any) => `- [[${s}]]`).join("\n")}`;
      }

      // Save Final Response
      saveMessageToHistory(
        "assistant",
        finalContent || "(No response from model)",
      );
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      saveMessageToHistory("error", "Error: " + error.message);
    } finally {
      isLoading = false;
      await tick();
      scrollToBottom();
      if (messageQueue.length > 0) {
        processQueue();
      }
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

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content);
    new Notice("Copied to clipboard");
  }

  function handleQuote(index: number, content: string) {
    quotedMessage = { index, content };
    // Focus the input so user can type their follow-up
    if (chatInputRef && typeof chatInputRef.focusInput === 'function') {
      chatInputRef.focusInput();
    }
  }

  function clearQuote() {
    quotedMessage = null;
  }


  async function performDiffAction(
    message: ChatMessage,
    action: "accept" | "reject" | "revert",
  ) {
    if (!message.composerDiff) return;
    const diff = message.composerDiff;

    if (action === "reject") {
      diff.status = "rejected";
      messages = [...messages];
      plugin.saveSettings();
      return;
    }

    try {
      const file = plugin.app.vault.getAbstractFileByPath(diff.path);
      if (file && file.extension === "md") {
        const content = await plugin.app.vault.read(file);

        let newContent = content;
        if (action === "accept") {
          if (!content.includes(diff.oldText)) {
            new Notice("Could not find exact text to replace in file.");
            return;
          }
          newContent = content.replace(diff.oldText, diff.newText);
        } else if (action === "revert") {
          if (!content.includes(diff.newText)) {
            new Notice("Could not find exact text to revert in file.");
            return;
          }
          newContent = content.replace(diff.newText, diff.oldText);
        }

        await plugin.app.vault.modify(file, newContent);

        diff.status = action === "accept" ? "accepted" : "pending";
        messages = [...messages];
        plugin.saveSettings();
        new Notice(`Edit ${action === "accept" ? "applied" : "reverted"}.`);
      } else {
        new Notice("File not found or not a markdown file.");
      }
    } catch (e: any) {
      new Notice("Error applying edit: " + e.message);
    }
  }

  function handleDeleteMessage(index: number) {
    messages = messages.filter((_: any, idx: number) => idx !== index);
    const session = plugin.settings.sessions.find(
      (s: any) => s.id === currentSessionId,
    );
    if (session) {
      session.messages = messages;
      session.updatedAt = Date.now();
      plugin.settings.sessions = [...plugin.settings.sessions];
      plugin.settings = { ...plugin.settings };
      plugin.saveSettings();
    }
    new Notice("Message deleted");
  }

  function handleEditMessage(index: number) {
    messageQueue = [];
    const msg = messages[index];
    if (msg?.role === "user") {
      query = msg.content;
      messages = messages.slice(0, index);
      const session = plugin.settings.sessions.find(
        (s: any) => s.id === currentSessionId,
      );
      if (session) {
        session.messages = messages;
        session.updatedAt = Date.now();
        plugin.settings.sessions = [...plugin.settings.sessions];
        plugin.settings = { ...plugin.settings };
        plugin.saveSettings();
      }
    }
  }

  async function handleRegenerate(index: number) {
    messageQueue = [];
    const assistantMsg = messages[index];
    if (assistantMsg?.role !== "assistant") return;

    let lastUserQuery = "";
    for (let j = index - 1; j >= 0; j--) {
      if (messages[j].role === "user") {
        lastUserQuery = messages[j].content;
        break;
      }
    }
    if (!lastUserQuery) return;

    // Remove from this assistant message onward and persist
    messages = messages.slice(0, index);
    const session = plugin.settings.sessions.find(
      (s: any) => s.id === currentSessionId,
    );
    if (session) {
      session.messages = messages;
      session.updatedAt = Date.now();
      plugin.settings.sessions = [...plugin.settings.sessions];
      plugin.settings = { ...plugin.settings };
      plugin.saveSettings();
    }

    // Re-send the user's query
    query = lastUserQuery;
    await sendMessage();
  }

  function handleCreateProject(e: CustomEvent<string>) {
    const projectName = e.detail;
    const newProject = {
      id: crypto.randomUUID(),
      name: projectName,
      description: "",
      includeFolders: "",
      excludeFolders: "",
      includeTags: "",
      systemPrompt: "",
      defaultModel: ""
    };

    plugin.settings.projects = [...(plugin.settings.projects || []), newProject];
    plugin.saveSettings();
    plugin.settings = { ...plugin.settings };

    projectId = newProject.id;
    dispatch('projectChange', newProject.id);
    new Notice(`Created new project: ${projectName}`);
  }
</script>

<div class="ai-copilot-container">
  <div class="header">
    <div class="controls">
      <ProjectSelector
        selectedProjectId={projectId}
        projects={plugin.settings?.projects || []}
        on:change={(e) => {
          projectId = e.detail;
          dispatch('projectChange', e.detail);
        }}
        on:create={handleCreateProject}
      />
      <PersonaSelector
        bind:selectedPersonaId
        personas={plugin.settings?.personas || DEFAULT_PERSONAS}
        on:change={(e) => dispatch('personaChange', e.detail)}
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
        </div>
      </div>
    {/if}

    {#each messages as message, i}
      {#if message.composerDiff}
        <ComposerDiff
          path={message.composerDiff.path}
          oldText={message.composerDiff.oldText}
          newText={message.composerDiff.newText}
          status={message.composerDiff.status}
          on:accept={() => performDiffAction(message, "accept")}
          on:reject={() => performDiffAction(message, "reject")}
          on:revert={() => performDiffAction(message, "revert")}
        />
      {:else}
        <MessageBubble
          role={message.role}
          content={message.content}
          isStreaming={isLoading && message === messages[messages.length - 1]}
          app={plugin.app}
          on:insert={() => handleInsert(message.content)}
          on:copy={() => handleCopy(message.content)}
          on:edit={() => handleEditMessage(i)}
          on:delete={() => handleDeleteMessage(i)}
          on:regenerate={() => handleRegenerate(i)}
          on:quote={() => handleQuote(i, message.content)}
        />
      {/if}
    {/each}
    {#each messageQueue as queuedMsg}
      <MessageBubble
        role="user"
        content={queuedMsg.displayContent + "\n\n*(Queued...)*"}
        isStreaming={false}
        app={plugin.app}
      />
    {/each}
  </div>

  <div class="input-area">
    {#if quotedMessage}
      <div class="quote-preview">
        <div class="quote-preview-header">
          <span class="quote-label">💬 Quoting AI response</span>
          <button class="quote-dismiss" on:click={clearQuote} title="Remove quote">✕</button>
        </div>
        <div class="quote-preview-content">{quotedMessage.content}</div>
      </div>
    {/if}
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
      bind:this={chatInputRef}
      bind:value={query}
      on:submit={sendMessage}
      on:add-context={(e) => handleAddContext(e.detail)}
      onSearch={handleSearch}
      editorHandler={plugin.editorHandler}
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
    user-select: text;
    -webkit-user-select: text;
  }

  .header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
    background-color: var(--background-secondary);
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
    width: 75%;
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



  .active-file-indicator {
    font-size: 10px;
    color: var(--text-muted);
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
  }

  .quote-preview {
    background-color: var(--background-secondary);
    border-left: 3px solid var(--interactive-accent);
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 8px;
    position: relative;
  }

  .quote-preview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .quote-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--interactive-accent);
  }

  .quote-dismiss {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 14px;
    padding: 0 2px;
    line-height: 1;
    transition: color 0.15s;
  }

  .quote-dismiss:hover {
    color: var(--text-normal);
  }

  .quote-preview-content {
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
    max-height: 3.6em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    white-space: pre-wrap;
  }
</style>
