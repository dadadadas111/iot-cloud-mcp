import { Controller, All, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpService } from '../../mcp/services/mcp.service';
import { OAuthService } from '../../oauth/oauth.service';

@ApiTags('MCP Protocol')
@Controller('mcp')
export class McpController {
  // Store transports by session ID (stateful mode)
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();

  constructor(
    private mcpService: McpService,
    private oauthService: OAuthService,
  ) {}

  /**
   * Main MCP endpoint - handles all HTTP methods
   * GET: Establishes SSE stream for server-to-client messages
   * POST: Receives client-to-server JSON-RPC messages
   * DELETE: Terminates session
   *
   * Supports both OAuth Bearer tokens and traditional login tool authentication
   */
  @All()
  @ApiOperation({
    summary: 'MCP Streamable HTTP endpoint',
    description:
      'Main MCP endpoint using official SDK transport. Supports OAuth Bearer tokens or login tool authentication. ' +
      'Supports GET (SSE stream), POST (JSON-RPC messages), DELETE (session termination).',
  })
  @ApiResponse({
    status: 200,
    description: 'Request handled successfully',
  })
  @ApiExcludeEndpoint() // Hide from Swagger since it's a special protocol endpoint
  async handleMcpRequest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const authHeader = req.headers.authorization as string | undefined;

    console.log(`[MCP] ${req.method} request`, {
      sessionId,
      hasAuth: !!authHeader,
      hasBody: !!req.body,
      url: req.url,
    });

    // Extract Bearer token if present and validate it
    let oauthToken: { userId: string; token: string } | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      try {
        oauthToken = await this.oauthService.validateAccessToken(token);
        if (oauthToken) {
          console.log(`[MCP] OAuth authentication successful for user: ${oauthToken.userId}`);
        } else {
          console.log(`[MCP] OAuth token validation failed`);
        }
      } catch (error) {
        console.warn(`[MCP] OAuth token validation error:`, error.message);
      }
    }

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

        // Create NEW server instance per transport with OAuth context
        console.log('[MCP] Creating new server instance for transport');
        const server = await this.mcpService.createServer();

        // If OAuth token is present, pre-authenticate the session
        if (oauthToken && transport.sessionId) {
          await this.mcpService.setOAuthSession(transport.sessionId, oauthToken);
        }

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
