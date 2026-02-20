import { App, Plugin, PluginSettingTab, Setting, Editor, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import type { MarkdownFileInfo } from 'obsidian';
import type { AICopilotSettings } from './src/settings/Settings';
import { DEFAULT_SETTINGS } from './src/settings/Settings';
import type { AIProvider } from './src/services/APIService';
import { OpenAIProvider } from './src/services/APIService';
import { AIChatView, VIEW_TYPE_AI_CHAT } from './src/views/AIChatView';
import { EditorHandler } from './src/services/EditorHandler';
import { ContextManager } from './src/services/ContextManager';
import { ToolManager } from './src/services/ToolManager';
import { mount, unmount } from 'svelte';
import SettingsView from './src/settings/SettingsView.svelte';

export default class AICopilotPlugin extends Plugin {
    settings!: AICopilotSettings;
    aiProvider!: AIProvider;
    editorHandler!: EditorHandler;
    contextManager!: ContextManager;
    toolManager!: ToolManager;

    async onload() {
        console.log('🚀 AI Copilot v1.1.1 LOADED - RED BORDER DEBUG');
        new Notice("🚀 AI Copilot v1.1.1 LOADED"); // Visual confirmation
        this.addStatusBarItem().setText("AI Copilot v1.1.1"); // Persistent confirmation
        
        console.log('Docs GPT: Loading plugin...');
        await this.loadSettings();

        // Initialize Services
        this.editorHandler = new EditorHandler(this.app);
        this.contextManager = new ContextManager(this.app);
        this.toolManager = new ToolManager(this.app);
        
        try {
			this.aiProvider = this.getAIProvider();
		} catch (e) {
			console.error('AI Provider Initialization Error:', e);
		}

		// Register Event Listeners for Editor Tracking
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				this.editorHandler.updateActiveLeaf(leaf);
			})
		);

		// Register the Chat View
		this.registerView(
			VIEW_TYPE_AI_CHAT,
			(leaf) => new AIChatView(leaf, this)
		);

		// Add Ribbon Icon to open the Sidebar
		this.addRibbonIcon('bot', 'AI Copilot Chat', (evt: MouseEvent) => {
			this.activateView();
		});

		// Command: Summarize Selection (Legacy)
		this.addCommand({
			id: 'summarize-selection',
			name: 'Summarize Selection',
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				if (!this.aiProvider) {
					new Notice('AI Provider not configured.');
					return;
				}

				const selection = editor.getSelection();
				if (selection) {
					try {
						const summary = await this.aiProvider.summarize(selection);
						editor.replaceSelection(`\n> [!summary]\n> ${summary}\n`);
					} catch (error: any) {
						new Notice(`Error: ${error.message}`);
					}
				}
			},
		});

		// Command to open chat directly
		this.addCommand({
			id: 'open-ai-chat',
			name: 'Open AI Chat',
			callback: () => {
				this.activateView();
			},
		});

		// Register Built-in Action Commands
		this.addTextTransformCommand('expand-selection', 'Expand Selection', 'You are an AI assistant. Expand the provided text by adding more detail, explanations, and context while preserving the original meaning.', 'replace');
		this.addTextTransformCommand('shorten-selection', 'Shorten Selection', 'You are an AI assistant. Shorten the provided text to be much more concise, keeping only the core message.', 'replace');
		this.addTextTransformCommand('tone-professional', 'Change Tone: Professional', 'Rewrite the provided text in a highly professional, polite, and business-appropriate tone.', 'replace');
		this.addTextTransformCommand('tone-casual', 'Change Tone: Casual', 'Rewrite the provided text in a friendly, relaxed, and casual tone.', 'replace');
		this.addTextTransformCommand('tone-academic', 'Change Tone: Academic', 'Rewrite the provided text in a formal academic tone suitable for a research paper or essay.', 'replace');
		this.addTextTransformCommand('brainstorm-ideas', 'Brainstorm Ideas', 'Based on the provided text, brainstorm a list of 5-10 related ideas, bullet points, or next steps.', 'insertBelow');
		this.addTextTransformCommand('continue-writing', 'Continue Writing', 'You are a co-writer. Continue the provided text logically and seamlessly. ONLY output the continuation, do NOT repeat any of the original text.', 'append', false);

		// Register Custom Actions
		this.settings.customActions?.forEach(action => {
			this.addTextTransformCommand(
				`custom-action-${action.id}`, 
				`Custom: ${action.name}`, 
				action.promptTemplate, 
				'replace', 
				true
			);
		});

		// Settings Tab
		this.addSettingTab(new AICopilotSettingTab(this.app, this));
	}

	private addTextTransformCommand(id: string, name: string, systemInstruction: string, actionType: 'replace' | 'insertBelow' | 'append' = 'replace', requiresSelection: boolean = true) {
		this.addCommand({
			id: id,
			name: name,
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				if (!this.aiProvider) {
					new Notice('AI Provider not configured.');
					return;
				}
				const selection = editor.getSelection();
				if (requiresSelection && !selection) {
					new Notice(`Please select some text to run "${name}"`);
					return;
				}
				
				try {
					new Notice(`AI Copilot: ${name}...`);
					
					let contextText = selection;
					if (!requiresSelection && !selection) {
						const cursor = editor.getCursor();
						const startLine = Math.max(0, cursor.line - 50);
						contextText = editor.getRange({line: startLine, ch: 0}, cursor);
					}
					
					const result = await this.aiProvider.executeAction(contextText, systemInstruction);
					
					if (actionType === 'replace' && selection) {
						editor.replaceSelection(result);
					} else if (actionType === 'append') {
						const cursor = editor.getCursor('to');
						editor.replaceRange(result, cursor);
					} else if (actionType === 'insertBelow') {
						const cursor = editor.getCursor('to');
						const newCursor = { line: cursor.line, ch: editor.getLine(cursor.line).length };
						editor.replaceRange(`\n\n${result}`, newCursor);
					} else if (actionType === 'replace' && !selection) {
						// Safety fallback if no selection but somehow triggered
						const cursor = editor.getCursor('to');
						editor.replaceRange(`\n\n${result}`, cursor);
					}
					new Notice(`AI Copilot: ${name} completed.`);
				} catch (error: any) {
					new Notice(`Error: ${error.message}`);
				}
			}
		});
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);

		if (leaves.length > 0) {
			leaf = leaves[0];
			if (leaf) workspace.revealLeaf(leaf);
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({ type: VIEW_TYPE_AI_CHAT, active: true });
				workspace.revealLeaf(leaf);
			}
		}
	}

	onunload() {
		console.log('Docs GPT: Unloading plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		try {
			this.aiProvider = this.getAIProvider();
		} catch (e: any) {
			new Notice(e.message);
		}
	}

	getAIProvider(): AIProvider {
		switch (this.settings.provider) {
			case 'openai':
				return new OpenAIProvider(this.settings);
			default:
				return new OpenAIProvider(this.settings);
		}
	}
}

class AICopilotSettingTab extends PluginSettingTab {
	plugin: AICopilotPlugin;
	component!: ReturnType<typeof mount>;

	constructor(app: App, plugin: AICopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.component = mount(SettingsView, {
			target: containerEl,
			props: {
				settings: this.plugin.settings,
				saveSettings: async () => await this.plugin.saveSettings()
			}
		});
	}

	hide() {
		if (this.component) {
			unmount(this.component);
		}
	}
}
