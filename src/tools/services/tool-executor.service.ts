/**
 * Tool Executor Service
 * Executes MCP tools by routing to appropriate service methods
 * Handles authentication via JWT tokens and formats responses for MCP
 */

import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { IotApiService } from '../../proxy/services/iot-api.service';
import { decodeJwt, extractBearerToken, getUserIdFromToken } from '../../common/utils/jwt.utils';
import { FETCH_USER_TOOL, FetchUserParams } from '../definitions/fetch-user.tool';

/** Context for tool execution containing request metadata */
interface ToolContext {
  authorization?: string;
  projectApiKey?: string;
  meta?: Record<string, unknown>;
}

/**
 * Service responsible for executing registered MCP tools
 * Extracts user context from JWT tokens and delegates to service layer
 */
@Injectable()
export class ToolExecutorService {
  constructor(private iotApiService: IotApiService) {}

  /**
   * Execute a tool with given parameters and context
   * Handles authentication, service delegation, and response formatting
   *
   * @param toolName - Name of the tool to execute
   * @param params - Tool parameters
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted response
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (toolName === FETCH_USER_TOOL.name) {
      return this.executeFetchUser(params as FetchUserParams, context);
    }

    throw new BadRequestException(`Unknown tool: ${toolName}`);
  }

  /**
   * Execute fetchUser tool
   * Extracts userId from Bearer token and fetches user data from IoT API
   *
   * @param params - Empty object (tool requires no parameters)
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted user data response
   */
  private async executeFetchUser(
    params: FetchUserParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      // Extract and decode JWT token to get userId
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      // Fetch user data from IoT API using userId
      const userData = await this.iotApiService.fetchUser(
        context.projectApiKey || 'unknown',
        userId,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(userData),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }
}
