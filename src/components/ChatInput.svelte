<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import { onMount } from "svelte";
  import SuggestionList from "./SuggestionList.svelte";

  export let value = "";
  export let placeholder = "Ask AI anything... (Type @ to mention)";
  export let disabled = false;
  export let isLoading = false;
  export let customPrompts: { name: string; template: string }[] = [];
  export let onSearch: (query: string) => Promise<any[]> = async () => [];
  export let editorHandler: any = null; // For grabbing selection from editor

  const dispatch = createEventDispatcher();
  let textarea: HTMLTextAreaElement;

  // Debounce timer for search
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const SEARCH_DEBOUNCE_MS = 150;

  // Suggestion state
  let showSuggestions = false;
  let suggestions: any[] = [];
  let suggestionIndex = 0;
  let mentionQuery = "";
  let mentionStartIndex = -1;
  let currentTrigger: "@" | "/" | "[[" | null = null;

  function resize() {
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
  }

  async function handleInput(event: Event) {
    const target = event.target as HTMLTextAreaElement;
    value = target.value;
    resize();
    dispatch("input", event);

    const cursor = target.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);

    // Helper to find last occurrence of a char
    const lastAt = textBeforeCursor.lastIndexOf("@");
    const lastSlash = textBeforeCursor.lastIndexOf("/");
    const lastBracket = textBeforeCursor.lastIndexOf("[[");

    // We only trigger if there is no space after the trigger character
    // and if the trigger is the closest to the cursor.
    const lastSpace = textBeforeCursor.lastIndexOf(" ");

    // Detect [[ trigger for inline notes (allows spaces)
    if (
      lastBracket > Math.max(lastAt, lastSlash) &&
      cursor - lastBracket <= 60
    ) {
      const query = textBeforeCursor.slice(lastBracket + 2);
      mentionQuery = query;
      mentionStartIndex = lastBracket;
      currentTrigger = "[[";
      showSuggestions = true;
      debouncedSearch(query);
      suggestionIndex = 0;
      return;
    }

    // Detect / trigger for prompts
    if (
      lastSlash > lastSpace &&
      lastSlash > lastAt &&
      lastSlash > lastBracket &&
      cursor - lastSlash <= 20
    ) {
      const query = textBeforeCursor.slice(lastSlash + 1).toLowerCase();
      const matched = customPrompts
        .filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.template.toLowerCase().includes(query),
        )
        .map((p) => ({
          type: "prompt",
          text: p.name,
          content: p.template,
          data: p,
        }));

      if (matched.length > 0) {
        mentionQuery = query;
        mentionStartIndex = lastSlash;
        currentTrigger = "/";
        showSuggestions = true;
        suggestions = matched;
        suggestionIndex = 0;
        return;
      }
    }

    // Detect @ trigger for context mentions
    if (
      lastAt > lastSpace &&
      lastAt > lastSlash &&
      lastAt > lastBracket &&
      cursor - lastAt <= 20
    ) {
      const query = textBeforeCursor.slice(lastAt + 1);
      mentionQuery = query;
      mentionStartIndex = lastAt;
      currentTrigger = "@";
      showSuggestions = true;
      debouncedSearch(query);
      suggestionIndex = 0;
      return;
    }

    // Close suggestions if trigger conditions no longer met
    showSuggestions = false;
    currentTrigger = null;
  }

  // Debounced search to reduce vault scanning
  function debouncedSearch(query: string) {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(async () => {
      suggestions = await onSearch(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  // Cleanup on destroy
  onDestroy(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (showSuggestions && suggestions.length > 0) {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        suggestionIndex =
          (suggestionIndex - 1 + suggestions.length) % suggestions.length;
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        suggestionIndex = (suggestionIndex + 1) % suggestions.length;
      } else if (event.key === "Enter") {
        event.preventDefault();
        selectSuggestion(suggestions[suggestionIndex]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        showSuggestions = false;
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      dispatch("submit");
    }
  }

  function selectSuggestion(item: any) {
    if (!item) return;

    const before = value.slice(0, mentionStartIndex);
    // Determine how many characters to skip for the after part
    const triggerLength = currentTrigger === "[[" ? 2 : 1;
    const after = value.slice(
      mentionStartIndex + mentionQuery.length + triggerLength,
    );

    if (currentTrigger === "/") {
      // Inline Prompt replacement
      const insertedText = item.content;
      value = before + insertedText + after;
      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          const newCursor = before.length + insertedText.length;
          textarea.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    } else if (currentTrigger === "[[") {
      // Inline Note replacement (standard Obsidian wiki link)
      const insertedText = `[[${item.text}]]`;
      value = before + insertedText + after;
      setTimeout(() => {
        if (textarea) {
          textarea.focus();
          const newCursor = before.length + insertedText.length;
          textarea.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    } else {
      // @ Context Pill
      value = before + after;
      dispatch("add-context", item);
    }

    showSuggestions = false;
    currentTrigger = null;
    resize();
  }

  function grabSelection() {
    if (!editorHandler) return;
    const selectedText = editorHandler.getSelectedText();
    if (!selectedText) {
      // No text selected — show a brief notice-like feedback
      return;
    }
    dispatch("add-context", {
      type: "selection",
      text: "📋 Selection",
      path: editorHandler.getActiveFileName() || "unknown",
      data: selectedText,
      content: selectedText,
    });
  }

  // Public method — parent calls this when user explicitly opens the copilot
  export function focusInput() {
    if (textarea) textarea.focus();
  }

  $: if (value === "") resize();
  onMount(() => {
    resize();
  });

  let fileInput: HTMLInputElement;

  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          dispatch("add-context", {
            type: "image",
            path: file.name,
            basename: file.name,
            data: result,
            file: file,
          });
        };
        reader.readAsDataURL(file);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          dispatch("add-context", {
            type: "file",
            path: file.name,
            basename: file.name,
            content: result,
            file: file,
          });
        };
        reader.readAsText(file);
      }
    }
    // Reset input so same file can be re-uploaded
    target.value = "";
  }

  function triggerFileUpload() {
    fileInput.click();
  }
</script>

<div
  class="chat-input-wrapper-container"
  style="position: relative; width: 100%;"
>
  <input
    type="file"
    bind:this={fileInput}
    style="display: none;"
    on:change={handleFileChange}
    multiple
    accept="image/*,.pdf,.txt,.md,.json,.js,.ts,.py,.java,.c,.cpp,.h,.css,.html,.xml,.yml,.yaml"
  />

  {#if showSuggestions && suggestions.length > 0}
    <SuggestionList
      items={suggestions}
      bind:selectedIndex={suggestionIndex}
      on:select={(e) => selectSuggestion(e.detail)}
    />
  {/if}

  <div class="chat-input-wrapper" class:disabled>
    <textarea
      bind:this={textarea}
      {placeholder}
      {disabled}
      on:input={handleInput}
      on:keydown={handleKeydown}
      rows="1"
      tabindex="0"
      autocomplete="off">{value}</textarea
    >
    <div class="actions">
      <div class="left-actions">
        <button
          class="action-btn"
          on:click={triggerFileUpload}
          aria-label="Upload file"
          title="Attach file"
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
            class="lucide lucide-paperclip"
            ><path
              d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
            /></svg
          >
        </button>
        <button
          class="action-btn"
          on:click={grabSelection}
          aria-label="Grab selected text"
          title="Add selected text from editor"
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
            ><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path
              d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
            ></path></svg
          >
        </button>
      </div>
      {#if isLoading}
        <button
          class="send-btn stop-btn"
          on:click={() => dispatch("stop")}
          aria-label="Stop generation"
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
            class="lucide lucide-square"
            ><rect width="14" height="14" x="5" y="5" rx="2" /></svg
          >
        </button>
      {:else}
        <button
          class="send-btn"
          on:click={() => dispatch("submit")}
          {disabled}
          aria-label="Send message"
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
            ><line x1="22" y1="2" x2="11" y2="13"></line><polygon
              points="22 2 15 22 11 13 2 9 22 2"
            ></polygon></svg
          >
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .chat-input-wrapper {
    display: flex;
    flex-direction: column;
    background-color: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    padding: 8px;
    transition: border-color 0.2s ease;
    user-select: text;
    -webkit-user-select: text;
  }

  .chat-input-wrapper:focus-within {
    border-color: var(--interactive-accent);
    box-shadow: 0 0 0 2px var(--background-modifier-border-focus);
  }

  .chat-input-wrapper.disabled {
    opacity: 0.7;
    pointer-events: none;
  }

  textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-family: inherit;
    font-size: var(--font-ui-medium);
    line-height: 1.5;
    max-height: 200px;
    padding: 0;
    margin: 0;
    color: var(--text-normal);
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
    -webkit-appearance: none;
    appearance: none;
    pointer-events: auto;
    position: relative;
    z-index: 1;
  }

  textarea:focus {
    outline: none;
    border: none;
  }

  textarea::placeholder {
    color: var(--text-muted);
  }

  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
  }

  .left-actions {
    display: flex;
    gap: 8px;
  }

  .action-btn {
    background: transparent;
    color: var(--text-muted);
    border: none;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      color 0.2s,
      background-color 0.2s;
    padding: 0;
  }

  .action-btn:hover {
    color: var(--text-normal);
    background-color: var(--background-modifier-hover);
  }

  .send-btn {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border: none;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s;
    padding: 0;
  }

  .send-btn:hover {
    background-color: var(--interactive-accent-hover);
  }

  .stop-btn {
    background-color: var(--background-modifier-error) !important;
  }

  .send-btn:disabled {
    background-color: var(--background-modifier-cover);
    cursor: not-allowed;
  }
</style>
