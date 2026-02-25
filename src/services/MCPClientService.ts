import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../settings/Settings";
import * as fs from "fs";
import * as path from "path";

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

/**
 * Parse a .env file into a key-value Record.
 * Handles: KEY=VALUE, KEY="VALUE", KEY='VALUE', comments (#), empty lines.
 */
function parseDotEnv(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  } catch {
    // .env file doesn't exist or can't be read — that's fine
  }
  return result;
}

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

      // Build environment: start with process.env, merge .env file (if cwd has one), then user overrides
      let envVars: Record<string, string> = { ...(process.env as Record<string, string>) };

      // Auto-load .env from cwd directory if it exists
      if (config.cwd) {
        const dotEnvPath = path.join(config.cwd, '.env');
        const dotEnvVars = parseDotEnv(dotEnvPath);
        if (Object.keys(dotEnvVars).length > 0) {
          console.log(`[MCP] Loaded ${Object.keys(dotEnvVars).length} vars from ${dotEnvPath}`);
          envVars = { ...envVars, ...dotEnvVars };
        }
      }

      // User-configured env vars take highest priority
      if (config.env && Object.keys(config.env).length > 0) {
        envVars = { ...envVars, ...config.env };
      }

      const transportOpts: any = {
        command: config.command,
        args: config.args || [],
        env: envVars,
        stderr: 'pipe' as const
      };
      if (config.cwd) {
        transportOpts.cwd = config.cwd;
      }
      
      console.log(`[MCP] Spawning: ${config.command} ${(config.args || []).join(' ')}${config.cwd ? ' (cwd: ' + config.cwd + ')' : ''}`);
      const transport = new StdioClientTransport(transportOpts);

      // Capture stderr for debugging — this shows Python tracebacks, missing modules, etc.
      if (transport.stderr) {
        transport.stderr.on('data', (chunk: Buffer) => {
          console.warn(`[MCP] ${config.name} stderr:`, chunk.toString().trim());
        });
      }

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
      console.log(`[MCP] ✓ Connected to server ${config.name}`);
    } catch (error) {
      console.error(`[MCP] ✗ Failed to connect to server ${config.name}:`, error);
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
