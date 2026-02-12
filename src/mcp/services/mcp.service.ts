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
  private server: McpServer | null = null;
  // Store connection states by session ID (in production, use Redis or similar)
  private readonly connectionStates = new Map<string, ConnectionState>();

  constructor(
    private apiClient: ApiClientService,
    private authService: AuthService,
  ) {}

  /**
   * Get or create the MCP Server instance
   */
  async getServer(): Promise<McpServer> {
    if (this.server) {
      return this.server;
    }

    // Create MCP server with official SDK
    this.server = new McpServer(
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
    this.registerTools(this.server);

    this.logger.log('MCP Server initialized successfully with official SDK');
    return this.server;
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
          'Search for IoT devices, locations, and groups. Returns a list of matching results with basic information.',
        inputSchema: z.object({
          query: z.string().describe('Search query to find devices, locations, or groups'),
        }),
      },
      async ({ query }, extra) => {
        const sessionKey = extra?.sessionId || 'default';
        const connectionState = this.connectionStates.get(sessionKey);

        if (!connectionState?.token || !connectionState?.userId) {
          throw new Error('Authentication required. Please use the login tool first.');
        }

        const lowerQuery = query.toLowerCase();
        const results: any[] = [];

        try {
          // Search devices
          const devices = await this.apiClient.get(
            `/device/${connectionState.userId}`,
            connectionState.token,
          );
          if (Array.isArray(devices)) {
            devices
              .filter(
                (d) =>
                  d.name?.toLowerCase().includes(lowerQuery) ||
                  d.uuid?.toLowerCase().includes(lowerQuery) ||
                  d.type?.toLowerCase().includes(lowerQuery),
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
                (l) =>
                  l.name?.toLowerCase().includes(lowerQuery) ||
                  l.uuid?.toLowerCase().includes(lowerQuery),
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
                (g) =>
                  g.name?.toLowerCase().includes(lowerQuery) ||
                  g.uuid?.toLowerCase().includes(lowerQuery),
              )
              .forEach((group) => {
                results.push({
                  id: `group:${group.uuid}`,
                  title: `Group: ${group.name || group.uuid}`,
                  url: `https://mcp.dash.id.vn/group/${group.uuid}`,
                });
              });
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
              const allLocations = await this.apiClient.get(
                `/iot-core/location/${connectionState.userId}`,
                connectionState.token,
              );
              fetchedData = Array.isArray(allLocations)
                ? allLocations.find((l) => l.uuid === uuid)
                : null;
              if (!fetchedData) throw new Error(`Location ${uuid} not found`);
              title = `Location: ${fetchedData.name || uuid}`;
              url = `https://mcp.dash.id.vn/location/${uuid}`;
              break;

            case 'group':
              const allGroups = await this.apiClient.get(
                `/iot-core/group/${connectionState.userId}`,
                connectionState.token,
              );
              fetchedData = Array.isArray(allGroups)
                ? allGroups.find((g) => g.uuid === uuid)
                : null;
              if (!fetchedData) throw new Error(`Group ${uuid} not found`);
              title = `Group: ${fetchedData.name || uuid}`;
              url = `https://mcp.dash.id.vn/group/${uuid}`;
              break;

            default:
              throw new Error(`Unknown resource type: ${type}`);
          }

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

    this.logger.log('MCP tools registered successfully: login, search, fetch');
  }
}
