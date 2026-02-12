import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClientService } from '../../services/api-client.service';
import { AuthService } from '../../auth/auth.service';
import * as z from 'zod';

export interface ConnectionState {
  token: string | null;
  userId: string | null;
}

/**
 * MCP Service using official SDK
 * Manages MCP server instance and tool registrations
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  // Store connection states by session ID (in production, use Redis or similar)
  private readonly connectionStates = new Map<string, ConnectionState>();

  constructor(
    private apiClient: ApiClientService,
    private authService: AuthService,
  ) {}

  /**
   * Create a NEW MCP Server instance
   * IMPORTANT: Each transport needs its own server instance
   * The official SDK's server.connect() can only be called once per server
   */
  async createServer(): Promise<McpServer> {
    // Create MCP server with official SDK
    const server = new McpServer(
      {
        name: 'IoT Cloud MCP Bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          logging: {},
        },
      },
    );

    // Register all tools
    this.registerTools(server);

    this.logger.log('MCP Server instance created with official SDK');
    return server;
  }

  /**
   * Register all MCP tools using the SDK's high-level API
   */
  private registerTools(server: McpServer): void {
    // Tool 1: login - Authenticate users
    server.registerTool(
      'login',
      {
        description:
          'Authenticate with email and password to get access to IoT devices. MUST be called first before using other tools.',
        inputSchema: z.object({
          email: z.string().describe('User email address'),
          password: z.string().describe('User password'),
        }),
      },
      async ({ email, password }, extra) => {
        try {
          const loginResult = await this.authService.login(email, password);

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

          // Store in connection state using session ID
          const sessionKey = extra?.sessionId || 'default';
          this.connectionStates.set(sessionKey, {
            token: loginResult.access_token,
            userId,
          });

          this.logger.log(
            `User ${email} logged in successfully, userId: ${userId}, session: ${sessionKey}`,
          );

          return {
            content: [
              {
                type: 'text' as const,
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
        } catch (error) {
          this.logger.error('Login failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Login failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 2: search (ChatGPT-compatible)
    server.registerTool(
      'search',
      {
        description:
          'Search/filter IoT devices, locations, and groups by name, description, or ID. Use this when user wants to FIND SPECIFIC items matching a keyword. For listing ALL items without filtering, use list_devices, list_locations, or list_groups instead.',
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              'Search keyword to filter items (e.g., "living room", "temperature", "gateway"). Leave empty or use "*" to return all items.',
            ),
        }),
      },
      async ({ query }, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        // Empty query or "*" means return all items
        const isListAll = !query || query.trim() === '' || query === '*';
        const lowerQuery = isListAll ? '' : query.toLowerCase();
        const results: any[] = [];

        try {
          // Search devices
          this.logger.debug(`[search] Fetching devices for userId: ${connectionState.userId}`);
          const devices = await this.apiClient.get(
            `/device/${connectionState.userId}`,
            connectionState.token,
          );
          this.logger.debug(
            `[search] Devices response type: ${typeof devices}, isArray: ${Array.isArray(devices)}, length: ${Array.isArray(devices) ? devices.length : 'N/A'}`,
          );
          if (devices && typeof devices === 'object') {
            this.logger.debug(`[search] Devices response keys: ${Object.keys(devices).join(', ')}`);
            this.logger.debug(
              `[search] Devices response sample: ${JSON.stringify(devices).substring(0, 500)}`,
            );
          }

          if (Array.isArray(devices)) {
            const filteredDevices = isListAll
              ? devices
              : devices.filter(
                  (d) =>
                    d.label?.toLowerCase().includes(lowerQuery) ||
                    d.mac?.toLowerCase().includes(lowerQuery) ||
                    d.desc?.toLowerCase().includes(lowerQuery) ||
                    d.productId?.toLowerCase().includes(lowerQuery),
                );
            this.logger.debug(
              `[search] Filtered ${filteredDevices.length} devices matching query "${query}" (listAll: ${isListAll})`,
            );

            filteredDevices.forEach((device) => {
              results.push({
                id: `device:${device.uuid}`,
                title: `Device: ${device.label || device.uuid}`,
                url: `https://mcp.dash.id.vn/device/${device.uuid}`,
              });
            });
          } else {
            this.logger.warn(`[search] Devices response is not an array!`);
          }

          // Search locations
          this.logger.debug(`[search] Fetching locations for userId: ${connectionState.userId}`);
          const locations = await this.apiClient.get(
            `/location/${connectionState.userId}`,
            connectionState.token,
          );
          this.logger.debug(
            `[search] Locations response type: ${typeof locations}, isArray: ${Array.isArray(locations)}, length: ${Array.isArray(locations) ? locations.length : 'N/A'}`,
          );
          if (locations && typeof locations === 'object' && !Array.isArray(locations)) {
            this.logger.debug(
              `[search] Locations response keys: ${Object.keys(locations).join(', ')}`,
            );
            this.logger.debug(
              `[search] Locations response sample: ${JSON.stringify(locations).substring(0, 500)}`,
            );
          }

          if (Array.isArray(locations)) {
            const filteredLocations = isListAll
              ? locations
              : locations.filter(
                  (l) =>
                    l.label?.toLowerCase().includes(lowerQuery) ||
                    l.desc?.toLowerCase().includes(lowerQuery) ||
                    l._id?.toLowerCase().includes(lowerQuery),
                );
            this.logger.debug(
              `[search] Filtered ${filteredLocations.length} locations matching query "${query}" (listAll: ${isListAll})`,
            );

            filteredLocations.forEach((location) => {
              results.push({
                id: `location:${location._id}`,
                title: `Location: ${location.label || location._id}`,
                url: `https://mcp.dash.id.vn/location/${location._id}`,
              });
            });
          } else {
            this.logger.warn(`[search] Locations response is not an array!`);
          }

          // Search groups
          this.logger.debug(`[search] Fetching groups for userId: ${connectionState.userId}`);
          const groups = await this.apiClient.get(
            `/group/${connectionState.userId}`,
            connectionState.token,
          );
          this.logger.debug(
            `[search] Groups response type: ${typeof groups}, isArray: ${Array.isArray(groups)}, length: ${Array.isArray(groups) ? groups.length : 'N/A'}`,
          );
          if (groups && typeof groups === 'object' && !Array.isArray(groups)) {
            this.logger.debug(`[search] Groups response keys: ${Object.keys(groups).join(', ')}`);
            this.logger.debug(
              `[search] Groups response sample: ${JSON.stringify(groups).substring(0, 500)}`,
            );
          }

          if (Array.isArray(groups)) {
            const filteredGroups = isListAll
              ? groups
              : groups.filter(
                  (g) =>
                    g.label?.toLowerCase().includes(lowerQuery) ||
                    g.desc?.toLowerCase().includes(lowerQuery) ||
                    g._id?.toLowerCase().includes(lowerQuery),
                );
            this.logger.debug(
              `[search] Filtered ${filteredGroups.length} groups matching query "${query}" (listAll: ${isListAll})`,
            );

            filteredGroups.forEach((group) => {
              results.push({
                id: `group:${group._id}`,
                title: `Group: ${group.label || group._id}`,
                url: `https://mcp.dash.id.vn/group/${group._id}`,
              });
            });
          } else {
            this.logger.warn(`[search] Groups response is not an array!`);
          }

          this.logger.log(`[search] Total results found: ${results.length} (query: "${query}")`);
          if (results.length > 0) {
            this.logger.debug(`[search] First result sample: ${JSON.stringify(results[0])}`);
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ results }),
              },
            ],
          };
        } catch (error) {
          this.logger.error('Search failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Search failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 3: fetch (ChatGPT-compatible)
    server.registerTool(
      'fetch',
      {
        description:
          'Retrieve complete details of a specific IoT device, location, or group by ID.',
        inputSchema: z.object({
          id: z
            .string()
            .describe(
              'The unique identifier (format: type:id, e.g., device:uuid, location:uuid, group:uuid)',
            ),
        }),
      },
      async ({ id }, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        const [type, uuid] = id.split(':');

        if (!type || !uuid) {
          throw new Error('Invalid ID format. Expected format: type:uuid (e.g., device:abc-123)');
        }

        try {
          let fetchedData: any;
          let title: string;
          let url: string;

          this.logger.debug(
            `[fetch] Fetching resource: type=${type}, uuid=${uuid}, userId=${connectionState.userId}`,
          );

          switch (type) {
            case 'device':
              this.logger.debug(
                `[fetch] Fetching device: /device/${connectionState.userId}/${uuid}`,
              );
              fetchedData = await this.apiClient.get(
                `/device/${connectionState.userId}/${uuid}`,
                connectionState.token,
              );
              this.logger.debug(
                `[fetch] Device response type: ${typeof fetchedData}, keys: ${fetchedData ? Object.keys(fetchedData).slice(0, 10).join(', ') : 'null'}`,
              );
              title = `Device: ${fetchedData.label || uuid}`;
              url = `https://mcp.dash.id.vn/device/${uuid}`;
              break;

            case 'location':
              this.logger.debug(`[fetch] Fetching all locations to find id: ${uuid}`);
              const allLocations = await this.apiClient.get(
                `/location/${connectionState.userId}`,
                connectionState.token,
              );
              this.logger.debug(
                `[fetch] Locations response isArray: ${Array.isArray(allLocations)}, length: ${Array.isArray(allLocations) ? allLocations.length : 'N/A'}`,
              );
              fetchedData = Array.isArray(allLocations)
                ? allLocations.find((l) => l._id === uuid)
                : null;
              if (!fetchedData) {
                this.logger.warn(
                  `[fetch] Location ${uuid} not found in ${Array.isArray(allLocations) ? allLocations.length : 0} locations`,
                );
                throw new Error(`Location ${uuid} not found`);
              }
              title = `Location: ${fetchedData.label || uuid}`;
              url = `https://mcp.dash.id.vn/location/${uuid}`;
              break;

            case 'group':
              this.logger.debug(`[fetch] Fetching all groups to find id: ${uuid}`);
              const allGroups = await this.apiClient.get(
                `/group/${connectionState.userId}`,
                connectionState.token,
              );
              this.logger.debug(
                `[fetch] Groups response isArray: ${Array.isArray(allGroups)}, length: ${Array.isArray(allGroups) ? allGroups.length : 'N/A'}`,
              );
              fetchedData = Array.isArray(allGroups) ? allGroups.find((g) => g._id === uuid) : null;
              if (!fetchedData) {
                this.logger.warn(
                  `[fetch] Group ${uuid} not found in ${Array.isArray(allGroups) ? allGroups.length : 0} groups`,
                );
                throw new Error(`Group ${uuid} not found`);
              }
              title = `Group: ${fetchedData.label || uuid}`;
              url = `https://mcp.dash.id.vn/group/${uuid}`;
              break;

            default:
              throw new Error(`Unknown resource type: ${type}`);
          }

          this.logger.log(`[fetch] Successfully fetched ${type}:${uuid} - ${title}`);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  id,
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
        } catch (error) {
          this.logger.error('Fetch failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Fetch failed: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 4: list_devices - List ALL devices without filtering
    server.registerTool(
      'list_devices',
      {
        description:
          'List ALL IoT devices for the authenticated user. Use this when user asks to "show my devices", "list devices", "what devices do I have", etc. Returns complete device list without filtering.',
        inputSchema: z.object({}),
      },
      async (args, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        try {
          this.logger.debug(
            `[list_devices] Fetching all devices for userId: ${connectionState.userId}`,
          );
          const devices = await this.apiClient.get(
            `/device/${connectionState.userId}`,
            connectionState.token,
          );

          if (!Array.isArray(devices)) {
            this.logger.warn(`[list_devices] Response is not an array`);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'No devices found or invalid response format.',
                },
              ],
            };
          }

          this.logger.log(`[list_devices] Found ${devices.length} devices`);

          const deviceList = devices.map((d) => ({
            uuid: d.uuid,
            mac: d.mac,
            name: d.label || d.uuid,
            description: d.desc || '',
            productId: d.productId,
            locationId: d.locationId,
            groupId: d.groupId,
            online: d.link === 1,
          }));

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    total: devices.length,
                    devices: deviceList,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error('[list_devices] Failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to list devices: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 5: list_locations - List ALL locations
    server.registerTool(
      'list_locations',
      {
        description:
          'List ALL location groups for the authenticated user. Use this when user asks to "show my locations", "list locations", "what locations do I have", etc.',
        inputSchema: z.object({}),
      },
      async (args, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        try {
          this.logger.debug(
            `[list_locations] Fetching all locations for userId: ${connectionState.userId}`,
          );
          const locations = await this.apiClient.get(
            `/location/${connectionState.userId}`,
            connectionState.token,
          );

          if (!Array.isArray(locations)) {
            this.logger.warn(`[list_locations] Response is not an array`);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'No locations found or invalid response format.',
                },
              ],
            };
          }

          this.logger.log(`[list_locations] Found ${locations.length} locations`);

          const locationList = locations.map((l) => ({
            id: l._id,
            name: l.label || l._id,
            description: l.desc || '',
          }));

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    total: locations.length,
                    locations: locationList,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error('[list_locations] Failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to list locations: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 6: list_groups - List ALL device groups
    server.registerTool(
      'list_groups',
      {
        description:
          'List ALL device groups for the authenticated user. Use this when user asks to "show my groups", "list groups", "what groups do I have", etc.',
        inputSchema: z.object({}),
      },
      async (args, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        try {
          this.logger.debug(
            `[list_groups] Fetching all groups for userId: ${connectionState.userId}`,
          );
          const groups = await this.apiClient.get(
            `/group/${connectionState.userId}`,
            connectionState.token,
          );

          if (!Array.isArray(groups)) {
            this.logger.warn(`[list_groups] Response is not an array`);
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'No groups found or invalid response format.',
                },
              ],
            };
          }

          this.logger.log(`[list_groups] Found ${groups.length} groups`);

          const groupList = groups.map((g) => ({
            id: g._id,
            name: g.label || g._id,
            description: g.desc || '',
            locationId: g.locationId,
            type: g.type === 0 ? 'group' : 'tag',
          }));

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    total: groups.length,
                    groups: groupList,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error('[list_groups] Failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to list groups: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 7: get_device - Get device details by UUID
    server.registerTool(
      'get_device',
      {
        description:
          'Get detailed information about a specific IoT device by its UUID. Returns complete device data including properties, state, and configuration.',
        inputSchema: z.object({
          uuid: z.string().describe('Device UUID (unique identifier)'),
        }),
      },
      async ({ uuid }, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        try {
          this.logger.debug(`[get_device] Fetching device uuid: ${uuid}`);
          const device = await this.apiClient.get(
            `/device/${connectionState.userId}/${uuid}`,
            connectionState.token,
          );

          this.logger.log(`[get_device] Retrieved device: ${device.label || uuid}`);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(device, null, 2),
              },
            ],
          };
        } catch (error) {
          this.logger.error('[get_device] Failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to get device: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 8: update_device - Update device properties
    server.registerTool(
      'update_device',
      {
        description:
          'Update device properties such as name (label), description, group assignment, or favorite status.',
        inputSchema: z.object({
          uuid: z.string().describe('Device UUID to update'),
          label: z.string().optional().describe('New device name/label (max 255 chars)'),
          desc: z.string().optional().describe('New device description (max 255 chars)'),
          groupId: z.string().optional().describe('Group UUID to assign device to'),
          vgroupId: z.string().optional().describe('Virtual group UUID'),
          fav: z.boolean().optional().describe('Mark as favorite (true/false)'),
        }),
      },
      async ({ uuid, label, desc, groupId, vgroupId, fav }, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        try {
          // Build update payload
          const updateData: any = { uuid };
          if (label !== undefined) updateData.label = label;
          if (desc !== undefined) updateData.desc = desc;
          if (groupId !== undefined) updateData.groupId = groupId;
          if (vgroupId !== undefined) updateData.vgroupId = vgroupId;
          if (fav !== undefined) updateData.fav = fav;

          this.logger.debug(`[update_device] Updating device ${uuid} with:`, updateData);

          const result = await this.apiClient.patch(
            `/device/${connectionState.userId}`,
            connectionState.token,
            updateData,
          );

          this.logger.log(`[update_device] Updated device ${uuid} successfully`);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    uuid: uuid,
                    message: 'Device updated successfully',
                    updated: updateData,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error('[update_device] Failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to update device: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // Tool 9: delete_device - Delete a device
    server.registerTool(
      'delete_device',
      {
        description:
          'Delete an IoT device permanently. This action cannot be undone. Use with caution.',
        inputSchema: z.object({
          uuid: z.string().describe('Device UUID to delete'),
        }),
      },
      async ({ uuid }, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        try {
          this.logger.debug(`[delete_device] Deleting device uuid: ${uuid}`);

          const result = await this.apiClient.delete(
            `/device/${connectionState.userId}`,
            connectionState.token,
            { uuid },
          );

          this.logger.log(`[delete_device] Deleted device ${uuid} successfully`);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    success: true,
                    uuid: uuid,
                    message: 'Device deleted successfully',
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error('[delete_device] Failed:', error);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to delete device: ${error.message}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    this.logger.log(
      'MCP tools registered successfully: login, search, fetch, list_devices, list_locations, list_groups, get_device, update_device, delete_device',
    );
  }
}
