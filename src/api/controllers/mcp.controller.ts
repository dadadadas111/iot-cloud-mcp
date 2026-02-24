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
   * Get base URL for this server (used for WWW-Authenticate headers)
   */
  private getBaseUrl(req: Request): string {
    // For production servers, always use HTTPS. Check for forwarded protocol first.
    let protocol = req.headers['x-forwarded-proto'] as string;
    
    // If no forwarded protocol, check if this is a production host
    if (!protocol) {
      const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
      protocol = (host.includes('dash.id.vn') || host.includes('localhost') === false) ? 'https' : (req.protocol || 'http');
    }
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3001';
    // Include the global prefix '/api' to match where OAuth endpoints are actually served
    return `${protocol}://${host}/api`;
  }

  /**
   * Send 401 Unauthorized with proper WWW-Authenticate header for MCP spec compliance
   */
  private sendMcpUnauthorized(res: Response, req: Request): void {
    if (!res.headersSent) {
      const baseUrl = this.getBaseUrl(req);
      res.setHeader('WWW-Authenticate', `Bearer realm="MCP", resource="${baseUrl}/.well-known/oauth-protected-resource"`);
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Authorization required. See WWW-Authenticate header for resource metadata.',
        },
        id: null,
      });
    }
  }

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
    const apiKey = req.query['api-key'] as string | undefined;

    
    console.log(`[MCP-DEBUG] === DETAILED REQUEST ANALYSIS ===`);
    console.log(`[MCP-DEBUG] Method: ${req.method}`);
    console.log(`[MCP-DEBUG] Full URL: ${req.url}`);
    console.log(`[MCP-DEBUG] Path: ${req.path}`);
    console.log(`[MCP-DEBUG] Headers:`, {
      'user-agent': req.headers['user-agent'],
      'authorization': req.headers.authorization ? `PRESENT (${req.headers.authorization.substring(0, 20)}...)` : 'MISSING',
      'accept': req.headers.accept,
      'origin': req.headers.origin,
      'referer': req.headers.referer,
      'content-type': req.headers['content-type']
    });
    console.log(`[MCP-DEBUG] Query params:`, req.query);
    console.log(`[MCP-DEBUG] Body:`, req.body);
    console.log(`[MCP-DEBUG] Has API key: ${!!apiKey} (value: ${apiKey ? apiKey.substring(0, 8) + '...' : 'none'})`);
    console.log(`[MCP-DEBUG] Has Auth header: ${!!authHeader}`);
    console.log(`[MCP-DEBUG] Session ID: ${sessionId || 'none'}`);
    // Handle OAuth discovery flow:
    // 1. If no API key AND no OAuth token -> send 401 with WWW-Authenticate to trigger OAuth discovery
    // 2. If API key provided -> use API key auth (current behavior)
    // 3. If OAuth token provided -> validate token
      console.log(`[MCP-DEBUG] 🚨 TRIGGERING OAUTH DISCOVERY: No API key and no auth header`);
      console.log(`[MCP-DEBUG] About to call sendMcpUnauthorized()...`);
      this.sendMcpUnauthorized(res, req);
      console.log(`[MCP-DEBUG] sendMcpUnauthorized() completed`);    

    if (!apiKey || !authHeader) {
      console.log(`[MCP-DEBUG] API KEY OR AUTH HEADER MISSING: apiKey=${!!apiKey}, authHeader=${!!authHeader}`);
      this.sendMcpUnauthorized(res, req);
      return; 
    }

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
        // Update API key for existing session
        await this.mcpService.setSessionApiKey(sessionId, apiKey);
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

        // Set API key for the session
        if (transport.sessionId) {
          await this.mcpService.setSessionApiKey(transport.sessionId, apiKey);
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
