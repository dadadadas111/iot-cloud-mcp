import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClientV2Service } from './api-client-v2.service';
import { SessionStoreService } from './session-store.service';
import { ToolsListV2 } from '../tools/tools-list-v2';

@Injectable()
export class McpV2Service {
  private readonly logger = new Logger(McpV2Service.name);

  constructor(private apiClient: ApiClientV2Service, private sessionStore: SessionStoreService) {}

  async createServer(): Promise<McpServer> {
    const server = new McpServer(
      { name: 'IoT Cloud MCP Bridge v2', version: '2.0.0' },
      { capabilities: { tools: {}, logging: {} } },
    );

    // Register tools with handlers bound to this service
    this.registerTools(server);

    this.logger.log('MCP v2 Server created');
    return server;
  }

  private registerTools(server: McpServer) {
    // find_user_id
    server.registerTool('find_user_id', ToolsListV2.find_user_id, async ({ data }, extra) => {
      const sessionId = extra?.sessionId;
      if (!sessionId) throw new Error('Missing sessionId');

      const apiKey = await this.sessionStore.getApiKey(sessionId);
      if (!apiKey) throw new Error('Missing session API key');

      // Call the upstream API to find user id by email/phone
      const resp: any = await this.apiClient.post('/api/v2.0/iot-core/user/findUserId', apiKey, { data });
      const userId = resp?.userId || resp?.user_id || resp?.data?.userId;
      if (!userId) throw new Error('UserId not found');

      return { content: [{ type: 'text', text: JSON.stringify({ userId }) }] };
    });

    // list_devices
    server.registerTool('list_devices', ToolsListV2.list_devices, async ({ userId, data }, extra) => {
      const sessionId = extra?.sessionId;
      if (!sessionId) throw new Error('Missing sessionId');
      const apiKey = await this.sessionStore.getApiKey(sessionId);
      if (!apiKey) throw new Error('Missing session API key');

      // If admin provided email/phone in `data`, resolve it first
      let uid = userId;
      if (!uid && data) {
        const r: any = await this.apiClient.post('/api/v2.0/iot-core/user/findUserId', apiKey, { data });
        uid = r?.userId || r?.user_id || r?.data?.userId;
        if (!uid) throw new Error('UserId not found');
      }

      if (!uid) throw new Error('userId is required');

      const devices: any = await this.apiClient.get(`/device/${uid}`, apiKey);
      return { content: [{ type: 'text', text: JSON.stringify({ total: Array.isArray(devices) ? devices.length : 0, devices }) }] };
    });

    // control_device_simple
    server.registerTool('control_device_simple', ToolsListV2.control_device_simple, async (args: any, extra: any) => {
      const sessionId = extra?.sessionId;
      if (!sessionId) throw new Error('Missing sessionId');
      const apiKey = await this.sessionStore.getApiKey(sessionId);
      if (!apiKey) throw new Error('Missing session API key');

      // Resolve userId if needed
      let uid = args.userId;
      if (!uid && args.data) {
        const r: any = await this.apiClient.post('/api/v2.0/iot-core/user/findUserId', apiKey, { data: args.data });
        uid = r?.userId || r?.user_id || r?.data?.userId;
        if (!uid) throw new Error('UserId not found');
      }
      if (!uid) throw new Error('userId or data (email/phone) required');

      // Fetch device
      const device: any = await this.apiClient.get(`/device/${uid}/${args.uuid}`, apiKey);
      if (!device) throw new Error('Device not found');

      // Determine elementIds
      const elementIds = args.elementId ? [args.elementId] : device.elementIds || [];
      if (elementIds.length === 0) throw new Error('No element IDs available');

      // Build command
      let command: number[];
      switch (args.action) {
        case 'turn_on':
          command = [1, 1];
          break;
        case 'turn_off':
          command = [1, 0];
          break;
        case 'set_brightness':
          if (args.value === undefined) throw new Error('value required');
          command = [28, args.value];
          break;
        case 'set_kelvin':
          if (args.value === undefined) throw new Error('value required');
          command = [29, args.value];
          break;
        case 'set_temperature':
          if (args.value === undefined) throw new Error('value required');
          command = [20, args.value];
          break;
        case 'set_mode':
          if (args.value === undefined) throw new Error('value required');
          command = [17, args.value];
          break;
        default:
          throw new Error('Unknown action');
      }

      const payload = {
        eid: device.eid,
        elementIds,
        command,
        endpoint: device.endpoint,
        partnerId: device.partnerId,
        rootUuid: device.rootUuid || device.uuid,
        protocolCtl: device.protocolCtl,
      };

      const result = await this.apiClient.post('/control/device', apiKey, payload);

      return { content: [{ type: 'text', text: JSON.stringify({ success: true, response: result }) }] };
    });
  }
}
