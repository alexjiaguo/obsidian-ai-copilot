import { App, Plugin, PluginSettingTab, Setting, Editor, MarkdownView, Notice, WorkspaceLeaf, TFile, TFolder } from 'obsidian';
import type { MarkdownFileInfo } from 'obsidian';
import type { AICopilotSettings } from './src/settings/Settings';
import { DEFAULT_SETTINGS } from './src/settings/Settings';
import type { AIProvider } from './src/services/APIService';
import { OpenAIProvider } from './src/services/APIService';
import { AIChatView, VIEW_TYPE_AI_CHAT } from './src/views/AIChatView';
import { EditorHandler } from './src/services/EditorHandler';
import { ContextManager } from './src/services/ContextManager';
import { ToolManager } from './src/services/ToolManager';
import { VaultQA } from './src/services/VaultQA';
import { MemoryService } from './src/services/MemoryService';
import { RelevantNotes } from './src/services/RelevantNotes';
import { SkillService } from './src/services/SkillService';
import { MCPClientService } from './src/services/MCPClientService';
import { PersonaSoulService } from './src/services/PersonaSoulService';
import { mount, unmount } from 'svelte';
import SettingsView from './src/settings/SettingsView.svelte';

export default class AICopilotPlugin extends Plugin {
    settings!: AICopilotSettings;
    aiProvider!: AIProvider;
    editorHandler!: EditorHandler;
    contextManager!: ContextManager;
    toolManager!: ToolManager;
    vaultQA!: VaultQA;
    memoryService!: MemoryService;
    relevantNotes!: RelevantNotes;
    skillService!: SkillService;
    mcpClientService!: MCPClientService;
    personaSoulService!: PersonaSoulService;

    async onload() {
        console.log('🚀 AI Copilot v1.3.0 LOADED');
        new Notice("🚀 AI Copilot v1.3.0 LOADED");
        this.addStatusBarItem().setText("AI Copilot v1.3.0");
        
        console.log('Docs GPT: Loading plugin...');
        await this.loadSettings();

        // Initialize Services
        this.editorHandler = new EditorHandler(this.app);
        this.contextManager = new ContextManager(this.app);
        this.vaultQA = new VaultQA(this.app, this.settings);
        this.memoryService = new MemoryService(this.app);
        this.relevantNotes = new RelevantNotes(this.app, this.vaultQA);
        this.skillService = new SkillService(this.app, this.settings.skillsPath);
        this.mcpClientService = new MCPClientService();
        this.mcpClientService.connectAll(this.settings.mcpServers || []).catch(e => console.error("MCP Connect Error", e));
        this.personaSoulService = new PersonaSoulService(this.app);
        this.toolManager = new ToolManager(this.app, this.memoryService, this.vaultQA, this.mcpClientService, undefined, this.skillService, this.personaSoulService, this.settings);
        
        try {
			this.aiProvider = this.getAIProvider();
			// Wire AI provider into ToolManager for URL summarization
			this.toolManager.setAIProvider(this.aiProvider);
		} catch (e) {
			console.error('AI Provider Initialization Error:', e);
		}

		// Register Event Listeners for Editor Tracking
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', (leaf) => {
				this.editorHandler.updateActiveLeaf(leaf);
			})
		);

		// Register Right-Click Context Menu
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const selection = editor.getSelection();
				const hasSelection = selection && selection.trim().length > 0;
				const filePath = view.file?.basename || 'unknown';

				// Add selection to chat context
				menu.addItem((item) => {
					item
						.setTitle('Add selection to chat context')
						.setIcon('message-square-plus')
						.setDisabled(!hasSelection)
						.onClick(async () => {
							if (!selection) return;
							await this.activateView();
							const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);
							if (leaves.length > 0) {
								const chatView = leaves[0].view as AIChatView;
								setTimeout(() => {
									chatView.addSelectionContext(selection, filePath);
									new Notice('📋 Selection added to AI Chat');
								}, 100);
							}
						});
				});

				// Copilot submenu with quick actions
				menu.addItem((item) => {
					const sub = (item as any)
						.setTitle('AI Copilot')
						.setIcon('bot');

					if ((item as any).setSubmenu) {
						const submenu = (item as any).setSubmenu();

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Fix grammar and spelling')
								.setIcon('check-circle')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Fix all grammar and spelling errors in the text. Only output the corrected text, nothing else.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Reformat')
								.setIcon('text')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Reformat and restructure the following text to improve readability. Use proper paragraphs, headings (if appropriate), bullet points, and logical flow. Preserve all the original information but make it well-organized and easy to scan. Only output the reformatted text, nothing else.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Summarize')
								.setIcon('align-left')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Summarize this text concisely. Only output the summary.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Simplify')
								.setIcon('minimize')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Simplify this text to make it easier to understand. Only output the simplified text.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Make shorter')
								.setIcon('scissors')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Make this text significantly shorter while keeping the core meaning. Only output the shortened text.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Make longer')
								.setIcon('expand')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Expand this text with more detail and explanation. Only output the expanded text.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Change tone')
								.setIcon('megaphone')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Rewrite this text in a more professional and polished tone. Keep the same meaning but adjust the style to be clear, confident, and well-written. Only output the rewritten text.'));
						});

						submenu.addItem((subItem: any) => {
							subItem
								.setTitle('Explain like I am 5')
								.setIcon('baby')
								.setDisabled(!hasSelection)
								.onClick(() => this.runQuickAction(editor, selection!, 'Explain this text as if you are talking to a 5 year old. Use simple words and short sentences. Only output the explanation.'));
						});
					}
				});
			})
		);

		// Register File Explorer Right-Click Menu (files and folders)
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, fileOrFolder) => {
				const isFolder = fileOrFolder instanceof TFolder;
				const label = isFolder ? 'Send folder to AI Copilot' : 'Send to AI Copilot';

				menu.addItem((item) => {
					item
						.setTitle(label)
						.setIcon('bot')
						.onClick(async () => {
							await this.activateView();
							const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);
							if (leaves.length > 0) {
								const chatView = leaves[0].view as AIChatView;
								setTimeout(() => {
									if (isFolder) {
										chatView.addFolderContext(fileOrFolder.path, fileOrFolder.name);
										new Notice(`📁 Folder "${fileOrFolder.name}" added to AI Chat`);
									} else if (fileOrFolder instanceof TFile) {
										chatView.addFileContext(fileOrFolder.path, fileOrFolder.basename);
										new Notice(`📄 "${fileOrFolder.basename}" added to AI Chat`);
									}
								}, 100);
							}
						});
				});
			})
		);

		// Add Commands and Hotkeys
		this.addCommand({
			id: 'add-selection-to-chat',
			name: 'Add selection to chat context',
			hotkeys: [{ modifiers: ["Mod"], key: "L" }],
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (!selection) return;
				const filePath = view.file?.basename || 'unknown';
				await this.activateView();
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);
				if (leaves.length > 0) {
					const chatView = leaves[0].view as AIChatView;
					setTimeout(() => {
						chatView.addSelectionContext(selection, filePath);
						new Notice('📋 Selection added to AI Chat');
					}, 100);
				}
			}
		});

		this.addCommand({
			id: 'open-chat-quick-command',
			name: 'Open AI Copilot Chat',
			hotkeys: [{ modifiers: ["Mod"], key: "K" }],
			callback: async () => {
				await this.activateView();
			}
		});

		this.addCommand({
			id: 'index-vault-qa',
			name: 'Index Vault for QA',
			callback: async () => {
				await this.vaultQA.indexVault();
			}
		});

		// Tool registration

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

		// Command to send selected text to chat
		this.addCommand({
			id: 'send-selection-to-chat',
			name: 'Send Selection to Chat',
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				const selection = editor.getSelection();
				if (!selection) {
					new Notice('Please select some text first.');
					return;
				}

				// Get file path
				const filePath = (ctx instanceof MarkdownView && ctx.file)
					? ctx.file.basename
					: 'unknown';

				// Open or focus the chat view
				await this.activateView();

				// Find the chat view and inject the selection
				const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_CHAT);
				if (leaves.length > 0) {
					const chatView = leaves[0].view as AIChatView;
					// Small delay to ensure view is mounted
					setTimeout(() => {
						chatView.addSelectionContext(selection, filePath);
						new Notice(`📋 Selection added to AI Chat`);
					}, 100);
				}
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

	private async runQuickAction(editor: Editor, text: string, instruction: string) {
		if (!this.aiProvider) {
			new Notice('AI Provider not configured.');
			return;
		}
		try {
			new Notice('AI Copilot: Processing...');
			const result = await this.aiProvider.executeAction(text, instruction);
			editor.replaceSelection(result);
			new Notice('AI Copilot: Done!');
		} catch (error: any) {
			new Notice(`Error: ${error.message}`);
		}
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

		// Focus the chat input after a short delay to ensure the view is mounted
		if (leaf) {
			setTimeout(() => {
				const chatView = leaf!.view as AIChatView;
				if (chatView && typeof chatView.focusChatInput === 'function') {
					chatView.focusChatInput();
				}
			}, 150);
		}
	}

	async onunload() {
		console.log('Docs GPT: Unloading plugin');
		if (this.mcpClientService) {
			await this.mcpClientService.disconnectAll();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		try {
			this.aiProvider = this.getAIProvider();
			this.toolManager.setAIProvider(this.aiProvider);
		} catch (e: any) {
			new Notice(e.message);
		}
	}

	/** Reconnect MCP servers — call this only when MCP config changes, not on every save */
	async reconnectMCPServers() {
		if (this.mcpClientService) {
			try {
				await this.mcpClientService.connectAll(this.settings.mcpServers || []);
			} catch (e: any) {
				console.error("MCP Connect Error", e);
			}
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
				saveSettings: async () => await this.plugin.saveSettings(),
				plugin: this.plugin
			}
		});
	}

	hide() {
		if (this.component) {
			unmount(this.component);
		}
	}
}
