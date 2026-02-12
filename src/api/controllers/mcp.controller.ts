import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { McpService } from '../../mcp/services/mcp.service';
import { McpRequest, McpResponse, MCP_METHODS, MCP_ERROR_CODES } from '../../mcp/types/mcp.types';

@ApiTags('MCP Protocol')
@Controller('mcp')
export class McpController {
  constructor(private mcpService: McpService) {}

  /**
   * MCP SSE Endpoint - Main entry point for MCP clients
   * GET /api/mcp/sse
   * NO AUTHENTICATION - Clients connect here first, then use login tool
   */
  @Get('sse')
  @ApiOperation({
    summary: 'MCP Protocol SSE Stream',
    description:
      'Server-Sent Events endpoint for MCP clients. No authentication required. Use the login tool to authenticate.',
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established',
  })
  async streamMcpEvents(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Store connection state
    const connectionState = {
      token: null as string | null,
      userId: null as string | null,
    };

    try {
      // Send initialization
      this.sendSSEMessage(res, 'message', {
        jsonrpc: '2.0',
        result: this.mcpService.getInitializeResponse(),
      });

      // Send available tools (including login)
      const tools = this.mcpService.listTools();
      this.sendSSEMessage(res, 'message', {
        jsonrpc: '2.0',
        result: { tools },
      });

      // Send ready signal
      this.sendSSEMessage(res, 'message', {
        jsonrpc: '2.0',
        result: {
          status: 'ready',
          toolCount: tools.length,
          message: 'Use the login tool to authenticate',
        },
      });

      // Handle incoming MCP requests
      req.on('data', async (chunk) => {
        try {
          const request = JSON.parse(chunk.toString()) as McpRequest;
          const response = await this.processMcpRequest(request, connectionState);
          this.sendSSEMessage(res, 'message', response);
        } catch (error) {
          this.sendSSEMessage(res, 'error', {
            jsonrpc: '2.0',
            error: {
              code: MCP_ERROR_CODES.PARSE_ERROR,
              message: error.message || 'Failed to parse request',
            },
          });
        }
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(': keep-alive\n\n');
      }, 30000);

      // Cleanup on disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
        res.end();
      });
    } catch (error) {
      this.sendSSEMessage(res, 'error', {
        error: error.message || 'Stream error',
      });
      res.end();
    }
  }

  /**
   * MCP JSON-RPC Handler - Alternative POST endpoint
   * POST /api/mcp
   */
  @Post()
  @ApiOperation({
    summary: 'MCP JSON-RPC Handler',
    description: 'Handle MCP requests via POST. Use the login tool first to authenticate.',
  })
  @ApiResponse({
    status: 200,
    description: 'MCP response',
  })
  async handleMcpRequest(@Body() request: McpRequest, @Res() res: Response): Promise<void> {
    // Store connection state (for POST requests, state is per-request)
    const connectionState = {
      token: null as string | null,
      userId: null as string | null,
    };

    try {
      const response = await this.processMcpRequest(request, connectionState);
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
   * Helper: Send SSE formatted message
   */
  private sendSSEMessage(res: Response, eventType: string, data: any): void {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  }

  /**
   * Process MCP request
   */
  private async processMcpRequest(
    request: McpRequest,
    connectionState: { token: string | null; userId: string | null },
  ): Promise<McpResponse> {
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

        case MCP_METHODS.LIST_TOOLS:
          const tools = this.mcpService.listTools();
          result = { tools };
          break;

        case MCP_METHODS.CALL_TOOL:
          if (!request.params?.name) throw new Error('Tool name required');
          result = await this.mcpService.callTool(
            request.params.name,
            request.params?.arguments || {},
            connectionState,
          );
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
