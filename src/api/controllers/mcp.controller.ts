import { Controller, Get, Post, Req, Res, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { User } from '../../shared/decorators/user.decorator';
import { UserContext } from '../../auth/firebase.strategy';
import { ApiClientService } from '../../services/api-client.service';

@Controller('mcp')
export class McpController {
  constructor(private apiClient: ApiClientService) {}

  /**
   * MCP Initialize endpoint - handles protocol handshake
   * Used by MCP clients to initialize the connection
   */
  @Post('initialize')
  async initialize(@Req() req: Request, @Res() res: Response) {
    const clientId = req.body?.clientId || 'unknown';
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      protocolVersion: '2024-11-05',
      capabilities: {
        logging: {},
        resources: {
          listChanged: true,
        },
        tools: {
          listChanged: true,
        },
        sampling: {},
      },
      serverInfo: {
        name: 'IoT Cloud MCP Bridge',
        version: '1.0.0',
      },
    });
  }

  /**
   * MCP SSE endpoint - streams resource and tool definitions
   * This is the main MCP endpoint that ChatGPT/Claude uses
   */
  @Get('sse')
  @UseGuards(FirebaseAuthGuard)
  async streamMcpResponses(@User() user: UserContext, @Req() req: Request, @Res() res: Response) {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
      // Send initial message
      this.sendSSEMessage(res, 'connected', {
        status: 'connected',
        userId: user.userId,
        timestamp: new Date().toISOString(),
      });

      // Load resources (devices, locations, groups)
      const resources = await this.getResourceDefinitions(user);
      this.sendSSEMessage(res, 'resources', resources);

      // Load tools (actions available)
      const tools = await this.getToolDefinitions(user);
      this.sendSSEMessage(res, 'tools', tools);

      // Send ready message
      this.sendSSEMessage(res, 'ready', {
        status: 'ready',
        resourceCount: resources.resources?.length || 0,
        toolCount: tools.tools?.length || 0,
      });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        this.sendSSEMessage(res, 'ping', { timestamp: new Date().toISOString() });
      }, 30000);

      // Clean up on disconnect
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
   * Helper: Send SSE formatted message
   */
  private sendSSEMessage(res: Response, eventType: string, data: any): void {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    res.write(message);
  }

  /**
   * Helper: Get resource definitions (what MCP can access)
   */
  private async getResourceDefinitions(user: UserContext): Promise<any> {
    try {
      const devices = await this.apiClient.get(`/device/${user.userId}`, user.token);
      const locations = await this.apiClient.get(`/iot-core/location/${user.userId}`, user.token);
      const groups = await this.apiClient.get(`/iot-core/group/${user.userId}`, user.token);

      return {
        resources: [
          {
            uri: 'iot://devices',
            name: 'Devices',
            description: 'List all IoT devices',
            mimeType: 'application/json',
            contents: devices,
          },
          {
            uri: 'iot://locations',
            name: 'Locations',
            description: 'List all locations',
            mimeType: 'application/json',
            contents: locations,
          },
          {
            uri: 'iot://groups',
            name: 'Groups',
            description: 'List all device groups',
            mimeType: 'application/json',
            contents: groups,
          },
        ],
      };
    } catch (error) {
      return {
        resources: [],
        error: error.message,
      };
    }
  }

  /**
   * Helper: Get tool definitions (what MCP can do)
   */
  private async getToolDefinitions(user: UserContext): Promise<any> {
    return {
      tools: [
        {
          name: 'get_devices',
          description: 'Get all IoT devices for the user',
          inputSchema: {
            type: 'object',
            properties: {
              locationId: {
                type: 'string',
                description: 'Optional location ID to filter devices',
              },
            },
          },
        },
        {
          name: 'get_device',
          description: 'Get details of a specific device',
          inputSchema: {
            type: 'object',
            properties: {
              deviceId: {
                type: 'string',
                description: 'Device UUID',
              },
            },
            required: ['deviceId'],
          },
        },
        {
          name: 'get_device_state',
          description: 'Get current state of a device',
          inputSchema: {
            type: 'object',
            properties: {
              deviceId: {
                type: 'string',
                description: 'Device UUID',
              },
            },
            required: ['deviceId'],
          },
        },
        {
          name: 'get_locations',
          description: 'Get all user locations',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_groups',
          description: 'Get all device groups',
          inputSchema: {
            type: 'object',
            properties: {
              locationId: {
                type: 'string',
                description: 'Optional location ID to filter groups',
              },
            },
          },
        },
      ],
    };
  }
}
