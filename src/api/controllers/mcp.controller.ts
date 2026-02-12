import { Controller, All, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpService } from '../../mcp/services/mcp.service';

@ApiTags('MCP Protocol')
@Controller('mcp')
export class McpController {
  // Store transports by session ID (stateful mode)
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(private mcpService: McpService) {}

  /**
   * Main MCP endpoint - handles all HTTP methods
   * GET: Establishes SSE stream for server-to-client messages
   * POST: Receives client-to-server JSON-RPC messages
   * DELETE: Terminates session
   *
   * NO AUTHENTICATION - Clients connect here, then use login tool
   */
  @All()
  @ApiOperation({
    summary: 'MCP Streamable HTTP endpoint',
    description:
      'Main MCP endpoint using official SDK transport. No authentication required - use login tool to authenticate. ' +
      'Supports GET (SSE stream), POST (JSON-RPC messages), DELETE (session termination).',
  })
  @ApiResponse({
    status: 200,
    description: 'Request handled successfully',
  })
  @ApiExcludeEndpoint() // Hide from Swagger since it's a special protocol endpoint
  async handleMcpRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    console.log(`[MCP] ${req.method} request`, {
      sessionId,
      hasBody: !!req.body,
      url: req.url,
    });

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        // Reuse existing transport for this session
        transport = this.transports.get(sessionId)!;
        console.log(`[MCP] Reusing transport for session: ${sessionId}`);
      } else {
        // Create new transport (stateful mode with session management)
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            // Store transport when session is initialized
            console.log(`[MCP] Session initialized: ${newSessionId}`);
            this.transports.set(newSessionId, transport);
          },
        });

        // Set up cleanup handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            console.log(`[MCP] Transport closed for session: ${sid}`);
            this.transports.delete(sid);
          }
        };

        // Connect transport to MCP server
        console.log('[MCP] Creating new transport and connecting to server');
        const server = await this.mcpService.getServer();
        await server.connect(transport);
      }

      // Handle the request using the SDK transport
      // The transport handles SSE streaming, JSON-RPC parsing, session validation, etc.
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[MCP] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }
}
