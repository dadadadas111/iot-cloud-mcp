import { Injectable, Logger } from '@nestjs/common';
import { ApiClientService } from '../../services/api-client.service';
import { AuthService } from '../../auth/auth.service';
import {
  CallToolResponse,
  InitializeResponse,
  ServerCapabilities,
  Tool,
} from '@/mcp/types/mcp.types';

export interface ConnectionState {
  token: string | null;
  userId: string | null;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private apiClient: ApiClientService,
    private authService: AuthService,
  ) {}

  /**
   * Initialize MCP connection
   */
  getInitializeResponse(): InitializeResponse {
    return {
      protocolVersion: '2024-11-05',
      capabilities: this.getServerCapabilities(),
      serverInfo: {
        name: 'IoT Cloud MCP Bridge',
        version: '1.0.0',
      },
    };
  }

  /**
   * Get server capabilities
   */
  private getServerCapabilities(): ServerCapabilities {
    return {
      logging: {},
      tools: {
        listChanged: true,
      },
      sampling: {},
    };
  }

  /**
   * List all available tools
   */
  listTools(): Tool[] {
    return [
      {
        name: 'login',
        description:
          'Authenticate with email and password to get access to IoT devices. MUST be called first before using other tools.',
        inputSchema: {
          type: 'object',
          properties: {
            email: {
              type: 'string',
              description: 'User email address',
            },
            password: {
              type: 'string',
              description: 'User password',
            },
          },
          required: ['email', 'password'],
        },
      },
      {
        name: 'get_devices',
        description: 'Get all IoT devices for the authenticated user',
        inputSchema: {
          type: 'object',
          properties: {
            locationId: {
              type: 'string',
              description: 'Optional: Filter devices by location ID',
            },
            groupId: {
              type: 'string',
              description: 'Optional: Filter devices by group ID',
            },
          },
        },
      },
      {
        name: 'get_device',
        description: 'Get details of a specific device by UUID',
        inputSchema: {
          type: 'object',
          properties: {
            deviceId: {
              type: 'string',
              description: 'The UUID of the device',
            },
          },
          required: ['deviceId'],
        },
      },
      {
        name: 'get_device_state',
        description: 'Get the current state and properties of a device',
        inputSchema: {
          type: 'object',
          properties: {
            deviceId: {
              type: 'string',
              description: 'The UUID of the device',
            },
          },
          required: ['deviceId'],
        },
      },
      {
        name: 'get_locations',
        description: 'Get all location groups for the user',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_groups',
        description: 'Get all device groups for the user',
        inputSchema: {
          type: 'object',
          properties: {
            locationId: {
              type: 'string',
              description: 'Optional: Filter groups by location ID',
            },
          },
        },
      },
      {
        name: 'get_definitions',
        description: 'Get entity definitions and workflow examples',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Optional: Filter by "entities" or "workflows"',
              enum: ['entities', 'workflows'],
            },
          },
        },
      },
    ];
  }

  /**
   * Call a tool with parameters
   */
  async callTool(
    toolName: string,
    params: Record<string, any>,
    connectionState: ConnectionState,
  ): Promise<CallToolResponse> {
    try {
      let result: any;

      // Handle login tool separately
      if (toolName === 'login') {
        if (!params.email || !params.password) {
          throw new Error('email and password are required');
        }

        const loginResult = await this.authService.login(params.email, params.password);

        // Decode JWT to extract userId
        let userId: string | null = null;
        try {
          const tokenParts = loginResult.access_token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            userId = payload.user_id || payload.sub || null;
          }
        } catch (error) {
          this.logger.warn('Could not decode JWT token', error);
        }

        // Store token and userId in connection state
        connectionState.token = loginResult.access_token;
        connectionState.userId = userId;

        this.logger.log(`User ${params.email} logged in successfully, userId: ${userId}`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message:
                    'Login successful. You can now use other tools to interact with your IoT devices.',
                  token_type: loginResult.token_type,
                  expires_in: loginResult.expires_in,
                  user_id: userId,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // All other tools require authentication
      if (!connectionState.token || !connectionState.userId) {
        throw new Error('Authentication required. Please use the login tool first.');
      }

      switch (toolName) {
        case 'get_devices':
          result = await this.apiClient.get(
            `/device/${connectionState.userId}`,
            connectionState.token,
            {
              locationId: params.locationId,
              groupId: params.groupId,
            },
          );
          break;

        case 'get_device':
          if (!params.deviceId) throw new Error('deviceId is required');
          result = await this.apiClient.get(
            `/device/${connectionState.userId}/${params.deviceId}`,
            connectionState.token,
          );
          break;

        case 'get_device_state':
          if (!params.deviceId) throw new Error('deviceId is required');
          result = await this.apiClient.get(
            `/device/${connectionState.userId}/${params.deviceId}/state`,
            connectionState.token,
          );
          break;

        case 'get_locations':
          result = await this.apiClient.get(
            `/iot-core/location/${connectionState.userId}`,
            connectionState.token,
          );
          break;

        case 'get_groups':
          result = await this.apiClient.get(
            `/iot-core/group/${connectionState.userId}`,
            connectionState.token,
            {
              locationId: params.locationId,
            },
          );
          break;

        case 'get_definitions':
          result = await this.apiClient.get(`/iot-core/definition`, connectionState.token, {
            type: params.type,
          });
          break;

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Error calling tool ${toolName}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool ${toolName}: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}
