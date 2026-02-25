/**
 * Tool Registry Service
 * Registers all available MCP tools with the MCP server
 * Connects tool calls to the ToolExecutorService
 */

import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolExecutorService } from './tool-executor.service';
import { FETCH_USER_TOOL } from '../definitions/fetch-user.tool';

/**
 * Service responsible for registering MCP tools with the MCP server
 * Handles tool discovery and execution delegation
 */
@Injectable()
export class ToolRegistryService {
  constructor(private toolExecutor: ToolExecutorService) {}

  /**
   * Register all available tools with the MCP server
   * Called during server initialization
   *
   * @param mcpServer - McpServer instance (high-level API from MCP SDK v1.26+)
   * @param projectApiKey - Project API key for tool context
   */
  registerTools(mcpServer: McpServer, projectApiKey: string): void {
    // Register fetchUser tool
    mcpServer.registerTool(
      FETCH_USER_TOOL.name,
      {
        description: FETCH_USER_TOOL.metadata.description,
        inputSchema: FETCH_USER_TOOL.schema, // Use Zod schema directly
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(FETCH_USER_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );
  }
}
