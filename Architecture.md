# Architecture Design: Obsidian AI Copilot

## 1. Overview
The Obsidian AI Copilot is a TypeScript-based plugin that integrates with Obsidian's API. It follows a modular architecture to support multiple AI providers and provide a seamless user experience.

## 2. Core Components

### 2.1 Plugin Entry Point (`main.ts`)
- Responsible for initializing the plugin, registering commands, ribbon icons, and settings tabs.
- Manages the lifecycle of other services.

### 2.2 Settings & Configuration (`Settings.ts`)
- Handles persistent storage of user preferences and API keys using Obsidian's `loadData()` and `saveData()`.
- Provides a settings tab UI for configuration.

### 2.3 AI Service Layer (`services/APIService.ts`)
- **Interfaces**: Defines `AIProvider` and `AIResponse` for standardized text generation and tool handling.
- **Unified Provider**: `OpenAIProvider` handles logic for multiple backends (OpenAI, Anthropic, Ollama, Groq, and Gemini) by adapting API payloads and headers as needed.

### 2.4 Context & Tools Management
- **ContextManager (`services/ContextManager.ts`)**: Resolves user contexts (files, folders, headings, active selection) into AI prompt data. Manages fuzzy searching for `@` mentions.
- **ToolManager (`services/ToolManager.ts`)**: Registers and handles execution of AI tools (`create_note`, `append_to_note`, `read_note`, `list_folder`). Provides tools definitions in JSON Schema for the LLM.
- **SkillService (`services/SkillService.ts`)**: Handles the indexing and retrieval of external agentic skills. Facilitates autonomous skill discovery and activation via the `list_skills` and `use_skill` meta-tools.

### 2.5 Editor Integration (`EditorHandler.ts`)
- Interacts with the Obsidian `Editor` object.
- Functions for getting selected text, inserting text at cursor, and replacing text blocks.
- Implements slash commands and context menu items.

### 2.6 AI Sidebar Chat (`views/AIChatView.ts`)
- A custom Obsidian view (likely using Svelte or React).
- Maintains a chat history for the current session.
- Allows referencing the active file or specific vault notes.

### 2.7 Vault Indexer & RAG (`services/VectorIndex.ts`)
- **Note Chunker**: Breaks down long notes into manageable pieces for embedding.
- **Embedding Service**: Calls an embedding API (e.g., OpenAI `text-embedding-3-small`) to generate vectors.
- **Local Vector Store**: A simple, efficient local storage for vectors (e.g., `hnswlib-js` or a custom JSON-based store for MVP).
- **Search Engine**: Performs semantic search across the vault to provide context for AI queries.

## 3. Data Flow

### 3.1 Basic Editor Action
1. User triggers "Summarize" via Command Palette or Context Menu.
2. `EditorHandler` captures the selected text.
3. `AIProvider` (e.g., `OpenAIProvider`) sends the request to the API with a pre-defined system prompt for summarization.
4. The API response is received and passed back to `EditorHandler`.
5. `EditorHandler` inserts the summary below the selection or replaces it.

### 3.2 Vault-wide Q&A
1. User enters a query in the AI Sidebar.
2. `VectorIndex` performs a semantic search to find the top-K most relevant note chunks.
3. The query + retrieved chunks are sent to the `AIProvider` as a single prompt (RAG).
4. The AI generates an answer based on the provided context.
5. The Sidebar displays the answer along with links to the source notes.

## 4. Technical Stack
- **Languages**: TypeScript
- **UI**: Svelte (highly recommended for Obsidian plugins due to small footprint)
- **AI Libraries**: LangChain.js (optional, for RAG orchestration) or direct API calls.
- **Vector Storage**: `hnswlib-js` (if available in the environment) or a lightweight alternative.
- **Build Tool**: `esbuild` (Obsidian's standard)

## 5. Security & Privacy
- API keys are stored in the user's local vault configuration (`.obsidian/plugins/obsidian-ai-copilot/data.json`).
- Users can choose between cloud-based (OpenAI/Anthropic) or local-based (Ollama) providers.
- No note data is sent to external servers unless specifically requested by the user through an AI action.

## 6. Directory Structure
```
obsidian-ai-copilot/
├── main.ts                # Plugin entry point
├── styles.css             # Custom styles
├── manifest.json          # Obsidian plugin manifest
├── src/
│   ├── settings/          # Settings UI and logic
│   ├── services/          # APIService, ContextManager, ToolManager, SkillService, Vector Index
│   ├── editor/            # Editor commands and handlers
│   ├── views/             # Sidebar Chat UI (Svelte components)
│   └── utils/             # Helper functions
└── tests/                 # Unit and integration tests

## 7. Build & Deployment Patterns
> [!IMPORTANT]
> **Directory Naming**: The vault plugin folder MUST be named `obsidian_ai_copilot` (underscore) to match the legacy configuration and ensure Obsidian loads the plugin.

### 7.1 Build Pipeline
- **Command**: `node esbuild.config.mjs production`
- **Output**: `main.js` (bundled with styles via `css: "injected"`)

### 7.2 Manual Deployment (iCloud Users)
Due to aggressive iCloud syncing and file locking, automated deployment scripts may fail silently.
**Recommended Workflow**:
1. Build locally (`node esbuild...`).
2. Verify `main.js` timestamp.
3. Manually copy `main.js` and `manifest.json` to the vault folder.
4. Restart Obsidian.
```
