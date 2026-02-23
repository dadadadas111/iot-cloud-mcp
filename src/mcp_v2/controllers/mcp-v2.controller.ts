import { Controller, All, Req, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpV2Service } from '../services/mcp-v2.service';
import { SessionStoreService } from '../services/session-store.service';

@ApiTags('MCP Protocol V2')
@Controller('mcp')
export class McpV2Controller {
  private readonly transports = new Map<string, StreamableHTTPServerTransport>();
  private readonly logger = new Logger(McpV2Controller.name);

  constructor(private mcpService: McpV2Service, private sessionStore: SessionStoreService) {}

  @All()
  @ApiOperation({ summary: 'MCP v2 Streamable HTTP endpoint' })
  @ApiResponse({ status: 200, description: 'Request handled' })
  @ApiExcludeEndpoint()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    this.logger.debug(`[MCP-v2] request ${req.method} session=${sessionId} url=${req.url}`);

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && this.transports.has(sessionId)) {
        transport = this.transports.get(sessionId)!;
      } else {
        const apiKey = (req.headers['x-api-key'] || req.headers['x-header-apikey']) as string | undefined;
        if (!apiKey) {
          res.status(400).json({ jsonrpc: '2.0', error: { code: -32602, message: 'Missing x-api-key' }, id: null });
          return;
        }

        // Create new session id generator transport and persist apiKey when session initializes
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: async (newSessionId) => {
            this.logger.log(`[MCP-v2] session initialized: ${newSessionId}`);
            // store apiKey for this session
            await this.sessionStore.setApiKey(newSessionId, apiKey!);
            this.transports.set(newSessionId, transport);
          },
        });

        transport.onclose = async () => {
          const sid = transport.sessionId;
          if (sid && this.transports.has(sid)) {
            this.logger.log(`[MCP-v2] transport closed ${sid}`);
            this.transports.delete(sid);
            await this.sessionStore.delete(sid);
          }
        };

        // Note: apiKey stored in onsessioninitialized above

        // Create server and connect
        const server = await this.mcpService.createServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      this.logger.error('[MCP-v2] error', err as any);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
      }
    }
  }
}
