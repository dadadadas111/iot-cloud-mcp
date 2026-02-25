/**
 * Tool Executor Service
 * Executes MCP tools by routing to appropriate service methods
 * Handles authentication via JWT tokens and formats responses for MCP
 */

import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { IotApiService } from '../../proxy/services/iot-api.service';
import { decodeJwt, extractBearerToken, getUserIdFromToken } from '../../common/utils/jwt.utils';
import { FETCH_USER_TOOL, FetchUserParams } from '../definitions/fetch-user.tool';
import { SEARCH_TOOL, SearchParams } from '../definitions/search.tool';
import { FETCH_TOOL, FetchParams } from '../definitions/fetch.tool';
import { LIST_DEVICES_TOOL, ListDevicesParams } from '../definitions/list-devices.tool';
import { LIST_LOCATIONS_TOOL, ListLocationsParams } from '../definitions/list-locations.tool';
import { LIST_GROUPS_TOOL, ListGroupsParams } from '../definitions/list-groups.tool';
import { GET_DEVICE_TOOL, GetDeviceParams } from '../definitions/get-device.tool';
import { UPDATE_DEVICE_TOOL, UpdateDeviceParams } from '../definitions/update-device.tool';
import { DELETE_DEVICE_TOOL, DeleteDeviceParams } from '../definitions/delete-device.tool';
import { GET_DEVICE_STATE_TOOL, GetDeviceStateParams } from '../definitions/get-device-state.tool';
import { GET_LOCATION_STATE_TOOL, GetLocationStateParams } from '../definitions/get-location-state.tool';
import { GET_DEVICE_STATE_BY_MAC_TOOL, GetDeviceStateByMacParams } from '../definitions/get-device-state-by-mac.tool';
import { CONTROL_DEVICE_TOOL, ControlDeviceParams } from '../definitions/control-device.tool';
import { CONTROL_DEVICE_SIMPLE_TOOL, ControlDeviceSimpleParams } from '../definitions/control-device-simple.tool';

/** Context for tool execution containing request metadata */
interface ToolContext {
  authorization?: string;
  projectApiKey?: string;
  meta?: Record<string, unknown>;
}

/**
 * Service responsible for executing registered MCP tools
 * Extracts user context from JWT tokens and delegates to service layer
 */
@Injectable()
export class ToolExecutorService {
  constructor(private iotApiService: IotApiService) { }

  /**
   * Execute a tool with given parameters and context
   * Handles authentication, service delegation, and response formatting
   *
   * @param toolName - Name of the tool to execute
   * @param params - Tool parameters
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted response
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (toolName === FETCH_USER_TOOL.name) {
      return this.executeFetchUser(params as FetchUserParams, context);
    }

    if (toolName === SEARCH_TOOL.name) {
      return this.executeSearch(params as SearchParams, context);
    }

    if (toolName === FETCH_TOOL.name) {
      return this.executeFetch(params as FetchParams, context);
    }

    if (toolName === LIST_DEVICES_TOOL.name) {
      return this.executeListDevices(params as ListDevicesParams, context);
    }

    if (toolName === LIST_LOCATIONS_TOOL.name) {
      return this.executeListLocations(params as ListLocationsParams, context);
    }

    if (toolName === LIST_GROUPS_TOOL.name) {
      return this.executeListGroups(params as ListGroupsParams, context);
    }

    if (toolName === GET_DEVICE_TOOL.name) {
      return this.executeGetDevice(params as GetDeviceParams, context);
    }

    if (toolName === UPDATE_DEVICE_TOOL.name) {
      return this.executeUpdateDevice(params as UpdateDeviceParams, context);
    }

    if (toolName === DELETE_DEVICE_TOOL.name) {
      return this.executeDeleteDevice(params as DeleteDeviceParams, context);
    }

    if (toolName === GET_DEVICE_STATE_TOOL.name) {
      return this.executeGetDeviceState(params as GetDeviceStateParams, context);
    }

    if (toolName === GET_LOCATION_STATE_TOOL.name) {
      return this.executeGetLocationState(params as GetLocationStateParams, context);
    }

    if (toolName === GET_DEVICE_STATE_BY_MAC_TOOL.name) {
      return this.executeGetDeviceStateByMac(params as GetDeviceStateByMacParams, context);
    }

    if (toolName === CONTROL_DEVICE_TOOL.name) {
      return this.executeControlDevice(params as ControlDeviceParams, context);
    }

    if (toolName === CONTROL_DEVICE_SIMPLE_TOOL.name) {
      return this.executeControlDeviceSimple(params as ControlDeviceSimpleParams, context);
    }

    throw new BadRequestException(`Unknown tool: ${toolName}`);
  }

  /**
   * Execute fetchUser tool
   * Extracts userId from Bearer token and fetches user data from IoT API
   *
   * @param params - Empty object (tool requires no parameters)
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted user data response
   */
  private async executeFetchUser(
    params: FetchUserParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      // Extract and decode JWT token to get userId
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      // Fetch user data from IoT API using userId
      const userData = await this.iotApiService.fetchUser(
        context.projectApiKey || 'unknown',
        userId,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(userData),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute search tool
   * Searches across devices, locations, and groups by keyword
   *
   * @param params - Search parameters with query keyword
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted search results
   */
  private async executeSearch(
    params: SearchParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      // Extract userId from Bearer token
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      // Fetch all resources in parallel
      const [devices, locations, groups] = await Promise.all([
        this.iotApiService.listDevices(context.projectApiKey || 'unknown', userId),
        this.iotApiService.listLocations(context.projectApiKey || 'unknown', userId),
        this.iotApiService.listGroups(context.projectApiKey || 'unknown', userId),
      ]);

      // Filter results by query keyword (case-insensitive)
      const query = params.query.toLowerCase();
      const matchedDevices = devices.filter((d: any) =>
        d.label?.toLowerCase().includes(query) || d.desc?.toLowerCase().includes(query)
      );
      const matchedLocations = locations.filter((l: any) =>
        l.label?.toLowerCase().includes(query) || l.desc?.toLowerCase().includes(query)
      );
      const matchedGroups = groups.filter((g: any) =>
        g.label?.toLowerCase().includes(query) || g.desc?.toLowerCase().includes(query)
      );

      const result = {
        total: matchedDevices.length + matchedLocations.length + matchedGroups.length,
        devices: matchedDevices,
        locations: matchedLocations,
        groups: matchedGroups,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute fetch tool
   * Retrieves complete resource details by ID in format "type:uuid"
   *
   * @param params - Fetch parameters with id in format "type:uuid"
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted resource data
   */
  private async executeFetch(
    params: FetchParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      // Extract userId from Bearer token
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      // Parse id format "type:uuid"
      const parts = params.id.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid id format. Expected "type:uuid" (e.g., "device:abc-123")');
      }

      const [type, uuid] = parts;
      let resource: any;

      // Route to appropriate API method based on type
      switch (type.toLowerCase()) {
        case 'device':
          resource = await this.iotApiService.getDevice(
            context.projectApiKey || 'unknown',
            userId,
            uuid,
          );
          break;
        case 'location':
          resource = await this.iotApiService.getLocation(
            context.projectApiKey || 'unknown',
            userId,
            uuid,
          );
          break;
        case 'group':
          resource = await this.iotApiService.getGroup(
            context.projectApiKey || 'unknown',
            userId,
            uuid,
          );
          break;
        default:
          throw new Error(`Unknown resource type: ${type}. Supported types: device, location, group`);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(resource),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute list_devices tool
   * Lists all devices, optionally filtered by location
   *
   * @param params - Parameters with optional locationId
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted device list
   */
  private async executeListDevices(
    params: ListDevicesParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      const devices = await this.iotApiService.listDevices(
        context.projectApiKey || 'unknown',
        userId,
        params.locationId,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ total: devices.length, devices }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute list_locations tool
   * Lists all locations for the authenticated user
   *
   * @param params - Empty parameters object
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted location list
   */
  private async executeListLocations(
    params: ListLocationsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      const locations = await this.iotApiService.listLocations(
        context.projectApiKey || 'unknown',
        userId,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ total: locations.length, locations }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute list_groups tool
   * Lists all groups, optionally filtered by location
   *
   * @param params - Parameters with optional locationId
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted group list
   */
  private async executeListGroups(
    params: ListGroupsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      const groups = await this.iotApiService.listGroups(
        context.projectApiKey || 'unknown',
        userId,
        params.locationId,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ total: groups.length, groups }),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute get_device tool
   * Gets a specific device by UUID
   *
   * @param params - Tool parameters including device uuid
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted device data response
   */
  private async executeGetDevice(
    params: GetDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      const device = await this.iotApiService.getDevice(
        context.projectApiKey || 'unknown',
        userId,
        params.uuid,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(device),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute update_device tool
   * Updates device properties like label, description, location, or group
   *
   * @param params - Tool parameters including device uuid and optional fields to update
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted update response
   */
  private async executeUpdateDevice(
    params: UpdateDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      const { uuid, ...updates } = params;

      const result = await this.iotApiService.updateDevice(
        context.projectApiKey || 'unknown',
        userId,
        uuid,
        updates,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute delete_device tool
   * Permanently deletes a device - DESTRUCTIVE OPERATION
   *
   * @param params - Tool parameters including device uuid to delete
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted deletion response
   */
  private async executeDeleteDevice(
    params: DeleteDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      const result = await this.iotApiService.deleteDevice(
        context.projectApiKey || 'unknown',
        userId,
        params.uuid,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute get_device_state tool
   * Gets device state by device UUID
   *
   * @param params - Tool parameters including device UUID
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted device state response
   */
  private async executeGetDeviceState(
    params: GetDeviceStateParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const state = await this.iotApiService.getDeviceState(
        context.projectApiKey || 'unknown',
        params.deviceUuid,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(state),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute get_location_state tool
   * Gets state of all devices in a location
   *
   * @param params - Tool parameters including location UUID
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted location state response
   */
  private async executeGetLocationState(
    params: GetLocationStateParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const state = await this.iotApiService.getLocationState(
        context.projectApiKey || 'unknown',
        params.locationUuid,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(state),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute get_device_state_by_mac tool
   * Gets device state by MAC address within a location
   *
   * @param params - Tool parameters including location UUID and MAC address
   * @param context - Request context with authorization header and projectApiKey
   * @returns MCP-formatted device state response
   */
  private async executeGetDeviceStateByMac(
    params: GetDeviceStateByMacParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const state = await this.iotApiService.getDeviceStateByMac(
        context.projectApiKey || 'unknown',
        params.locationUuid,
        params.macAddress,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(state),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }


  /**
   * Execute control_device tool
   * Send raw control command to device
   */
  private async executeControlDevice(
    params: ControlDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      // Fetch device details first to get required control fields
      const device = await this.iotApiService.getDevice(
        context.projectApiKey || 'unknown',
        userId,
        params.uuid,
      );

      // Build control payload with required fields from device
      const controlPayload = {
        eid: device.eid,
        elementIds: params.elementIds,
        command: params.command,
        endpoint: device.endpoint,
        partnerId: device.partnerId,
        rootUuid: device.rootUuid,
        protocolCtl: device.protocolCtl,
      };

      const result = await this.iotApiService.controlDevice(
        context.projectApiKey || 'unknown',
        controlPayload,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute control_device_simple tool
   * Control device using simplified actions
   */
  private async executeControlDeviceSimple(
    params: ControlDeviceSimpleParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    if (!context.authorization) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: 'Missing authorization header',
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }

    try {
      const token = extractBearerToken(context.authorization);
      const decoded = decodeJwt(token);
      const userId = getUserIdFromToken(decoded);

      // Fetch device details first to get required control fields
      const device = await this.iotApiService.getDevice(
        context.projectApiKey || 'unknown',
        userId,
        params.uuid,
      );

      // Map simplified action to command array
      let command: number[];
      switch (params.action) {
        case 'turn_on':
          command = [1, 1];
          break;
        case 'turn_off':
          command = [1, 0];
          break;
        case 'set_brightness':
          if (params.value === undefined) {
            throw new Error('value is required for set_brightness action');
          }
          command = [28, params.value];
          break;
        case 'set_kelvin':
          if (params.value === undefined) {
            throw new Error('value is required for set_kelvin action');
          }
          command = [29, params.value];
          break;
        case 'set_temperature':
          if (params.value === undefined) {
            throw new Error('value is required for set_temperature action');
          }
          command = [20, params.value];
          break;
        case 'set_mode':
          if (params.value === undefined) {
            throw new Error('value is required for set_mode action');
          }
          command = [17, params.value];
          break;
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }

      // Use specified elementId or all device elementIds
      const elementIds = params.elementId
        ? [params.elementId]
        : device.elementIds;

      // Build control payload with required fields from device
      const controlPayload = {
        eid: device.eid,
        elementIds,
        command,
        endpoint: device.endpoint,
        partnerId: device.partnerId,
        rootUuid: device.rootUuid,
        protocolCtl: device.protocolCtl,
      };

      const result = await this.iotApiService.controlDevice(
        context.projectApiKey || 'unknown',
        controlPayload,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              isError: true,
              error: errorMessage,
              _meta: {
                'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"',
              },
            }),
          },
        ],
      };
    }
  }
}