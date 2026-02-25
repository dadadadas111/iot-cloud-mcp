/**
 * Tool Registry Service
 * Registers all available MCP tools with the MCP server
 * Connects tool calls to the ToolExecutorService
 */

import { Injectable } from '@nestjs/common';
import { ToolExecutorService } from './tool-executor.service';
import { FETCH_USER_TOOL } from '../definitions/fetch-user.tool';

/**
 * Interface for MCP Server tool registration
 * Minimal interface reflecting the MCP SDK v1.26+ API
 */
interface McpToolRegistry {
  tool(name: string, config: Record<string, unknown>, handler: Function): void;
}

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
   * @param mcpServer - MCP server instance with tool() registration method
   * @param projectApiKey - Project API key for tool context
   */
  registerTools(mcpServer: McpToolRegistry, projectApiKey: string): void {
    // Register fetchUser tool
    mcpServer.tool(
      FETCH_USER_TOOL.name,
      {
        inputSchema: FETCH_USER_TOOL.inputSchema,
        ...FETCH_USER_TOOL.metadata,
      },
      async (params: Record<string, unknown>, context: Record<string, unknown>) => {
        return this.toolExecutor.executeTool(FETCH_USER_TOOL.name, params, {
          authorization: context.authorization as string,
          projectApiKey,
          meta: context as Record<string, unknown>,
        });
      },
    );
  }
}
