import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../settings/Settings";

// Polyfill: MCP SDK uses setTimeout(...).unref() which is a Node.js API.
// Obsidian runs in Electron's renderer where setTimeout returns a number.
// Patch it to return an object with .unref()/.ref() no-ops.
const _origSetTimeout = globalThis.setTimeout;
(globalThis as any).setTimeout = function patchedSetTimeout(...args: any[]) {
  const id = _origSetTimeout.apply(globalThis, args as any);
  if (typeof id === 'number') {
    return { [Symbol.toPrimitive]: () => id, unref: () => {}, ref: () => {}, refresh: () => {}, hasRef: () => false, ...({} as any), id } as any;
  }
  return id;
};

export interface MCPToolInfo {
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema: any;
}

export class MCPClientService {
  private clients: Map<string, Client> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();

  constructor() {}

  public async connectServer(config: MCPServerConfig) {
    if (!config.enabled) return;
    
    try {
      console.log(`[MCP] Connecting to server ${config.name}...`);
      const transportOpts: any = {
        command: config.command,
        args: config.args || [],
        env: { ...(process.env as Record<string, string>), ...config.env }
      };
      if (config.cwd) {
        transportOpts.cwd = config.cwd;
      }
      const transport = new StdioClientTransport(transportOpts);

      const client = new Client(
        {
          name: "obsidian-ai-copilot",
          version: "1.0.0",
        },
        {
          capabilities: {}
        }
      );

      await client.connect(transport);
      this.clients.set(config.name, client);
      this.transports.set(config.name, transport);
      console.log(`[MCP] Connected to server ${config.name}`);
    } catch (error) {
      console.error(`[MCP] Failed to connect to server ${config.name}:`, error);
    }
  }

  public async connectAll(configs: MCPServerConfig[]) {
    await this.disconnectAll();
    const promises = configs.filter(c => c.enabled).map(c => this.connectServer(c));
    await Promise.all(promises);
  }

  public async disconnectAll() {
    for (const [name, client] of this.clients.entries()) {
      try {
        await client.close();
      } catch (err) {
        console.error(`[MCP] Error closing client for ${name}:`, err);
      }
    }
    this.clients.clear();
    this.transports.clear();
  }

  public async getAvailableTools(): Promise<MCPToolInfo[]> {
    const allTools: MCPToolInfo[] = [];

    for (const [serverName, client] of this.clients.entries()) {
      try {
        const response = await client.listTools();
        const tools = response.tools || [];
        for (const tool of tools) {
          allTools.push({
            serverName,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });
        }
      } catch (error) {
        console.error(`[MCP] Failed to list tools for server ${serverName}:`, error);
      }
    }

    return allTools;
  }

  public async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP Client for server '${serverName}' not found or not connected.`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });
      return result;
    } catch (error) {
      console.error(`[MCP] Error calling tool '${toolName}' on server '${serverName}':`, error);
      throw error;
    }
  }
}
