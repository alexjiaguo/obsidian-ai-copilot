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

      // Auto-detect server directory from venv command path
      // e.g. /path/to/project/.venv/bin/python → /path/to/project/
      let serverDir = config.cwd || '';
      if (!serverDir && config.command && path.isAbsolute(config.command)) {
        const venvMatch = config.command.match(/^(.+?)\/(\.?venv)\/bin\//);
        if (venvMatch) {
          serverDir = venvMatch[1];
          console.log(`[MCP] Auto-detected server dir: ${serverDir}`);
        }
      }

      // Check if a .env file exists in the server directory
      let hasEnvFile = false;
      if (serverDir) {
        try {
          const dotEnvPath = path.join(serverDir, '.env');
          fs.accessSync(dotEnvPath, fs.constants.R_OK);
          hasEnvFile = true;
          console.log(`[MCP] Found .env file at ${dotEnvPath}`);
        } catch {
          console.log(`[MCP] No .env file found in ${serverDir}`);
        }
      }

      let transportOpts: any;

      if (hasEnvFile && serverDir) {
        // Use shell wrapper to source .env before starting the server.
        // This is the most reliable approach because it uses the native shell
        // to load environment variables, bypassing any Electron-specific
        // issues with fs.readFileSync or process.env inheritance.
        const args = config.args || [];
        const shellCmd = `cd ${JSON.stringify(serverDir)} && set -a && source .env && set +a && exec ${JSON.stringify(config.command)} ${args.map(a => JSON.stringify(a)).join(' ')}`;
        
        console.log(`[MCP] Using shell wrapper for ${config.name}`);
        transportOpts = {
          command: '/bin/bash',
          args: ['-c', shellCmd],
          env: { ...(process.env as Record<string, string>), ...config.env },
          stderr: 'pipe' as const,
          cwd: serverDir
        };
      } else {
        // Standard spawn - no .env file needed
        transportOpts = {
          command: config.command,
          args: config.args || [],
          env: { ...(process.env as Record<string, string>), ...config.env },
          stderr: 'pipe' as const
        };
        if (serverDir) {
          transportOpts.cwd = serverDir;
        }
      }

      const transport = new StdioClientTransport(transportOpts);

      // Capture stderr for debugging
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
