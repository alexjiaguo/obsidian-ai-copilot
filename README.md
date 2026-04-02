# AI Copilot

**Your intelligent writing and thinking assistant for Obsidian.**

AI Copilot brings Notion AI-like capabilities directly into your vault. Chat with your notes, transform selected text, search the web, manage personas, and extend functionality with MCP servers and custom skills — all from a native-feeling sidebar.

![Obsidian](https://img.shields.io/badge/Obsidian-v1.0.0+-7C3AED?logo=obsidian&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

### 🗨️ AI Chat Sidebar
- **Context-aware conversations** — Chat with your current note, selected text, or entire vault.
- **`@` mentions** — Reference specific files inline to pull them into chat context.
- **Right-click integration** — Send files, folders, or selections to chat from context menus.
- **Multi-session support** — Pin and switch between multiple chat sessions with tabs.
- **Project scoping** — Organize chats by project with scoped folders, tags, and system prompts.
- **Auto-focus input** — The chat input is ready for typing whenever you open the panel.

### 🤖 Multiple AI Providers
Connect to your preferred LLM provider:
- **OpenAI** (GPT-4o, GPT-4.1, o3-mini, etc.)
- **Anthropic** (Claude 3.5/4 Sonnet, Opus, etc.)
- **Google Gemini** (Gemini 2.5 Pro/Flash, etc.)
- **Groq** (Llama, Mixtral, etc.)
- **Ollama** (Local models — fully offline, privacy-first)

### ✍️ Text Transform Actions
Select text and run AI-powered transformations from the command palette or right-click menu:

| Action | Description |
|--------|-------------|
| **Fix grammar & spelling** | Correct errors while preserving your voice |
| **Reformat** | Restructure text with proper headings and bullet points |
| **Summarize** | Concise summary of selected text |
| **Simplify** | Rewrite in plain, easy-to-understand language |
| **Make shorter / longer** | Condense or expand your writing |
| **Change tone** | Professional, casual, or academic voice |
| **Explain like I'm 5** | Break down complex concepts |
| **Expand selection** | Add more detail and context |
| **Brainstorm ideas** | Generate 5–10 related ideas from your text |
| **Continue writing** | Seamlessly extend your draft |

### 🛠️ Built-in Tools (Function Calling)
The AI can autonomously use tools during conversation:

- **`create_note`** / **`append_to_note`** / **`read_note`** / **`edit_note`** — Full vault CRUD operations
- **`list_folder`** — Browse vault structure
- **`web_search`** — Search the web and bring results into chat
- **`get_youtube_transcript`** — Fetch and summarize YouTube video transcripts
- **`read_pdf`** — Extract text from PDF files in your vault
- **`summarize_url`** — Fetch and summarize any web page
- **`search_vault_by_date`** — Find notes by creation or modification date
- **`save_memory`** / **`list_memories`** — Long-term memory across sessions
- **`save_summary_as_note`** — Save AI-generated summaries directly to your vault

### 🔍 Vault QA & Embeddings
- **Semantic search** over your entire vault using vector embeddings.
- **Auto-indexing** — Automatically re-index notes on startup or change.
- Supports **OpenAI** and **Ollama** embedding providers.
- Configurable **index exclusions** for folders you don't want indexed.

### 🎭 Personas
- Create multiple AI personalities with custom system prompts.
- **Persona soul & memory** — Each persona remembers past interactions and learnings.
- **Persona-specific mistake tracking** — AI learns from its errors per persona.
- Switch personas on-the-fly from the chat interface.

### 📂 Projects
- Define **scoped contexts** with specific folders, tags, and system prompts.
- Override the model per project for cost/performance optimization.
- Create projects from settings or directly inline from the chat interface.
- Automatically filter relevant notes based on project scope.

### 🔌 MCP Server Integration
Connect to local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers to extend AI capabilities:
- Auto-detect server directories and `.env` files.
- Resolve bare command names across system PATH.
- Shell wrapper support for complex server startup.
- Configure command, arguments, environment variables, and working directory per server.

### 🧠 Skills System
- Point to a folder of **SKILL.md** files to extend AI behavior.
- Skills are automatically discovered, indexed, and injected based on query relevance.
- Enable/disable individual skills; mark skills as **mandatory** for always-on injection.

### ⚡ Custom Actions
- Create your own text-transformation commands with custom prompt templates.
- Use `{{selection}}` placeholder to reference highlighted text.
- Custom actions appear in the Obsidian command palette for quick access.

### 🖱️ Right-Click Context Menu
Full AI Copilot submenu in the editor right-click menu:
- Fix grammar, reformat, summarize, simplify, shorten, lengthen, change tone, ELI5.
- Send files and folders to chat from the file explorer.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open AI Copilot chat |
| `Cmd/Ctrl + L` | Add selection to chat context |

---

## 🛠️ Installation

### From Obsidian Community Plugins
1. Open **Settings → Community plugins → Browse**.
2. Search for **AI Copilot**.
3. Click **Install**, then **Enable**.

### Manual Installation
1. Download the latest release from [GitHub Releases](https://github.com/alexjiaguo/obsidian-ai-copilot/releases).
2. Copy `main.js` and `manifest.json` to your vault's plugin folder:
   ```
   .obsidian/plugins/ai-copilot/
   ```
3. Reload Obsidian and enable the plugin.

### Build from Source
```bash
git clone https://github.com/alexjiaguo/obsidian-ai-copilot.git
cd obsidian-ai-copilot
npm install
npm run build
```

---

## ⚙️ Configuration

1. Open **Settings → AI Copilot**.
2. Select your **AI provider** and enter your **API key**.
3. (Optional) Customize:
   - **Personas** — Create AI personalities with custom system prompts.
   - **Projects** — Scope conversations to specific folders and tags.
   - **Custom actions** — Build your own text transformation commands.
   - **MCP servers** — Connect to local MCP servers for extended tooling.
   - **Skills** — Point to a skills folder for automatic prompt augmentation.
   - **Vault QA** — Configure embedding provider and auto-indexing.

---

## 🏗️ Architecture

```
main.ts                          → Plugin entry point, commands, menus
src/
├── views/
│   ├── AIChatView.ts            → Obsidian ItemView wrapper
│   ├── ChatApp.svelte           → Tab management, session lifecycle
│   └── ChatView.svelte          → Chat UI, message processing
├── components/
│   ├── ChatInput.svelte         → Auto-resizing input with @ mentions
│   ├── MessageBubble.svelte     → Message rendering with markdown
│   └── ProjectSelector.svelte   → Inline project creation/selection
├── services/
│   ├── APIService.ts            → Multi-provider LLM abstraction
│   ├── ToolManager.ts           → Function calling (17 built-in tools)
│   ├── MCPClientService.ts      → MCP server connections
│   ├── SkillService.ts          → Skill discovery and injection
│   ├── VaultQA.ts               → Embedding-based semantic search
│   ├── MemoryService.ts         → Persistent cross-session memory
│   ├── PersonaSoulService.ts    → Persona-specific memory and soul
│   ├── ContextManager.ts        → File/folder search and context
│   ├── EditorHandler.ts         → Active editor tracking
│   ├── RelevantNotes.ts         → Context-aware note suggestions
│   ├── WebSearch.ts             → DuckDuckGo web search
│   ├── YouTubeTranscriber.ts    → YouTube transcript extraction
│   ├── PDFService.ts            → PDF text extraction
│   ├── ContentExtractor.ts      → URL content extraction
│   └── EmbeddingService.ts      → OpenAI/Ollama embedding client
└── settings/
    ├── Settings.ts              → Type definitions and defaults
    └── SettingsView.svelte      → Full settings UI
```

---

## 🔒 Privacy

- **Your data stays local** unless you choose to send it to an external API.
- Use **Ollama** for fully offline, on-device AI with zero data leaving your machine.
- API keys are stored locally in your Obsidian vault settings.
- No telemetry, no tracking, no analytics.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## 📄 License

[MIT](LICENSE)
