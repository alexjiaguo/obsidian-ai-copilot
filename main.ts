import { App, Plugin, PluginSettingTab, Setting, Editor, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { AICopilotSettings, DEFAULT_SETTINGS } from './src/settings/Settings';
import { AIProvider, OpenAIProvider } from './src/services/APIService';
import { AIChatView, VIEW_TYPE_AI_CHAT } from './src/views/AIChatView';
import { EditorHandler } from './src/services/EditorHandler';
import { ContextManager } from './src/services/ContextManager';
import { ToolManager } from './src/services/ToolManager';
import { mount, unmount } from 'svelte';
import SettingsView from './src/settings/SettingsView.svelte';

export default class AICopilotPlugin extends Plugin {
    settings: AICopilotSettings;
    aiProvider: AIProvider;
    editorHandler: EditorHandler;
    contextManager: ContextManager;
    toolManager: ToolManager;

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
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				if (!this.aiProvider) {
					new Notice('AI Provider not configured.');
					return;
				}

				const selection = editor.getSelection();
				if (selection) {
					try {
						const summary = await this.aiProvider.summarize(selection);
						editor.replaceSelection(`\n> [!summary]\n> ${summary}\n`);
					} catch (error) {
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

		// Settings Tab
		this.addSettingTab(new AICopilotSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);

		if (leaves.length > 0) {
			leaf = leaves[0];
			workspace.revealLeaf(leaf);
		} else {
			leaf = workspace.getRightLeaf(false);
			await leaf.setViewState({ type: VIEW_TYPE_AI_CHAT, active: true });
			workspace.revealLeaf(leaf);
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
		} catch (e) {
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
	component: ReturnType<typeof mount>;

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
