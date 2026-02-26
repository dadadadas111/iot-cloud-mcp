/**
 * Tool Registry Service
 * Registers all available MCP tools with the MCP server
 * Connects tool calls to the ToolExecutorService
 */

import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolExecutorService } from './tool-executor.service';
import { FETCH_USER_TOOL } from '../definitions/fetch-user.tool';
import { SEARCH_TOOL } from '../definitions/search.tool';
import { FETCH_TOOL } from '../definitions/fetch.tool';
import { LIST_DEVICES_TOOL } from '../definitions/list-devices.tool';
import { LIST_LOCATIONS_TOOL } from '../definitions/list-locations.tool';
import { LIST_GROUPS_TOOL } from '../definitions/list-groups.tool';
import { GET_DEVICE_TOOL } from '../definitions/get-device.tool';
import { UPDATE_DEVICE_TOOL } from '../definitions/update-device.tool';
import { DELETE_DEVICE_TOOL } from '../definitions/delete-device.tool';
import { GET_DEVICE_STATE_TOOL } from '../definitions/get-device-state.tool';
import { GET_LOCATION_STATE_TOOL } from '../definitions/get-location-state.tool';
import { GET_DEVICE_STATE_BY_MAC_TOOL } from '../definitions/get-device-state-by-mac.tool';
import { CONTROL_DEVICE_TOOL } from '../definitions/control-device.tool';
import { CONTROL_DEVICE_SIMPLE_TOOL } from '../definitions/control-device-simple.tool';
import { GET_DEVICE_DOCUMENTATION_TOOL } from '../definitions/get-device-documentation.tool';

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

    // Register search tool
    mcpServer.registerTool(
      SEARCH_TOOL.name,
      {
        description: SEARCH_TOOL.metadata.description,
        inputSchema: SEARCH_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(SEARCH_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register fetch tool
    mcpServer.registerTool(
      FETCH_TOOL.name,
      {
        description: FETCH_TOOL.metadata.description,
        inputSchema: FETCH_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(FETCH_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register list_devices tool
    mcpServer.registerTool(
      LIST_DEVICES_TOOL.name,
      {
        description: LIST_DEVICES_TOOL.metadata.description,
        inputSchema: LIST_DEVICES_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(LIST_DEVICES_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register list_locations tool
    mcpServer.registerTool(
      LIST_LOCATIONS_TOOL.name,
      {
        description: LIST_LOCATIONS_TOOL.metadata.description,
        inputSchema: LIST_LOCATIONS_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(LIST_LOCATIONS_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register list_groups tool
    mcpServer.registerTool(
      LIST_GROUPS_TOOL.name,
      {
        description: LIST_GROUPS_TOOL.metadata.description,
        inputSchema: LIST_GROUPS_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(LIST_GROUPS_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register get_device tool
    mcpServer.registerTool(
      GET_DEVICE_TOOL.name,
      {
        description: GET_DEVICE_TOOL.metadata.description,
        inputSchema: GET_DEVICE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(GET_DEVICE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register update_device tool
    mcpServer.registerTool(
      UPDATE_DEVICE_TOOL.name,
      {
        description: UPDATE_DEVICE_TOOL.metadata.description,
        inputSchema: UPDATE_DEVICE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(UPDATE_DEVICE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register delete_device tool
    mcpServer.registerTool(
      DELETE_DEVICE_TOOL.name,
      {
        description: DELETE_DEVICE_TOOL.metadata.description,
        inputSchema: DELETE_DEVICE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(DELETE_DEVICE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register get_device_state tool
    mcpServer.registerTool(
      GET_DEVICE_STATE_TOOL.name,
      {
        description: GET_DEVICE_STATE_TOOL.metadata.description,
        inputSchema: GET_DEVICE_STATE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(GET_DEVICE_STATE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register get_location_state tool
    mcpServer.registerTool(
      GET_LOCATION_STATE_TOOL.name,
      {
        description: GET_LOCATION_STATE_TOOL.metadata.description,
        inputSchema: GET_LOCATION_STATE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(GET_LOCATION_STATE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register get_device_state_by_mac tool
    mcpServer.registerTool(
      GET_DEVICE_STATE_BY_MAC_TOOL.name,
      {
        description: GET_DEVICE_STATE_BY_MAC_TOOL.metadata.description,
        inputSchema: GET_DEVICE_STATE_BY_MAC_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(GET_DEVICE_STATE_BY_MAC_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register control_device tool
    mcpServer.registerTool(
      CONTROL_DEVICE_TOOL.name,
      {
        description: CONTROL_DEVICE_TOOL.metadata.description,
        inputSchema: CONTROL_DEVICE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(CONTROL_DEVICE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register control_device_simple tool
    mcpServer.registerTool(
      CONTROL_DEVICE_SIMPLE_TOOL.name,
      {
        description: CONTROL_DEVICE_SIMPLE_TOOL.metadata.description,
        inputSchema: CONTROL_DEVICE_SIMPLE_TOOL.schema,
      },
      async (params: Record<string, unknown>, extra) => {
        return this.toolExecutor.executeTool(CONTROL_DEVICE_SIMPLE_TOOL.name, params, {
          authorization: extra.sessionId || '',
          projectApiKey,
          meta: extra as Record<string, unknown>,
        });
      },
    );

    // Register get_device_documentation tool (read-only)
    mcpServer.registerTool(
      GET_DEVICE_DOCUMENTATION_TOOL.name,
      {
        description: GET_DEVICE_DOCUMENTATION_TOOL.metadata.description,
        inputSchema: GET_DEVICE_DOCUMENTATION_TOOL.schema,
      },
      async (params: Record<string, unknown>) => {
        // Documentation tool doesn't need auth - it's read-only
        const { topic } = params as { topic: string };
        const content = GET_DEVICE_DOCUMENTATION_TOOL.execute(topic);
        return {
          content: [
            {
              type: 'text' as const,
              text: content,
            },
          ],
        };
      },
    );
  }
}
