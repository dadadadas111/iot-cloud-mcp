import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClientService } from './api-client.service';
import { AuthService } from '../../auth/auth.service';
import { RedisService, ConnectionState } from './redis.service';
import * as z from 'zod';

/**
 * Authenticated state with guaranteed non-null values
 */
interface AuthenticatedState {
  token: string;
  userId: string;
}

/**
 * MCP Service using official SDK
 * Manages MCP server instance and tool registrations
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private apiClient: ApiClientService,
    private authService: AuthService,
    private redisService: RedisService,
  ) {}

  /**
   * Helper: Extract session key from MCP extra context
   * @throws Error if sessionId is missing
   */
  private getSessionKey(extra: any): string {
    const sid = extra?.sessionId;
    if (!sid) {
      throw new Error('Missing MCP sessionId');
    }
    return sid;
  }

  /**
   * Helper: Create standard "authentication required" error response
   */
  private authRequired(): { content: Array<{ type: 'text'; text: string }>; isError: boolean } {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Authentication required. Please use the login tool first.',
        },
      ],
    };
  }

  /**
   * Helper: Create standard "Redis unavailable" error response
   */
  private redisUnavailable(): {
    content: Array<{ type: 'text'; text: string }>;
    isError: boolean;
  } {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: 'Session store unavailable. Please retry in a moment.',
        },
      ],
    };
  }

  /**
   * Pre-authenticate a session with OAuth token
   * This allows skipping the login tool when OAuth Bearer token is provided
   */
  async setOAuthSession(sessionId: string, oauthToken: { userId: string; token: string }): Promise<void> {
    try {
      await this.redisService.setSessionState(sessionId, {
        token: oauthToken.token,
        userId: oauthToken.userId,
      });
      this.logger.log(`OAuth session pre-authenticated: ${sessionId} for user: ${oauthToken.userId}`);
    } catch (error) {
      this.logger.error('Failed to set OAuth session state:', error);
    }
  }

  /**
   * Set API key for a session
   * This API key will be used for all IoT API requests in this session
   */
  async setSessionApiKey(sessionId: string, apiKey: string): Promise<void> {
    try {
      // Get existing session state
      const existingState = await this.redisService.getSessionState(sessionId);
      
      // Update with API key
      await this.redisService.setSessionState(sessionId, {
        ...existingState,
        apiKey,
      });
      
      this.logger.log(`API key set for session: ${sessionId}`);
    } catch (error) {
      this.logger.error('Failed to set session API key:', error);
    }
  }

  /**
   * Helper: Get session state with API key validation
   */
  private async getSessionWithApiKey(extra: any): Promise<{ state: AuthenticatedState; apiKey: string }> {
    const sessionKey = this.getSessionKey(extra);
    const sessionState = await this.redisService.getSessionState(sessionKey);
    
    if (!sessionState?.token || !sessionState?.userId) {
      throw new Error('AUTHENTICATION_REQUIRED');
    }
    
    if (!sessionState?.apiKey) {
      throw new Error('API_KEY_REQUIRED');
    }
    
    return {
      state: { token: sessionState.token, userId: sessionState.userId },
      apiKey: sessionState.apiKey
    };
  }

  /**
   * Helper: Wrap tool handler with authentication and API key validation
   * Provides both auth state and API key to the handler
   */
  private withApiKey<TArgs>(
    fn: (
      args: TArgs,
      state: AuthenticatedState,
      apiKey: string,
      extra: any,
    ) => Promise<any>,
  ) {
    return async (args: TArgs, extra: any): Promise<any> => {
      try {
        const { state, apiKey } = await this.getSessionWithApiKey(extra);
        return await fn(args, state, apiKey, extra);
      } catch (e: any) {
        if (e?.message === 'REDIS_UNAVAILABLE') {
          return this.redisUnavailable();
        }
        if (e?.message === 'AUTHENTICATION_REQUIRED') {
          return this.authRequired();
        }
        if (e?.message === 'API_KEY_REQUIRED') {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'API key not found in session. Please reconnect with ?api-key=YOUR_API_KEY parameter.',
              },
            ],
          };
        }
        throw e; // Re-throw unexpected errors
      }
    };
  }

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
    // server.registerTool(
    //   'login',
    //   {
    //     description:
    //       'Authenticate with email and password to get access to IoT devices. MUST be called first before using other tools.',
    //     inputSchema: z.object({
    //       email: z.string().describe('User email address'),
    //       password: z.string().describe('User password'),
    //     }),
    //   },
    //   async ({ email, password }, extra) => {
    //     try {
    //       // Get API key from session
    //       const sessionKey = this.getSessionKey(extra);
    //       const sessionState = await this.redisService.getSessionState(sessionKey);
    //       const apiKey = sessionState?.apiKey;
          
    //       if (!apiKey) {
    //         return {
    //           isError: true,
    //           content: [
    //             {
    //               type: 'text',
    //               text: 'API key not found in session. Please reconnect with ?api-key=YOUR_API_KEY parameter.',
    //             },
    //           ],
    //         };
    //       }
    //       const loginResult = await this.authService.login(email, password, apiKey);

    //       // Decode JWT to extract userId
    //       let userId: string | null = null;
    //       try {
    //         const tokenParts = loginResult.access_token.split('.');
    //         if (tokenParts.length === 3) {
    //           const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    //           userId = payload.user_id || payload.sub || null;
    //         }
    //       } catch (error) {
    //         this.logger.warn('Could not decode JWT token', error);
    //       }

    //       // Store in Redis session state
    //       // const sessionKey = this.getSessionKey(extra);
    //       await this.redisService.setSessionState(sessionKey, {
    //         token: loginResult.access_token,
    //         userId,
    //       });

    //       this.logger.log(
    //         `User ${email} logged in successfully, userId: ${userId}, session: ${sessionKey}`,
    //       );

    //       return {
    //         content: [
    //           {
    //             type: 'text' as const,
    //             text: JSON.stringify(
    //               {
    //                 success: true,
    //                 message:
    //                   'Login successful. You can now use other tools to interact with your IoT devices.',
    //                 token_type: loginResult.token_type,
    //                 expires_in: loginResult.expires_in,
    //                 user_id: userId,
    //               },
    //               null,
    //               2,
    //             ),
    //           },
    //         ],
    //       };
    //     } catch (error) {
    //       this.logger.error('Login failed:', error);
    //       return {
    //         content: [
    //           {
    //             type: 'text' as const,
    //             text: `Login failed: ${error.message}`,
    //           },
    //         ],
    //         isError: true,
    //       };
    //     }
    //   },
    // );

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
      this.withApiKey(async ({ query }, state, apiKey) => {
        // Empty query or "*" means return all items
        const isListAll = !query || query.trim() === '' || query === '*';
        const lowerQuery = isListAll ? '' : query.toLowerCase();
        const results: any[] = [];

        // Search devices
        this.logger.debug(`[search] Fetching devices for userId: ${state.userId}`);
        const devices = await this.apiClient.get(`/device/${state.userId}`, state.token, undefined, apiKey);
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
        this.logger.debug(`[search] Fetching locations for userId: ${state.userId}`);
        const locations = await this.apiClient.get(`/location/${state.userId}`, state.token, undefined, apiKey);
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
                  l.uuid?.toLowerCase().includes(lowerQuery),
              );
          this.logger.debug(
            `[search] Filtered ${filteredLocations.length} locations matching query "${query}" (listAll: ${isListAll})`,
          );

          filteredLocations.forEach((location) => {
            results.push({
              id: `location:${location.uuid}`,
              title: `Location: ${location.label || location.uuid}`,
              url: `https://mcp.dash.id.vn/location/${location.uuid}`,
            });
          });
        } else {
          this.logger.warn(`[search] Locations response is not an array!`);
        }

        // Search groups
        this.logger.debug(`[search] Fetching groups for userId: ${state.userId}`);
        const groups = await this.apiClient.get(`/group/${state.userId}`, state.token, undefined, apiKey);
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
                  g.uuid?.toLowerCase().includes(lowerQuery),
              );
          this.logger.debug(
            `[search] Filtered ${filteredGroups.length} groups matching query "${query}" (listAll: ${isListAll})`,
          );

          filteredGroups.forEach((group) => {
            results.push({
              id: `group:${group.uuid}`,
              title: `Group: ${group.label || group.uuid}`,
              url: `https://mcp.dash.id.vn/group/${group.uuid}`,
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
      }),
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
      this.withApiKey(async ({ id }, state, apiKey) => {
        const [type, uuid] = id.split(':');
        let fetchedData: any;
        let title: string;
        let url: string;
        switch (type) {
          case 'device':
            this.logger.debug(`[fetch] Fetching device: /device/${state.userId}/${uuid}`);
            fetchedData = await this.apiClient.get(`/device/${state.userId}/${uuid}`, state.token, undefined, apiKey);
            this.logger.debug(
              `[fetch] Device response type: ${typeof fetchedData}, keys: ${fetchedData ? Object.keys(fetchedData).slice(0, 10).join(', ') : 'null'}`,
            );
            title = `Device: ${fetchedData.label || uuid}`;
            url = `https://mcp.dash.id.vn/device/${uuid}`;
            break;

          case 'location':
            this.logger.debug(`[fetch] Fetching all locations to find uuid: ${uuid}`);
            const allLocations = await this.apiClient.get(`/location/${state.userId}`, state.token, undefined, apiKey);
            this.logger.debug(
              `[fetch] Locations response isArray: ${Array.isArray(allLocations)}, length: ${Array.isArray(allLocations) ? allLocations.length : 'N/A'}`,
            );
            fetchedData = Array.isArray(allLocations)
              ? allLocations.find((l) => l.uuid === uuid)
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
            this.logger.debug(`[fetch] Fetching all groups to find uuid: ${uuid}`);
            const allGroups = await this.apiClient.get(`/group/${state.userId}`, state.token, undefined, apiKey);
            this.logger.debug(
              `[fetch] Groups response isArray: ${Array.isArray(allGroups)}, length: ${Array.isArray(allGroups) ? allGroups.length : 'N/A'}`,
            );
            fetchedData = Array.isArray(allGroups) ? allGroups.find((g) => g.uuid === uuid) : null;
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
      }),
    );

    // Tool 4: list_devices - List ALL devices without filtering
    server.registerTool(
      'list_devices',
      {
        description:
          'List ALL IoT devices for the authenticated user. Use this when user asks to "show my devices", "list devices", "what devices do I have", etc. Returns complete device list without filtering.',
        inputSchema: z.object({}),
      },
      this.withApiKey(async (args, state, apiKey) => {
        this.logger.debug(`[list_devices] Fetching all devices for userId: ${state.userId}`);
        const devices = await this.apiClient.get(`/device/${state.userId}`, state.token, undefined, apiKey);

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
      }),
    );

    // Tool 5: list_locations - List ALL locations
    server.registerTool(
      'list_locations',
      {
        description:
          'List ALL location groups for the authenticated user. Use this when user asks to "show my locations", "list locations", "what locations do I have", etc.',
        inputSchema: z.object({}),
      },
      this.withApiKey(async (args, state, apiKey) => {
        this.logger.debug(`[list_locations] Fetching all locations for userId: ${state.userId}`);
        const locations = await this.apiClient.get(`/location/${state.userId}`, state.token, undefined, apiKey);

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

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  total: locations.length,
                  locations: locations,
                },
                null,
                2,
              ),
            },
          ],
        };
      }),
    );

    // Tool 6: list_groups - List ALL device groups
    server.registerTool(
      'list_groups',
      {
        description:
          'List ALL device groups for the authenticated user. Use this when user asks to "show my groups", "list groups", "what groups do I have", etc.',
        inputSchema: z.object({}),
      },
      this.withApiKey(async (args, state, apiKey) => {
        this.logger.debug(`[list_groups] Fetching all groups for userId: ${state.userId}`);
        const groups = await this.apiClient.get(`/group/${state.userId}`, state.token, undefined, apiKey);

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

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  total: groups.length,
                  groups: groups,
                },
                null,
                2,
              ),
            },
          ],
        };
      }),
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
      this.withApiKey(async ({ uuid }, state, apiKey) => {
        this.logger.debug(`[get_device] Fetching device uuid: ${uuid}`);
        const device = await this.apiClient.get(`/device/${state.userId}/${uuid}`, state.token, undefined, apiKey);

        this.logger.log(`[get_device] Retrieved device: ${device.label || uuid}`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(device, null, 2),
            },
          ],
        };
      }),
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
      this.withApiKey(async ({ uuid, label, desc, groupId, vgroupId, fav }, state, apiKey) => {
        // Build update payload
        const updateData: any = { uuid };
        if (label !== undefined) updateData.label = label;
        if (desc !== undefined) updateData.desc = desc;
        if (groupId !== undefined) updateData.groupId = groupId;
        if (vgroupId !== undefined) updateData.vgroupId = vgroupId;
        if (fav !== undefined) updateData.fav = fav;

        this.logger.debug(`[update_device] Updating device ${uuid} with:`, updateData);

        const result = await this.apiClient.patch(
          `/device/${state.userId}`,
          state.token,
          updateData,
          apiKey,
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
      }),
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
      this.withApiKey(async ({ uuid }, state, apiKey) => {
        this.logger.debug(`[delete_device] Deleting device uuid: ${uuid}`);

        const result = await this.apiClient.delete(`/device/${state.userId}`, state.token, {
          uuid,
        }, apiKey);

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
      }),
    );

    // Tool 10: get_device_state - Get state of a single device by UUID
    server.registerTool(
      'get_device_state',
      {
        description:
          'Get current state of a specific IoT device by its UUID. Returns state information including attributes, values, and last update time for the device.',
        inputSchema: z.object({
          uuid: z.string().describe('Device UUID (unique identifier)'),
        }),
      },
      this.withApiKey(async ({ uuid }, state, apiKey) => {
        this.logger.debug(`[get_device_state] Fetching state for device: ${uuid}`);
        const deviceState = await this.apiClient.get(`/state/devId/${uuid}`, state.token, undefined, apiKey);

        this.logger.log(`[get_device_state] Retrieved device state successfully`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(deviceState, null, 2),
            },
          ],
        };
      }),
    );

    // Tool 11: get_location_state - Get states for all devices in a location
    server.registerTool(
      'get_location_state',
      {
        description:
          'Get current states of all IoT devices in a specific location. Returns state information for all devices within the specified location.',
        inputSchema: z.object({
          locationUuid: z.string().describe('Location UUID (use uuid field from list_locations)'),
        }),
      },
      this.withApiKey(async ({ locationUuid }, state, apiKey) => {
        this.logger.debug(`[get_location_state] Fetching state for location: ${locationUuid}`);
        const states = await this.apiClient.get(`/state/${locationUuid}`, state.token, undefined, apiKey);

        this.logger.log(`[get_location_state] Retrieved location state successfully`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(states, null, 2),
            },
          ],
        };
      }),
    );

    // Tool 12: get_device_state_by_mac - Get state of a specific device by MAC address
    server.registerTool(
      'get_device_state_by_mac',
      {
        description:
          'Get current state of a specific IoT device by its MAC address within a location. Useful when you need state info for a single device.',
        inputSchema: z.object({
          locationUuid: z.string().describe('Location UUID where the device is located'),
          macAddress: z.string().describe('Device MAC address (physical identifier)'),
        }),
      },
      this.withApiKey(async ({ locationUuid, macAddress }, state, apiKey) => {
        this.logger.debug(
          `[get_device_state_by_mac] Fetching state for location ${locationUuid}, device ${macAddress}`,
        );
        const deviceState = await this.apiClient.get(
          `/state/${locationUuid}/${macAddress}`,
          state.token,
          undefined,
          apiKey,
        );

        this.logger.log(`[get_device_state_by_mac] Retrieved device state successfully`);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(deviceState, null, 2),
            },
          ],
        };
      }),
    );

    // Tool 13: control_device - Control an IoT device
    server.registerTool(
      'control_device',
      {
        description:
          'Send control command to an IoT device. You must first get device details to retrieve required fields (eid, rootUuid, endpoint, partnerId, protocolCtl). ' +
          'Command format: [attributeId, value, ...] e.g., [1, 1] for ON, [1, 0] for OFF, [28, 700] for brightness. ' +
          'See device-attr-and-control.csv for attribute IDs: ON_OFF=1, BRIGHTNESS=28, KELVIN=29, COLOR_HSV=31, MODE=17, TEMP_SET=20, etc. ' +
          'Note: This API only publishes MQTT messages - it does not validate or guarantee device state changes.',
        inputSchema: z.object({
          uuid: z.string().describe('Device UUID to control (first get device details)'),
          elementIds: z
            .array(z.number())
            .describe('Element IDs to control (from device.elementIds, use all if unsure)'),
          command: z
            .array(z.number())
            .describe(
              'Command array: [attributeId, value, ...]. Examples: [1,1]=ON, [1,0]=OFF, [28,700]=brightness, [20,22]=temp 22°C',
            ),
        }),
      },
      this.withApiKey(async ({ uuid, elementIds, command }, state, apiKey) => {
        this.logger.debug(`[control_device] Getting device details for uuid: ${uuid}`);

        // First, get device details to retrieve control parameters
        const device = await this.apiClient.get(`/device/${state.userId}/${uuid}`, state.token, undefined, apiKey);

        if (!device) {
          throw new Error(`Device ${uuid} not found`);
        }

        // Extract required fields
        const eid = device.eid;
        const rootUuid = device.rootUuid || device.uuid; // Use device uuid if no rootUuid
        const endpoint = device.endpoint;
        const partnerId = device.partnerId;
        const protocolCtl = device.protocolCtl;

        // Validate required fields
        if (!eid || !endpoint || !partnerId || protocolCtl === undefined) {
          this.logger.error('[control_device] Missing required device fields:', {
            eid,
            endpoint,
            partnerId,
            protocolCtl,
          });
          throw new Error(
            'Device is missing required control fields (eid, endpoint, partnerId, or protocolCtl)',
          );
        }

        // Build control payload
        const payload = {
          eid,
          elementIds,
          command,
          endpoint,
          partnerId,
          rootUuid,
          protocolCtl,
        };

        this.logger.debug('[control_device] Sending control command:', payload);

        // Send control command
        const result = await this.apiClient.post('/control/device', state.token, payload, apiKey);

        this.logger.log(
          `[control_device] Control command sent successfully for device ${device.label || uuid}`,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  device: {
                    uuid: device.uuid,
                    label: device.label,
                    mac: device.mac,
                  },
                  command_sent: {
                    elementIds,
                    command,
                  },
                  note: 'Control command published to MQTT. Device state change is not guaranteed - check device state after a few seconds.',
                  response: result,
                },
                null,
                2,
              ),
            },
          ],
        };
      }),
    );

    // Tool 14: control_device_simple - Simplified device control helpers
    server.registerTool(
      'control_device_simple',
      {
        description:
          'Simplified device control for common operations. Automatically builds the correct command array for common actions. ' +
          'Actions: turn_on, turn_off, set_brightness (0-1000), set_kelvin (0-65000), set_temperature (15-30 for AC), set_mode (0-4 for AC). ' +
          'If elementId not specified, controls all elements. This is easier than control_device for basic operations.',
        inputSchema: z.object({
          uuid: z.string().describe('Device UUID to control'),
          action: z
            .enum([
              'turn_on',
              'turn_off',
              'set_brightness',
              'set_kelvin',
              'set_temperature',
              'set_mode',
            ])
            .describe(
              'Action to perform: turn_on, turn_off, set_brightness, set_kelvin, set_temperature (AC), set_mode (AC)',
            ),
          value: z
            .number()
            .optional()
            .describe(
              'Value for set_* actions: brightness (0-1000), kelvin (0-65000), temperature (15-30), mode (0-4)',
            ),
          elementId: z
            .number()
            .optional()
            .describe('Specific element ID to control (optional, controls all if not specified)'),
        }),
      },
      this.withApiKey(async ({ uuid, action, value, elementId }, state, apiKey) => {
        this.logger.debug(`[control_device_simple] Getting device details for uuid: ${uuid}`);

        // Get device details
        const device = await this.apiClient.get(`/device/${state.userId}/${uuid}`, state.token, undefined, apiKey);

        if (!device) {
          throw new Error(`Device ${uuid} not found`);
        }

        // Determine element IDs
        const elementIds = elementId ? [elementId] : device.elementIds || [];

        if (elementIds.length === 0) {
          throw new Error('No element IDs available for this device');
        }

        // Build command based on action
        let command: number[];
        let actionDescription: string;

        switch (action) {
          case 'turn_on':
            command = [1, 1]; // ON_OFF=1, value=1 (ON)
            actionDescription = 'Turn ON';
            break;
          case 'turn_off':
            command = [1, 0]; // ON_OFF=1, value=0 (OFF)
            actionDescription = 'Turn OFF';
            break;
          case 'set_brightness':
            if (value === undefined || value < 0 || value > 1000) {
              throw new Error('Brightness value must be between 0 and 1000');
            }
            command = [28, value]; // BRIGHTNESS=28
            actionDescription = `Set brightness to ${value}`;
            break;
          case 'set_kelvin':
            if (value === undefined || value < 0 || value > 65000) {
              throw new Error('Kelvin value must be between 0 and 65000');
            }
            command = [29, value]; // KELVIN=29
            actionDescription = `Set kelvin to ${value}`;
            break;
          case 'set_temperature':
            if (value === undefined || value < 15 || value > 30) {
              throw new Error('Temperature must be between 15 and 30 (Celsius)');
            }
            command = [20, value]; // TEMP_SET=20
            actionDescription = `Set temperature to ${value}°C`;
            break;
          case 'set_mode':
            if (value === undefined || value < 0 || value > 4) {
              throw new Error('Mode must be 0-4 (0=AUTO, 1=COOLING, 2=DRY, 3=HEATING, 4=FAN)');
            }
            command = [17, value]; // MODE=17
            const modes = ['AUTO', 'COOLING', 'DRY', 'HEATING', 'FAN'];
            actionDescription = `Set mode to ${modes[value]}`;
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        // Extract required control fields
        const eid = device.eid;
        const rootUuid = device.rootUuid || device.uuid;
        const endpoint = device.endpoint;
        const partnerId = device.partnerId;
        const protocolCtl = device.protocolCtl;

        if (!eid || !endpoint || !partnerId || protocolCtl === undefined) {
          throw new Error(
            'Device is missing required control fields (eid, endpoint, partnerId, or protocolCtl)',
          );
        }

        // Build control payload
        const payload = {
          eid,
          elementIds,
          command,
          endpoint,
          partnerId,
          rootUuid,
          protocolCtl,
        };

        this.logger.debug('[control_device_simple] Sending control command:', payload);

        // Send control command
        const result = await this.apiClient.post('/control/device', state.token, payload, apiKey);

        this.logger.log(
          `[control_device_simple] ${actionDescription} command sent for device ${device.label || uuid}`,
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  success: true,
                  device: {
                    uuid: device.uuid,
                    label: device.label,
                    mac: device.mac,
                  },
                  action: actionDescription,
                  command_sent: {
                    elementIds,
                    command,
                  },
                  note: 'Control command published to MQTT. Device state change is not guaranteed - check device state after a few seconds.',
                  response: result,
                },
                null,
                2,
              ),
            },
          ],
        };
      }),
    );

    this.logger.log(
      'MCP tools registered successfully: login, search, fetch, list_devices, list_locations, list_groups, get_device, update_device, delete_device, get_device_state, get_location_state, get_device_state_by_mac, control_device, control_device_simple',
    );
  }
}
