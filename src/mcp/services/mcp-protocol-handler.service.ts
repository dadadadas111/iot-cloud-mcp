/**
 * MCP Protocol Handler Service
 * Implements manual MCP JSON-RPC 2.0 protocol handling
 * Handles: initialize, tools/list, tools/call methods
 */

import { Injectable, Logger } from '@nestjs/common';
import { ToolExecutorService } from '../../tools/services/tool-executor.service';
import { FETCH_USER_TOOL } from '../../tools/definitions/fetch-user.tool';

/**
 * MCP JSON-RPC Request
 */
interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

/**
 * MCP JSON-RPC Response
 */
interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Service handling MCP protocol methods manually
 * Provides direct method implementations without SDK transport layer
 */
@Injectable()
export class McpProtocolHandlerService {
  private readonly logger = new Logger(McpProtocolHandlerService.name);

  constructor(private readonly toolExecutor: ToolExecutorService) {}

  /**
   * Handle MCP JSON-RPC 2.0 request
   * Routes to appropriate method handler
   *
   * @param request - MCP JSON-RPC request
   * @param context - Request context (authorization, projectApiKey)
   * @returns MCP JSON-RPC response
   */
  async handleRequest(
    request: McpRequest,
    context: { authorization?: string; projectApiKey: string; mcpServer?: any },
  ): Promise<McpResponse> {
    const { method, id, params } = request;

    this.logger.debug(`Handling MCP method: ${method}`);

    try {
      let result: any;

      switch (method) {
        case 'initialize':
          result = await this.handleInitialize(params);
          break;

        case 'tools/list':
          result = await this.handleToolsList(context.mcpServer);
          break;

        case 'tools/call':
          result = await this.handleToolsCall(params, context);
          break;

        case 'ping':
          result = {}; // Simple ping response
          break;

        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: `Method not found: ${method}`,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id,
        result,
      };
    } catch (error) {
      this.logger.error(`Error handling method ${method}: ${error.message}`, error.stack);
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message,
        },
      };
    }
  }

  /**
   * Handle initialize method
   * Returns server capabilities and protocol version
   *
   * @param params - Initialize parameters from client
   * @returns Initialize result with server info
   */
  private async handleInitialize(params: any): Promise<any> {
    this.logger.log('Client initialize request received');

    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: 'iot-cloud-mcp-gateway',
        version: '1.0.0',
      },
    };
  }

  /**
   * Handle tools/list method
   * Returns list of available tools from the McpServer instance
   *
   * @param mcpServer - McpServer instance with registered tools
   * @returns List of tools with schemas
   */
  private async handleToolsList(mcpServer?: any): Promise<any> {
    this.logger.debug('Tools list requested');

    // If mcpServer is provided, extract registered tools from it
    if (mcpServer && mcpServer._registeredTools) {
      const tools = Object.entries(mcpServer._registeredTools)
        .filter(([, tool]: [string, any]) => tool.enabled !== false)
        .map(([name, tool]: [string, any]) => ({
          name,
          description: tool.description || tool.title || '',
          inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        }));

      this.logger.log(`Returning ${tools.length} registered tools`);

      return {
        tools,
      };
    }

    // Fallback to hardcoded tool (should not happen in normal operation)
    this.logger.warn('McpServer not provided, falling back to hardcoded tool');

    return {
      tools: [
        {
          name: FETCH_USER_TOOL.name,
          description: FETCH_USER_TOOL.description,
          inputSchema: FETCH_USER_TOOL.inputSchema,
        },
      ],
    };
  }

  /**
   * Handle tools/call method
   * Executes a tool with given parameters
   *
   * @param params - Tool call parameters { name, arguments }
   * @param context - Request context with authorization
   * @returns Tool execution result
   */
  private async handleToolsCall(
    params: any,
    context: { authorization?: string; projectApiKey: string },
  ): Promise<any> {
    const { name, arguments: args } = params;

    this.logger.log(`Tool call requested: ${name}`);

    if (!name) {
      throw new Error('Tool name is required');
    }

    // Execute tool through tool executor
    const result = await this.toolExecutor.executeTool(name, args || {}, {
      authorization: context.authorization,
      projectApiKey: context.projectApiKey,
    });

    return result;
  }
}
