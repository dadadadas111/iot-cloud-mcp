import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  UnauthorizedException,
  Logger,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { SessionManagerService } from './services/session-manager.service';
import { McpServerFactory } from './services/mcp-server.factory';
import { McpProtocolHandlerService } from './services/mcp-protocol-handler.service';
import { decodeJwt } from '../common/utils/jwt.utils';

/**
 * McpController
 * Handles MCP protocol requests with per-tenant server instances.
 * Supports streamable HTTP transport for MCP JSON-RPC 2.0 protocol.
 */
@ApiTags('MCP')
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly sessionManager: SessionManagerService,
    private readonly serverFactory: McpServerFactory,
    private readonly protocolHandler: McpProtocolHandlerService,
  ) {}

  /**
   * Handles MCP protocol requests for a specific project
   * POST /mcp/:projectApiKey
   *
   * @param projectApiKey - Project API key from URL path
   * @param authorization - Bearer token from Authorization header
   * @param body - MCP JSON-RPC 2.0 request payload
   * @param res - Express response object for streaming
   */
  @Post(':projectApiKey')

  @ApiOperation({
    summary: 'Handle MCP protocol request',
    description: 'Processes MCP JSON-RPC 2.0 requests with per-tenant server isolation',
  })
  @ApiResponse({
    status: 200,
    description: 'MCP response (may be streamed)',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid Bearer token',
  })
  async handleMcpRequest(
    @Param('projectApiKey') projectApiKey: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: any,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `MCP request received - Project: ${projectApiKey}, Method: ${body?.method || 'unknown'}`,
    );

    // Validate Bearer token
    if (!authorization || !authorization.startsWith('Bearer ')) {
      this.logger.warn(`Missing or invalid Authorization header for project: ${projectApiKey}`);
      res.setHeader('WWW-Authenticate', 'Bearer realm="MCP Gateway"');
      res.status(HttpStatus.UNAUTHORIZED).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Bearer token required',
        },
        id: body?.id || null,
      });
      return;
    }

    // Extract and decode JWT token
    const token = authorization.substring(7);
    let userId: string;

    try {
      const decoded = decodeJwt(token);
      if (!decoded || !(decoded.sub as string)) {
        throw new Error('Invalid token payload');
      }
      userId = decoded.sub as string;
      this.logger.debug(`Token decoded - UserId: ${userId}`);
    } catch (error) {
      this.logger.error(`JWT decode failed for project ${projectApiKey}: ${error.message}`);
      res.setHeader('WWW-Authenticate', 'Bearer realm="MCP Gateway"');
      res.status(HttpStatus.UNAUTHORIZED).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Unauthorized: Invalid token',
        },
        id: body?.id || null,
      });
      return;
    }

    // Get or create session
    let sessionId = body?.params?.sessionId;
    let session = sessionId ? this.sessionManager.getSession(projectApiKey, sessionId) : null;

    if (!session) {
      // Create new session with server instance
      const server = this.serverFactory.createServer(projectApiKey);
      sessionId = this.sessionManager.createSession(projectApiKey, userId, server);
      session = this.sessionManager.getSession(projectApiKey, sessionId)!;

      this.logger.log(`New session created - SessionId: ${sessionId}, UserId: ${userId}`);
    } else {
      this.logger.debug(`Existing session found - SessionId: ${sessionId}, UserId: ${userId}`);
    }

    // Set SSE-compatible headers for streaming responses
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-MCP-Session-Id', sessionId);

    try {
      // Process MCP request through protocol handler
      const mcpResponse = await this.protocolHandler.handleRequest(body, {
        authorization,
        projectApiKey,
      });
      // Add session ID to response for client tracking
      if (mcpResponse && typeof mcpResponse === 'object') {
        (mcpResponse as any)._sessionId = sessionId;
      }

      this.logger.log(`MCP request processed - SessionId: ${sessionId}, Method: ${body?.method}`);

      res.status(HttpStatus.OK).json(mcpResponse);
    } catch (error) {
      this.logger.error(
        `MCP request processing failed - SessionId: ${sessionId}: ${error.message}`,
        error.stack,
      );

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
          data: error.message,
        },
        id: body?.id || null,
      });
    }
  }

}
