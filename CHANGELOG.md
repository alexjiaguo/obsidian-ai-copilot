# Changelog

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
