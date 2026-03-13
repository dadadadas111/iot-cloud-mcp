import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Headers,
  Req,
  Res,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { SessionManagerService } from './services/session-manager.service';
import { McpServerFactory } from './services/mcp-server.factory';
import { decodeJwt } from '../common/utils/jwt.utils';
import { ConfigService } from '@nestjs/config';
import { AliasService } from '../alias/alias.service';
import { PartnerMetaService } from '../alias/partner-meta.service';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

/**
 * McpController
 * Handles MCP protocol requests with per-tenant server instances.
 * Uses the official SDK StreamableHTTPServerTransport for MCP Streamable HTTP protocol.
 *
 * Endpoints:
 *   POST /mcp/:projectApiKey  — JSON-RPC requests (init + subsequent)
 *   GET  /mcp/:projectApiKey  — SSE stream for server-initiated messages
 *   DELETE /mcp/:projectApiKey — Session termination
 */
@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  /** Active transports keyed by SDK session ID */
  private readonly transports: Map<string, StreamableHTTPServerTransport> = new Map();

  /** Maps SDK session ID → projectApiKey for routing context */
  private readonly sessionProjectMap: Map<string, string> = new Map();

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly serverFactory: McpServerFactory,
    private readonly configService: ConfigService,
    private readonly aliasService: AliasService,
    private readonly partnerMetaService: PartnerMetaService,
  ) {}

  /**
   * Resolves a partner alias to the actual project API key.
   * Sends a 404 JSON-RPC error response and returns null when the alias is unknown.
   */
  private async resolveAlias(alias: string, body: unknown, res: Response): Promise<string | null> {
    const apiKey = await this.aliasService.resolveAlias(alias);
    if (!apiKey) {
      res.status(HttpStatus.NOT_FOUND).json({
        jsonrpc: '2.0',
        error: {
          code: -32004,
          message: `Not Found: Unknown alias '${alias}'`,
        },
        id: (body as Record<string, unknown>)?.id || null,
      });
      return null;
    }
    return apiKey;
  }

  /**
   * Validates Bearer token and returns AuthInfo + userId.
   * Sends 401 response and returns null on failure.
   */
  private validateAuth(
    authorization: string | undefined,
    alias: string,
    body: unknown,
    res: Response,
  ): { authInfo: AuthInfo; userId: string } | null {
    if (!authorization || !authorization.startsWith('Bearer ')) {
      this.logger.warn(`Missing or invalid Authorization header for alias: ${alias}`);
      const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="MCP Gateway", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp/${alias}"`,
      );
      res.status(HttpStatus.UNAUTHORIZED).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Bearer token required',
        },
        id: (body as Record<string, unknown>)?.id || null,
      });
      return null;
    }

    const token = authorization.substring(7);
    try {
      const decoded = decodeJwt(token);
      if (!decoded || !(decoded.sub as string)) {
        throw new Error('Invalid token payload');
      }
      const userId = decoded.sub as string;
      this.logger.debug(`Token decoded - UserId: ${userId}`);

      const authInfo: AuthInfo = {
        token,
        clientId: userId,
        scopes: [],
      };
      return { authInfo, userId };
    } catch (error) {
      this.logger.error(`JWT decode failed for alias ${alias}: ${error.message}`);
      const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
      res.setHeader(
        'WWW-Authenticate',
        `Bearer realm="MCP Gateway", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp/${alias}"`,
      );
      res.status(HttpStatus.UNAUTHORIZED).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Invalid token',
        },
        id: (body as Record<string, unknown>)?.id || null,
      });
      return null;
    }
  }

  /**
   * POST /mcp/:alias
   * Handles MCP JSON-RPC 2.0 requests via StreamableHTTPServerTransport.
   * Creates a new transport + server on initialize requests, reuses existing for subsequent.
   */
  @Post(':alias')
  @ApiOperation({
    summary: 'Handle MCP protocol request',
    description: 'Processes MCP JSON-RPC 2.0 requests via Streamable HTTP transport',
  })
  @ApiResponse({ status: 200, description: 'MCP response (streamed via SSE or JSON)' })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid Bearer token' })
  @ApiResponse({ status: 404, description: 'Not Found - alias not registered' })
  async handleMcpPost(
    @Param('alias') alias: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('mcp-session-id') mcpSessionId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `MCP POST received - Alias: ${alias}, Method: ${req.body?.method || 'unknown'}, SessionId: ${mcpSessionId || 'none'}`,
    );

    // Resolve alias → actual project API key
    const projectApiKey = await this.resolveAlias(alias, req.body, res);
    if (!projectApiKey) return;

    const meta = await this.partnerMetaService.getAliasMeta(alias);

    // Validate auth
    const authResult = this.validateAuth(authorization, alias, req.body, res);
    if (!authResult) return;
    const { authInfo, userId } = authResult;

    // Existing session — reuse transport
    if (mcpSessionId && this.transports.has(mcpSessionId)) {
      const transport = this.transports.get(mcpSessionId)!;
      this.logger.debug(`Reusing transport for session: ${mcpSessionId}`);

      // Set auth on raw request for SDK to pick up
      (req as unknown as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
      await transport.handleRequest(
        req as unknown as IncomingMessage & { auth?: AuthInfo },
        res as unknown as ServerResponse,
        req.body,
      );
      return;
    }

    // New session — must be an initialize request
    if (!mcpSessionId && isInitializeRequest(req.body)) {
      this.logger.log(`Initialize request from userId: ${userId}, project: ${projectApiKey}`);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: async (sessionId: string) => {
          // Store transport and project mapping
          this.transports.set(sessionId, transport);
          this.sessionProjectMap.set(sessionId, projectApiKey);

          // Persist session to Redis
          const server = this.serverFactory.createServer(projectApiKey, meta ?? undefined);
          await this.sessionManager.createSession(projectApiKey, userId, server, sessionId);
          this.logger.log(`Session initialized - SessionId: ${sessionId}, UserId: ${userId}`);
        },
      });

      // Connect McpServer to the transport
      const server = this.serverFactory.createServer(projectApiKey, meta ?? undefined);
      await server.connect(transport);

      // Handle transport close — cleanup maps
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          this.transports.delete(sid);
          this.sessionProjectMap.delete(sid);
          this.logger.log(`Transport closed, session removed: ${sid}`);
        }
      };

      // Set auth on raw request
      (req as unknown as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
      await transport.handleRequest(
        req as unknown as IncomingMessage & { auth?: AuthInfo },
        res as unknown as ServerResponse,
        req.body,
      );
      return;
    }

    // Bad request — not initialize and no valid session
    this.logger.warn(
      `Bad request - no valid session and not an initialize request. SessionId: ${mcpSessionId || 'none'}`,
    );
    res.status(HttpStatus.BAD_REQUEST).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session. Send an initialize request first.',
      },
      id: (req.body as Record<string, unknown>)?.id || null,
    });
  }

  /**
   * GET /mcp/:alias
   * SSE stream for server-initiated messages (notifications, etc.)
   */
  @Get(':alias')
  @ApiOperation({
    summary: 'MCP SSE stream',
    description: 'Server-Sent Events stream for server-initiated MCP messages',
  })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  @ApiResponse({ status: 404, description: 'Not Found - alias not registered' })
  async handleMcpGet(
    @Param('alias') alias: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('mcp-session-id') mcpSessionId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`MCP GET received - Alias: ${alias}, SessionId: ${mcpSessionId || 'none'}`);

    // Resolve alias → actual project API key
    const projectApiKey = await this.resolveAlias(alias, undefined, res);
    if (!projectApiKey) return;

    // Validate auth
    const authResult = this.validateAuth(authorization, alias, undefined, res);
    if (!authResult) return;
    const { authInfo } = authResult;

    if (!mcpSessionId || !this.transports.has(mcpSessionId)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid or missing session ID.',
        },
        id: null,
      });
      return;
    }

    const transport = this.transports.get(mcpSessionId)!;
    (req as unknown as IncomingMessage & { auth?: AuthInfo }).auth = authInfo;
    await transport.handleRequest(
      req as unknown as IncomingMessage & { auth?: AuthInfo },
      res as unknown as ServerResponse,
    );
  }

  /**
   * DELETE /mcp/:alias
   * Terminates an MCP session.
   */
  @Delete(':alias')
  @ApiOperation({
    summary: 'Terminate MCP session',
    description: 'Closes an active MCP session and cleans up resources',
  })
  @ApiResponse({ status: 200, description: 'Session terminated' })
  @ApiResponse({ status: 404, description: 'Not Found - alias not registered' })
  async handleMcpDelete(
    @Param('alias') alias: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('mcp-session-id') mcpSessionId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`MCP DELETE received - Alias: ${alias}, SessionId: ${mcpSessionId || 'none'}`);

    // Resolve alias → actual project API key
    const projectApiKey = await this.resolveAlias(alias, undefined, res);
    if (!projectApiKey) return;

    // Validate auth
    const authResult = this.validateAuth(authorization, alias, undefined, res);
    if (!authResult) return;

    if (!mcpSessionId || !this.transports.has(mcpSessionId)) {
      res.status(HttpStatus.BAD_REQUEST).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: Invalid or missing session ID.',
        },
        id: null,
      });
      return;
    }

    const transport = this.transports.get(mcpSessionId)!;
    await transport.handleRequest(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
    );

    // Cleanup
    await this.sessionManager.deleteSession(projectApiKey, mcpSessionId);
    this.transports.delete(mcpSessionId);
    this.sessionProjectMap.delete(mcpSessionId);
    this.logger.log(`Session terminated: ${mcpSessionId}`);
  }
}
