# Changelog

## [1.3.0] - 2026-03-02

### 🧠 Persona Soul & Memory System
- **Per-Persona Soul Files**: Each persona now has a `soul.md` file (stored in `.ai-copilot/personas/{id}/`) containing rich behavioral instructions. Users can edit these directly in the vault.
- **Persistent Persona Memory**: New `memory.md` per persona stores facts, mistakes, and preferences across sessions. The AI automatically saves memories using `save_persona_memory` and `save_mistake` tools.
- **Tool-Aware Prompts**: All 4 default persona prompts now include explicit instructions for using tools (`edit_note`, `read_note`, etc.), skill routing (`list_skills`/`use_skill`), and MCP discovery.

### 📁 Folder @Mention Support
- **Folder Search**: Type `@` in the chat to see folders alongside files and headings. Folders appear with a 📁 icon.
- **Folder Context**: Selecting a folder adds it as a context pill with a rich listing of subfolders and files (including sizes).
- **Hidden Folder Exclusion**: Folders starting with `.` (e.g., `.obsidian`) are excluded from search results.

### 📂 File Explorer Right-Click Integration
- **Send to AI Copilot**: Right-click any file in the file explorer to add it as context in AI Copilot.
- **Send Folder to AI Copilot**: Right-click any folder to add it as context.
- **Auto-Open**: If AI Copilot is not open, it opens automatically when using the context menu option.

### 🎨 UI Improvements
- **Model Selector Auto-Width**: The model selection dropdown now dynamically resizes to fit the selected model name, with a smooth transition animation.

## [1.2.0] - 2026-02-28

### 🤖 Agentic Skills
- **Agentic Meta-Tools**: Added `list_skills` and `use_skill` capabilities allowing the AI to autonomously discover and activate personal AI skills from your local skills hub (`/Users/boss/Documents/ai_skills_hub`). 
- **Dynamic Context**: The model can now search for and load specific skill instruction blocks on-demand during a conversation instead of requiring manual pre-selection.

## [1.1.1] - 2026-02-19

### 🚀 Major Improvements
- **Native UI Components**: Swapped custom dropdowns for native OS `<select>` elements to fix clipping and z-index issues.
- **Model Data Audit**: Updated `PROVIDER_MODELS` with verified pricing and API identifiers for OpenAI, Anthropic, Gemini, and Groq.
- **Enhanced Chat Input**: Removed debug borders and fixed width issues in the chat input box.

### 🐛 Bug Fixes
- **Directory Mismatch**: Fixed a critical issue where the build script targeted `obsidian-ai-copilot` (hyphen) but Obsidian only loaded `obsidian_ai_copilot` (underscore).
- **Deployment Reliability**: Implemented a "Minimal Artifact" build process to reduce file conflicts during iCloud sync.

### 🧱 Technical
- **Build System**: Updated `esbuild.config.mjs` to target the legacy underscore directory structure.
- **State Management**: Migrated UI components to Svelte 5 syntax (`mount`, `unmount`).
