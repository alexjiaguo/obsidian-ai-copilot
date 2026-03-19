# Product Requirements Document (PRD): Obsidian AI Copilot

## 1. Executive Summary
The Obsidian AI Copilot is a plugin designed to bring Notion AI-like capabilities to Obsidian. It leverages LLMs to assist users in writing, brainstorming, summarizing, and querying their local vault, all while maintaining a seamless, privacy-conscious workflow.

## 2. Problem Statement
Obsidian users often have vast amounts of information but struggle to:
- Quickly summarize or refine their writing (e.g., expand, shorten, change tone, fix grammar).
- Brainstorm new ideas within the context of their current note.
- Find specific information across their entire vault through natural language queries.
- Maintain a productive flow without switching between Obsidian and a browser-based AI.

## 3. Goals & Success Metrics
### Goals
- Provide a seamless AI writing assistant within the Obsidian editor.
- Enable vault-wide natural language Q&A (RAG - Retrieval Augmented Generation).
- Support multiple AI providers (OpenAI, Anthropic, Groq, Google Gemini, and Local LLMs via Ollama).
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

### 5.4 Context & Multi-Session Management
- **Multiple Tabs**: Support for concurrent chat sessions in different tabs.
- **Per-Tab Context & Persona**: Each tab maintains its own active 'Project' and 'Persona' selection.
- **Global History**: Slide-out drawer to view and restore chat history from the past 24 hours.
- **Context Mentions**: Selection, file, and folder context injection via `@`.
- **Global Vault Q&A**: Ability to toggle vault indexing mode across the entire app.
- **AI Actions/Tools**: The AI is equipped with tools to interact with the vault autonomously (e.g., reading files, appending to notes, listing directories, and creating new notes).
- **Agentic Skills**: The AI can dynamically discover and activate extensive multi-step skills written as markdown files (via `list_skills` and `use_skill` capabilities) to handle complex workflows.

### 5.5 Settings & Configuration
- **API Management**: Support for OpenAI, Anthropic, Groq, Google Gemini, and custom endpoints (Ollama).
- **Model Selection**: Allow users to choose specific models (e.g., GPT-4o, Claude 3.5 Sonnet, Gemini 2.5, DeepSeek, Llama 3).
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

## 11. Notion AI Feature Comparison & Gap Analysis

Based on an investigation of official Notion AI features, here is a comparison with the Obsidian AI Copilot roadmap:

### 11.1 Features Currently on the Roadmap (Aligned with Notion AI)
- **Powerful Writing Capabilities**: Summarize, Expand, Shorten, Change Tone, Fix Grammar, Translate, and Brainstorming. (V1 & V4 Roadmap)
- **Document Summarization**: Summarizing long notes and selected text. (V1 Roadmap)
- **Vault/Workspace Search**: Semantic search and Q&A across the user's knowledge base. (V3 Roadmap)
- **Multiple AI Models**: Allowing users to choose between Claude, GPT, Gemini, and Local models. (V1 & V3 Roadmap)
- **Context Mentions & AI Actions**: Referencing specific files and autonomous reading/appending. (V2 Roadmap)

### 11.2 Features Currently Missing from the Roadmap
These are Notion AI capabilities that are not currently planned for Obsidian AI Copilot:
- **Autonomous Agents (Notion Agent)**: Multi-step execution across integrated third-party applications.
- **Enterprise Connectors**: Searching outside the Obsidian Vault (e.g., Slack, Google Drive, Google Workspace integrations).
- **AI Meeting Notes**: Direct audio transcription and meeting specific actionable extractions.
- **AI for Databases (Frontmatter/Dataview Autofill)**: Automatically populating YAML properties or Dataview fields with AI-extracted metadata, summaries, and keywords.
- **Image Analysis**: Directly analyzing images for information extraction (text-based Q&A is covered).
- **Workflow Automation**: Generating project timelines and automated stakeholder updates.
- **Email Integration (Notion Mail)**: AI-powered email client features.

### 11.3 Features Already Implemented
- Basic editor selection actions (Summarize, Fix Grammar).
- **Auto-Apply Edits**: AI can apply edits directly into the active editor file without manual copy-pasting.
- Multiple AI providers support (OpenAI, Anthropic, Gemini, Groq, Ollama).
- AI Sidebar Chat interface with **Multi-Tab Architecture** (create, rename, and pinpoint sessions).
- **Per-ab Context**: Each tab has its own active project context and persona.
- Context mentions (`@` files) and fuzzy searching.
- Vault-wide Q&A (RAG / Vector Indexing) with a global UI toggle.
- **Global Session History**: slide-out drawer to restore previous recent chats into active tabs.
- Dedicated UI plugin settings with polished forms and model selection.

## 12. Acceptance Criteria
- User can trigger AI actions on selected text.
- AI-generated text is correctly inserted into the note.
- API keys can be saved and validated.
- Vault indexing completes successfully and enables basic Q&A.
