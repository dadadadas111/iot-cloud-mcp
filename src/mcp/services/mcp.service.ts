import { Injectable } from '@nestjs/common';
import { ApiClientService } from '../../services/api-client.service';
import { UserContext } from '../../auth/firebase.strategy';
import { CallToolResponse, InitializeResponse, Resource, ServerCapabilities, Tool } from '@/mcp/types/mcp.types';


@Injectable()
export class McpService {
  constructor(private apiClient: ApiClientService) {}

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
      resources: {
        listChanged: true,
      },
      tools: {
        listChanged: true,
      },
      sampling: {},
    };
  }

  /**
   * List all available resources
   */
  async listResources(user: UserContext): Promise<Resource[]> {
    try {
      // Get data from IoT API
      const [devices, locations, groups] = await Promise.all([
        this.apiClient.get(`/device/${user.userId}`, user.token).catch(() => []),
        this.apiClient.get(`/iot-core/location/${user.userId}`, user.token).catch(() => []),
        this.apiClient.get(`/iot-core/group/${user.userId}`, user.token).catch(() => []),
      ]);

      const resources: Resource[] = [
        {
          uri: 'iot://devices',
          name: 'Devices',
          description: 'All IoT devices accessible to the user',
          mimeType: 'application/json',
        },
        {
          uri: 'iot://locations',
          name: 'Locations',
          description: 'All location groups with device organization',
          mimeType: 'application/json',
        },
        {
          uri: 'iot://groups',
          name: 'Device Groups',
          description: 'All device groups for bulk operations',
          mimeType: 'application/json',
        },
      ];

      // Add individual device resources
      if (Array.isArray(devices)) {
        devices.forEach((device: any) => {
          resources.push({
            uri: `iot://device/${device.uuid}`,
            name: device.name || `Device ${device.uuid}`,
            description: `Device: ${device.deviceType || 'Unknown'}`,
            mimeType: 'application/json',
          });
        });
      }

      return resources;
    } catch (error) {
      console.error('Error listing resources:', error);
      return [];
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(user: UserContext, resourceUri: string): Promise<string> {
    try {
      if (resourceUri === 'iot://devices') {
        const devices = await this.apiClient.get(`/device/${user.userId}`, user.token);
        return JSON.stringify(devices, null, 2);
      }

      if (resourceUri === 'iot://locations') {
        const locations = await this.apiClient.get(`/iot-core/location/${user.userId}`, user.token);
        return JSON.stringify(locations, null, 2);
      }

      if (resourceUri === 'iot://groups') {
        const groups = await this.apiClient.get(`/iot-core/group/${user.userId}`, user.token);
        return JSON.stringify(groups, null, 2);
      }

      // Read individual device
      if (resourceUri.startsWith('iot://device/')) {
        const deviceId = resourceUri.replace('iot://device/', '');
        const device = await this.apiClient.get(`/device/${user.userId}/${deviceId}`, user.token);
        return JSON.stringify(device, null, 2);
      }

      throw new Error(`Unknown resource: ${resourceUri}`);
    } catch (error) {
      throw new Error(`Failed to read resource ${resourceUri}: ${error.message}`);
    }
  }

  /**
   * List all available tools
   */
  listTools(): Tool[] {
    return [
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
  async callTool(user: UserContext, toolName: string, params: Record<string, any>): Promise<CallToolResponse> {
    try {
      let result: any;

      switch (toolName) {
        case 'get_devices':
          result = await this.apiClient.get(`/device/${user.userId}`, user.token, {
            locationId: params.locationId,
            groupId: params.groupId,
          });
          break;

        case 'get_device':
          if (!params.deviceId) throw new Error('deviceId is required');
          result = await this.apiClient.get(`/device/${user.userId}/${params.deviceId}`, user.token);
          break;

        case 'get_device_state':
          if (!params.deviceId) throw new Error('deviceId is required');
          result = await this.apiClient.get(`/device/${user.userId}/${params.deviceId}/state`, user.token);
          break;

        case 'get_locations':
          result = await this.apiClient.get(`/iot-core/location/${user.userId}`, user.token);
          break;

        case 'get_groups':
          result = await this.apiClient.get(`/iot-core/group/${user.userId}`, user.token, {
            locationId: params.locationId,
          });
          break;

        case 'get_definitions':
          result = await this.apiClient.get(`/iot-core/definition`, user.token, {
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
