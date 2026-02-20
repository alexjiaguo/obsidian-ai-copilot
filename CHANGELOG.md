# Changelog

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
