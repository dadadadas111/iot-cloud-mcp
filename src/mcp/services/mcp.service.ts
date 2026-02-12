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
        name: 'search',
        description:
          'Search for IoT devices, locations, and groups. Returns a list of matching results with basic information.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to find devices, locations, or groups',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'fetch',
        description:
          'Retrieve complete details of a specific IoT device, location, or group by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description:
                'The unique identifier (format: type:id, e.g., device:uuid, location:uuid, group:uuid)',
            },
          },
          required: ['id'],
        },
      },
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

      // Handle search tool (ChatGPT-compatible)
      if (toolName === 'search') {
        if (!connectionState.token || !connectionState.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        const query = params.query?.toLowerCase() || '';
        const results: any[] = [];

        // Search devices
        const devices = await this.apiClient.get(
          `/device/${connectionState.userId}`,
          connectionState.token,
        );
        if (Array.isArray(devices)) {
          devices
            .filter(
              (d) =>
                d.name?.toLowerCase().includes(query) ||
                d.uuid?.toLowerCase().includes(query) ||
                d.type?.toLowerCase().includes(query),
            )
            .forEach((device) => {
              results.push({
                id: `device:${device.uuid}`,
                title: `Device: ${device.name || device.uuid}`,
                url: `https://mcp.dash.id.vn/device/${device.uuid}`,
              });
            });
        }

        // Search locations
        const locations = await this.apiClient.get(
          `/iot-core/location/${connectionState.userId}`,
          connectionState.token,
        );
        if (Array.isArray(locations)) {
          locations
            .filter(
              (l) => l.name?.toLowerCase().includes(query) || l.uuid?.toLowerCase().includes(query),
            )
            .forEach((location) => {
              results.push({
                id: `location:${location.uuid}`,
                title: `Location: ${location.name || location.uuid}`,
                url: `https://mcp.dash.id.vn/location/${location.uuid}`,
              });
            });
        }

        // Search groups
        const groups = await this.apiClient.get(
          `/iot-core/group/${connectionState.userId}`,
          connectionState.token,
        );
        if (Array.isArray(groups)) {
          groups
            .filter(
              (g) => g.name?.toLowerCase().includes(query) || g.uuid?.toLowerCase().includes(query),
            )
            .forEach((group) => {
              results.push({
                id: `group:${group.uuid}`,
                title: `Group: ${group.name || group.uuid}`,
                url: `https://mcp.dash.id.vn/group/${group.uuid}`,
              });
            });
        }

        // Return in ChatGPT-compatible format
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ results }),
            },
          ],
        };
      }

      // Handle fetch tool (ChatGPT-compatible)
      if (toolName === 'fetch') {
        if (!connectionState.token || !connectionState.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        const idParam = params.id || '';
        const [type, uuid] = idParam.split(':');

        if (!type || !uuid) {
          throw new Error('Invalid ID format. Expected format: type:uuid (e.g., device:abc-123)');
        }

        let fetchedData: any;
        let title: string;
        let url: string;

        switch (type) {
          case 'device':
            fetchedData = await this.apiClient.get(
              `/device/${connectionState.userId}/${uuid}`,
              connectionState.token,
            );
            title = `Device: ${fetchedData.name || uuid}`;
            url = `https://mcp.dash.id.vn/device/${uuid}`;
            break;

          case 'location':
            fetchedData = await this.apiClient.get(
              `/iot-core/location/${connectionState.userId}`,
              connectionState.token,
            );
            // Filter to specific location
            fetchedData = Array.isArray(fetchedData)
              ? fetchedData.find((l) => l.uuid === uuid)
              : null;
            if (!fetchedData) throw new Error(`Location ${uuid} not found`);
            title = `Location: ${fetchedData.name || uuid}`;
            url = `https://mcp.dash.id.vn/location/${uuid}`;
            break;

          case 'group':
            fetchedData = await this.apiClient.get(
              `/iot-core/group/${connectionState.userId}`,
              connectionState.token,
            );
            // Filter to specific group
            fetchedData = Array.isArray(fetchedData)
              ? fetchedData.find((g) => g.uuid === uuid)
              : null;
            if (!fetchedData) throw new Error(`Group ${uuid} not found`);
            title = `Group: ${fetchedData.name || uuid}`;
            url = `https://mcp.dash.id.vn/group/${uuid}`;
            break;

          default:
            throw new Error(`Unknown resource type: ${type}`);
        }

        // Return in ChatGPT-compatible format
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: idParam,
                title,
                text: JSON.stringify(fetchedData, null, 2),
                url,
                metadata: {
                  type,
                  uuid,
                  retrieved_at: new Date().toISOString(),
                },
              }),
            },
          ],
        };
      }

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
