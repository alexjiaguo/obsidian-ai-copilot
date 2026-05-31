# Skills and PAI Infrastructure Session

This document explains the architecture of the skills system in the Obsidian AI Copilot plugin, the operation of the Personal AI Infrastructure (PAI) system, and details why legacy PAI patterns and formatting (e.g., agent debate behavior, custom headers, and signatures) can persist even after physical files are deleted.

---

## 1. How Skills Work in the Obsidian AI Copilot Plugin

The `SkillService` manages modular, prompt-injectable capabilities (skills) stored on disk. Here is the operational workflow:

### A. Discovery and Indexing
* **Path Scanning**: The plugin scans the configured Skills directory (`/Volumes/Download/ai-skills-hub`) on startup.
* **Skill Identification**: It looks for any subdirectory containing a `SKILL.md` file.
* **Frontmatter Parsing**: It reads the YAML frontmatter at the top of the file to extract the skill's `name` and `description`. These are loaded into an in-memory index.

### B. Runtime Prompt Injection
When you send a message in a chat tab, the plugin builds the system prompt by dynamically injecting skill instructions:
1. **Mandatory Skills**: Any skill marked as **Enabled** and **Mandatory** in settings is always loaded, formatted with a priority header (`=== MANDATORY SKILLS ===`), and appended directly to the system prompt.
2. **Relevant Skills (Keyword Matching)**: For other enabled skills, the plugin runs a keyword-matching score between the words in your prompt and the skills' names and descriptions. It automatically injects the top-scoring skills (up to 2) under a `=== RELEVANT SKILLS ===` header.
3. **Dynamic Tools**: The assistant has access to the `list_skills` and `use_skill` tools, allowing it to look up or load additional skill markdown contents mid-conversation if needed.

---

## 2. What is the PAI (Personal AI Infrastructure) System?

The **PAI (Personal AI Infrastructure)** system is a comprehensive, multi-agent framework designed to govern LLM behaviors, task execution, planning, and structured responses across your AI environments. 

In this Obsidian plugin, PAI is represented as a suite of modular agentic skills (such as `Council`, `THEALGORITHM`, `System`, `Prompting`, and `Telos`) located in the `/Volumes/Download/ai-skills-hub` folder. 

When active, it introduces highly structured response layouts featuring headers like `📋 SUMMARY:`, `🔍 ANALYSIS:`, `⚡ ACTIONS:`, and the `🗣️ PAI:` voice signature.

---

## 3. Why PAI Patterns Still Appear After Deletion

If you deleted PAI folders from the skills hub but still observe the formatting, it is due to three specific root causes:

### Root Cause 1: The "Council" Skill is Mandatory
The **Council** skill (which implements a collaborative-adversarial multi-agent debate workflow) is configured in your settings (`data.json`) as:
* **Enabled**: `true`
* **Mandatory**: `true`

Because it is mandatory, the plugin injects the full `Council/SKILL.md` debate workflow guidelines into **every single prompt** you send. This forces the assistant to behave like a multi-agent council, adopting debate personas and structured logs.

### Root Cause 2: Settings Configuration Cache
The plugin caches settings in your vault under `.obsidian/plugins/obsidian_ai_copilot/data.json` within the `skillConfigs` list. Even if folders are physically deleted from your hard drive, the cached settings remain in this file until they are actively refreshed.

### Root Cause 3: Chat History Mimicry
Large Language Models are highly sensitive to historical context. If an active chat thread contains previous assistant responses structured with `🗣️ PAI:` or `📋 SUMMARY:`, the model reads that history and mimics the structure in all subsequent replies—even if the underlying skill is disabled or removed.

---

## 4. Step-by-Step Guide to Purging PAI Traces

To completely remove the PAI layout, debate behavior, and signatures, follow these steps:

1. **Disable the Council Skill**:
   * Open Obsidian.
   * Go to **Settings** → **AI Copilot** → **Skills**.
   * Locate the **Council** skill.
   * Toggle **Mandatory** to **Off** and toggle **Enabled** to **Off**.

2. **Refresh the Skills Config**:
   * In the same **Skills** settings pane, click the **Refresh** button. 
   * This forces the plugin to re-scan `/Volumes/Download/ai-skills-hub`, sync disk state, and clean out the cached configuration entries for any skills you physically deleted from the folder.

3. **Start a Fresh Chat Session**:
   * Close your current chat tab and open a new chat window.
   * Because the old transcript is gone and the `Council` skill is no longer injected, the AI will default back to your standard assistant persona (e.g., the clean, direct "AI Bro" style) without any PAI headers or signatures.
