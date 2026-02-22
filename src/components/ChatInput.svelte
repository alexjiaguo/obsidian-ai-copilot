<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { onMount } from "svelte";
  import SuggestionList from "./SuggestionList.svelte";

  export let value = "";
  export let placeholder = "Ask AI anything... (Type @ to mention)";
  export let disabled = false;
  export let onSearch: (query: string) => Promise<any[]> = async () => [];
  export let editorHandler: any = null; // For grabbing selection from editor

  const dispatch = createEventDispatcher();
  let textarea: HTMLTextAreaElement;

  // Suggestion state
  let showSuggestions = false;
  let suggestions: any[] = [];
  let suggestionIndex = 0;
  let mentionQuery = "";
  let mentionStartIndex = -1;

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

    // Detect @ trigger
    const cursor = target.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf("@");

    // Simple heuristic: if @ is found and no space after it (or we are typing a name)
    if (lastAt !== -1 && cursor - lastAt <= 20) {
      // arbitrary limit for search query length
      const query = textBeforeCursor.slice(lastAt + 1);

      if (!query.includes(" ")) {
        mentionQuery = query;
        mentionStartIndex = lastAt;
        showSuggestions = true;
        suggestions = await onSearch(query);
        suggestionIndex = 0;
        return;
      }
    }

    // Close if condition fails
    showSuggestions = false;
  }

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
    const after = value.slice(mentionStartIndex + mentionQuery.length + 1); // +1 for @

    // Instead of inserting text, we emit an event to add a pill!
    // And remove the @query from text
    value = before + after;

    dispatch("add-context", item);
    showSuggestions = false;
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

  $: if (value === "") resize();
  onMount(() => {
    resize();
    // Ensure textarea is focusable on mount
    if (textarea) {
      textarea.focus();
    }
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
      rows="1">{value}</textarea
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

  .send-btn:disabled {
    background-color: var(--background-modifier-cover);
    cursor: not-allowed;
  }
</style>
