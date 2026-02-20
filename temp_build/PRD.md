# Product Requirements Document (PRD): Obsidian AI Copilot

## 1. Executive Summary
The Obsidian AI Copilot is a plugin designed to bring Notion AI-like capabilities to Obsidian. It leverages LLMs to assist users in writing, brainstorming, summarizing, and querying their local vault, all while maintaining a seamless, privacy-conscious workflow.

## 2. Problem Statement
Obsidian users often have vast amounts of information but struggle to:
- Quickly summarize long notes.
- Transform existing content (e.g., change tone, fix grammar).
- Brainstorm new ideas within the context of their current note.
- Find specific information across their entire vault through natural language queries.
- Maintain a productive flow without switching between Obsidian and a browser-based AI.

## 3. Goals & Success Metrics
### Goals
- Provide a seamless AI writing assistant within the Obsidian editor.
- Enable vault-wide natural language Q&A (RAG - Retrieval Augmented Generation).
- Support multiple AI providers (OpenAI, Anthropic, Local LLMs via Ollama/LocalAI).
- Ensure privacy by allowing users to choose where their data is processed.

### Success Metrics
- **Adoption**: Number of active users within 3 months of release.
- **Engagement**: Average number of AI actions performed per user per week.
- **Performance**: AI response time < 5 seconds for standard writing tasks.
- **Quality**: User satisfaction rating (4/5 or higher) for AI-generated content.

## 4. User Personas
- **The Knowledge Worker**: Uses Obsidian for research, writing, and PKM (Personal Knowledge Management). Needs summaries and brainstorming.
- **The Student**: Uses Obsidian for notes and assignments. Needs help with grammar, translation, and quick retrieval of information.
- **The Developer**: Uses Obsidian for documentation and task tracking. Needs help with code-related explanations and technical summaries.

## 5. Functional Requirements
### 5.1 AI Writing Assistant (Editor Integration)
- **Selection Actions**: Summarize, Expand, Shorten, Change Tone (Professional, Casual, Academic), Fix Grammar, Translate.
- **In-place Generation**: "Continue Writing" based on the preceding context.
- **Brainstorming**: Generate lists of ideas, outlines, or pros/cons based on a prompt.

### 5.2 Command Palette & Sidebar
- **AI Sidebar**: A dedicated view for chatting with the AI, with the ability to reference the current note or the entire vault.
- **Slash Commands**: Trigger AI actions directly in the editor using `/ai`.

### 5.3 Vault Q&A (Semantic Search / RAG)
- **Indexing**: Efficiently index vault content (locally or via embeddings API).
- **Natural Language Query**: Ask questions like "What did I learn about quantum physics last month?" and get an answer with source citations (links to notes).

### 5.4 Settings & Configuration
- **API Management**: Support for OpenAI, Anthropic, and custom endpoints (Ollama).
- **Model Selection**: Allow users to choose specific models (e.g., GPT-4o, Claude 3.5 Sonnet, Llama 3).
- **Privacy Settings**: Granular control over what content is sent to external APIs.
- **Custom Prompts**: Ability to create and save custom AI action templates.

## 6. Non-Functional Requirements
- **Performance**: Large vault indexing should happen in the background without freezing the UI.
- **Security**: Secure storage of API keys (using Obsidian's built-in storage).
- **Compatibility**: Support for recent versions of Obsidian (Desktop and Mobile).
- **Extensibility**: API for other plugins to trigger AI Copilot actions.

## 7. Out of Scope
- Built-in LLM models (must use external API or local server like Ollama).
- Advanced image generation (initially focusing on text).
- Multi-user collaboration features.

## 8. User Experience (UX)
- **Minimalist**: The AI features should feel like a natural extension of the Obsidian editor.
- **Feedback**: Clear loading indicators and error messages.
- **Keyboard-Centric**: Strong support for hotkeys and command palette.

## 9. Technical Constraints & Dependencies
- **Obsidian API**: Limited by what the Obsidian plugin API allows (e.g., restricted Node.js environment in some contexts).
- **Vector DB**: Needs a lightweight solution for local embeddings (e.g., a simple vector library or local SQLite with vector extension if possible).
- **API Costs**: Users are responsible for their own API usage costs.
- **Deployment**: Plugin ID and Folder Name MUST match (`obsidian_ai_copilot`) to ensure consistent loading by Obsidian.
- **Environment**: Manual file copying may be required in iCloud-synced vaults due to file locking/sync race conditions.

## 10. Roadmap
- **V1 (MVP)**: Basic editor actions (summarize, fix grammar) + OpenAI/Anthropic support.
- **V2**: AI Sidebar Chat + "Continue Writing".
- **V3**: Vault-wide Q&A (RAG) + Local LLM support.
- **V4**: Custom prompt templates + Multi-language support.

## 11. Acceptance Criteria
- User can trigger AI actions on selected text.
- AI-generated text is correctly inserted into the note.
- API keys can be saved and validated.
- Vault indexing completes successfully and enables basic Q&A.
