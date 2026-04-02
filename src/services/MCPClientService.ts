import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../settings/Settings";
import { readFileSync, accessSync, constants as fsConstants } from "fs";
import { isAbsolute, dirname, resolve, join } from "path";

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
    const content = readFileSync(filePath, 'utf-8');
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

/**
 * Build an augmented PATH that includes common macOS binary directories.
 * Electron apps don't inherit the user's shell PATH, so tools like `node`,
 * `npx`, `python`, etc. are not found unless we explicitly add their dirs.
 */
function getAugmentedEnv(extraEnv: Record<string, string> = {}): Record<string, string> {
  const home = process.env.HOME || '/Users/' + (process.env.USER || 'user');
  const additionalPaths = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
    `${home}/.bun/bin`,
    `${home}/.cargo/bin`,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ];
  const currentPath = process.env.PATH || '';
  const pathSet = new Set(currentPath.split(':'));
  for (const p of additionalPaths) {
    pathSet.add(p);
  }
  return {
    ...(process.env as Record<string, string>),
    ...extraEnv,
    PATH: Array.from(pathSet).join(':'),
  };
}

/**
 * Resolve a bare command name (e.g. "npx") to its absolute path by probing
 * common directories. Returns the original command if not found (let the OS try).
 */
function resolveCommand(cmd: string): string {
  // Already absolute — nothing to do
  if (isAbsolute(cmd)) return cmd;

  const home = process.env.HOME || '/Users/' + (process.env.USER || 'user');
  const searchDirs = [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
    `${home}/.bun/bin`,
    '/usr/bin',
    '/bin',
  ];
  for (const dir of searchDirs) {
    const candidate = join(dir, cmd);
    try {
      accessSync(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // not found here, try next
    }
  }
  return cmd; // fallback to original
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
      console.debug(`[MCP] Connecting to server ${config.name}...`);

      // Sanitize args: strip trailing/leading commas and whitespace from each arg.
      // Users sometimes enter args as "arg1, arg2, arg3" which gets stored with trailing commas.
      const sanitizedArgs = (config.args || [])
        .map(a => a.replace(/^[,\s]+|[,\s]+$/g, ''))
        .filter(a => a.length > 0);

      // Auto-detect server directory from venv command path
      // e.g. /path/to/project/.venv/bin/python → /path/to/project/
      let serverDir = config.cwd || '';
      if (!serverDir && config.command && isAbsolute(config.command)) {
        const venvMatch = config.command.match(/^(.+?)\/(\.?venv)\/bin\//);
        if (venvMatch) {
          serverDir = venvMatch[1];
          console.debug(`[MCP] Auto-detected server dir: ${serverDir}`);
        }
      }

      // Check if a .env file exists in the server directory
      let hasEnvFile = false;
      if (serverDir) {
        try {
          const dotEnvPath = join(serverDir, '.env');
          accessSync(dotEnvPath, fsConstants.R_OK);
          hasEnvFile = true;
          console.debug(`[MCP] Found .env file at ${dotEnvPath}`);
        } catch {
          console.debug(`[MCP] No .env file found in ${serverDir}`);
        }
      }

      let transportOpts: any;

      // Resolve bare command names (e.g. "npx" → "/usr/local/bin/npx")
      const resolvedCommand = resolveCommand(config.command);
      if (resolvedCommand !== config.command) {
        console.debug(`[MCP] Resolved command: ${config.command} → ${resolvedCommand}`);
      }

      if (hasEnvFile && serverDir) {
        // Use shell wrapper to source .env before starting the server.
        // This is the most reliable approach because it uses the native shell
        // to load environment variables, bypassing any Electron-specific
        // issues with fs.readFileSync or process.env inheritance.
        const shellCmd = `cd ${JSON.stringify(serverDir)} && set -a && source .env && set +a && exec ${JSON.stringify(resolvedCommand)} ${sanitizedArgs.map(a => JSON.stringify(a)).join(' ')}`;
        
        console.debug(`[MCP] Using shell wrapper for ${config.name}`);
        transportOpts = {
          command: '/bin/bash',
          args: ['-c', shellCmd],
          env: getAugmentedEnv(config.env),
          stderr: 'pipe' as const,
          cwd: serverDir
        };
      } else {
        // Standard spawn - no .env file needed
        transportOpts = {
          command: resolvedCommand,
          args: sanitizedArgs,
          env: getAugmentedEnv(config.env),
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
      console.debug(`[MCP] ✓ Connected to server ${config.name}`);
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
