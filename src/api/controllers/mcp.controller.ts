import { Controller, Post, Get, Body, UseGuards, HttpException, HttpStatus, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { User } from '../../shared/decorators/user.decorator';
import { UserContext } from '../../auth/firebase.strategy';
import { McpService } from '../../mcp/services/mcp.service';
import {
  McpRequest,
  McpResponse,
  MCP_METHODS,
  MCP_ERROR_CODES,
  InitializeResponse,
  ListResourcesResponse,
  ReadResourceResponse,
  ListToolsResponse,
  CallToolResponse,
} from '../../mcp/types/mcp.types';

@ApiTags('MCP Protocol')
@Controller('mcp')
export class McpController {
  constructor(private mcpService: McpService) {}

  /**
   * MCP Initialize - Handshake with client
   * POST /api/mcp
   * Body: { "jsonrpc": "2.0", "method": "initialize", "params": {...}, "id": 1 }
   */
  @Post()
  @ApiOperation({
    summary: 'MCP Protocol Handler',
    description:
      'Handles MCP protocol requests. Main entry point for MCP clients. Supports JSON-RPC 2.0',
  })
  @ApiResponse({
    status: 200,
    description: 'MCP response',
  })
  async handleMcpRequest(@Body() request: McpRequest, @Res() res: Response): Promise<void> {
    try {
      const response = await this.processMcpRequest(request);
      res.json(response);
    } catch (error) {
      res.json({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message: error.message || 'Internal server error',
        },
      });
    }
  }

  /**
   * MCP Initialize - Without authentication (first call)
   */
  @Post('initialize')
  @ApiOperation({
    summary: 'Initialize MCP Connection',
    description: 'First step: Initialize connection without authentication',
  })
  async initialize(@Body() request: McpRequest): Promise<McpResponse> {
    if (request.method !== MCP_METHODS.INITIALIZE) {
      throw new HttpException('Invalid method', HttpStatus.BAD_REQUEST);
    }

    const result = this.mcpService.getInitializeResponse();
    return {
      jsonrpc: '2.0',
      id: request.id,
      result,
    };
  }

  /**
   * MCP - Authenticated requests (after initialization)
   */
  @Post('call')
  @UseGuards(FirebaseAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'MCP Authenticated Calls',
    description: 'Handle MCP requests that need authentication (resources/tools)',
  })
  async authenticatedCall(@User() user: UserContext, @Body() request: McpRequest): Promise<McpResponse> {
    return this.processMcpRequest(request, user);
  }

  /**
   * Process MCP request
   */
  private async processMcpRequest(request: McpRequest, user?: UserContext): Promise<McpResponse> {
    // Validate request
    if (!request.jsonrpc || request.jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.INVALID_REQUEST,
          message: 'Invalid JSON-RPC version',
        },
      };
    }

    if (!request.method) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.INVALID_REQUEST,
          message: 'Missing method',
        },
      };
    }

    try {
      let result: any;

      switch (request.method) {
        case MCP_METHODS.INITIALIZE:
          result = this.mcpService.getInitializeResponse();
          break;

        case MCP_METHODS.LIST_RESOURCES:
          if (!user) throw new Error('Authentication required');
          const resources = await this.mcpService.listResources(user);
          result = { resources };
          break;

        case MCP_METHODS.READ_RESOURCE:
          if (!user) throw new Error('Authentication required');
          if (!request.params?.uri) throw new Error('uri parameter required');
          const content = await this.mcpService.readResource(user, request.params.uri);
          result = {
            contents: [
              {
                uri: request.params.uri,
                mimeType: 'application/json',
                text: content,
              },
            ],
          };
          break;

        case MCP_METHODS.LIST_TOOLS:
          const tools = this.mcpService.listTools();
          result = { tools };
          break;

        case MCP_METHODS.CALL_TOOL:
          if (!user) throw new Error('Authentication required');
          if (!request.params?.name) throw new Error('Tool name required');
          result = await this.mcpService.callTool(user, request.params.name, request.params?.args || {});
          break;

        default:
          return {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
              message: `Unknown method: ${request.method}`,
            },
          };
      }

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: MCP_ERROR_CODES.INTERNAL_ERROR,
          message: error.message || 'Internal server error',
        },
      };
    }
  }
}
