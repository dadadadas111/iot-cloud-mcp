/**
 * Tool Executor Service
 * Executes MCP tools by routing to appropriate service methods
 * Handles authentication via JWT tokens and formats responses for MCP
 */

import { IotDevice, IotLocation, IotGroup } from '../../proxy/dto/iot-api-response.dto';
import { Injectable, BadRequestException } from '@nestjs/common';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { IotApiService } from '../../proxy/services/iot-api.service';
import { decodeJwt, extractBearerToken, getUserIdFromToken } from '../../common/utils/jwt.utils';
import { decodeProductId, resolveDeviceType } from '../../common/utils/product.utils';
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
import {
  GET_LOCATION_STATE_TOOL,
  GetLocationStateParams,
} from '../definitions/get-location-state.tool';
import {
  GET_DEVICE_STATE_BY_MAC_TOOL,
  GetDeviceStateByMacParams,
} from '../definitions/get-device-state-by-mac.tool';
import { CONTROL_DEVICE_TOOL, ControlDeviceParams } from '../definitions/control-device.tool';
import {
  CONTROL_DEVICE_SIMPLE_TOOL,
  ControlDeviceSimpleParams,
} from '../definitions/control-device-simple.tool';
import { GET_DEVICE_DOCUMENTATION_TOOL } from '../definitions/get-device-documentation.tool';
import { sanitizeErrorForClient } from '../../common/utils/error.utils';

/** Context for tool execution containing request metadata */
interface ToolContext {
  authorization?: string;
  projectApiKey?: string;
  meta?: Record<string, unknown>;
}

/** Thrown when authorization header is missing */
class AuthRequiredError extends Error {
  constructor() {
    super('Missing authorization header');
  }
}

/**
 * Service responsible for executing registered MCP tools
 * Extracts user context from JWT tokens and delegates to service layer
 */
@Injectable()
export class ToolExecutorService {
  constructor(private iotApiService: IotApiService) {}

  /** Tool name → handler map for O(1) dispatch */
  private readonly toolHandlers: Record<
    string,
    (params: Record<string, unknown>, context: ToolContext) => Promise<CallToolResult>
  > = {
    [FETCH_USER_TOOL.name]: (p, c) => this.executeFetchUser(p as FetchUserParams, c),
    [SEARCH_TOOL.name]: (p, c) => this.executeSearch(p as SearchParams, c),
    [FETCH_TOOL.name]: (p, c) => this.executeFetch(p as FetchParams, c),
    [LIST_DEVICES_TOOL.name]: (p, c) => this.executeListDevices(p as ListDevicesParams, c),
    [LIST_LOCATIONS_TOOL.name]: (p, c) => this.executeListLocations(p as ListLocationsParams, c),
    [LIST_GROUPS_TOOL.name]: (p, c) => this.executeListGroups(p as ListGroupsParams, c),
    [GET_DEVICE_TOOL.name]: (p, c) => this.executeGetDevice(p as GetDeviceParams, c),
    [UPDATE_DEVICE_TOOL.name]: (p, c) => this.executeUpdateDevice(p as UpdateDeviceParams, c),
    [DELETE_DEVICE_TOOL.name]: (p, c) => this.executeDeleteDevice(p as DeleteDeviceParams, c),
    [GET_DEVICE_STATE_TOOL.name]: (p, c) =>
      this.executeGetDeviceState(p as GetDeviceStateParams, c),
    [GET_LOCATION_STATE_TOOL.name]: (p, c) =>
      this.executeGetLocationState(p as GetLocationStateParams, c),
    [GET_DEVICE_STATE_BY_MAC_TOOL.name]: (p, c) =>
      this.executeGetDeviceStateByMac(p as GetDeviceStateByMacParams, c),
    [CONTROL_DEVICE_TOOL.name]: (p, c) => this.executeControlDevice(p as ControlDeviceParams, c),
    [CONTROL_DEVICE_SIMPLE_TOOL.name]: (p, c) =>
      this.executeControlDeviceSimple(p as ControlDeviceSimpleParams, c),
    [GET_DEVICE_DOCUMENTATION_TOOL.name]: (p, _c) =>
      Promise.resolve(this.executeGetDeviceDocumentation(p as { topic: string })),
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Extract userId from JWT in authorization header. Throws AuthRequiredError if missing. */
  private extractUserContext(context: ToolContext): { userId: string; projectApiKey: string } {
    if (!context.authorization) {
      throw new AuthRequiredError();
    }
    const token = extractBearerToken(context.authorization);
    const decoded = decodeJwt(token);
    const userId = getUserIdFromToken(decoded);
    return { userId, projectApiKey: context.projectApiKey || 'unknown' };
  }

  /** Validate authorization header exists, return projectApiKey. No userId extraction. */
  private requireAuthHeader(context: ToolContext): string {
    if (!context.authorization) {
      throw new AuthRequiredError();
    }
    return context.projectApiKey || 'unknown';
  }

  /** Wrap data as successful MCP CallToolResult */
  private successResult(data: unknown): CallToolResult {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    };
  }

  /** Wrap error as MCP CallToolResult with sanitized message */
  private errorResult(error: unknown, includeAuthHint = true): CallToolResult {
    const errorMessage = sanitizeErrorForClient(error);
    const payload: Record<string, unknown> = { isError: true, error: errorMessage };
    if (includeAuthHint) {
      payload._meta = { 'mcp/www_authenticate': 'Bearer realm="iot-cloud-mcp"' };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Execute a tool with given parameters and context
   * Routes to the appropriate handler via handler map
   */
  async executeTool(
    toolName: string,
    params: Record<string, unknown>,
    context: ToolContext,
  ): Promise<CallToolResult> {
    const handler = this.toolHandlers[toolName];
    if (!handler) {
      throw new BadRequestException(`Unknown tool: ${toolName}`);
    }
    return handler(params, context);
  }

  // ─── Tool Handlers ──────────────────────────────────────────────────────────

  /** Fetch authenticated user profile */
  private async executeFetchUser(
    _params: FetchUserParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const userData = await this.iotApiService.fetchUser(projectApiKey, userId);
      return this.successResult(userData);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Search across devices, locations, and groups by keyword */
  private async executeSearch(params: SearchParams, context: ToolContext): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const [devices, locations, groups] = await Promise.all([
        this.iotApiService.listDevices(projectApiKey, userId),
        this.iotApiService.listLocations(projectApiKey, userId),
        this.iotApiService.listGroups(projectApiKey, userId),
      ]);

      const query = params.query.toLowerCase();

      const matchedDevices = devices
        .filter(
          (d) => d.label?.toLowerCase().includes(query) || d.desc?.toLowerCase().includes(query),
        )
        .map((d) => {
          const typeInfo = resolveDeviceType(d);
          return {
            uuid: d.uuid,
            label: d.label,
            desc: d.desc,
            mac: d.mac,
            locationId: d.locationId,
            groupId: d.groupId,
            features: d.features,
            ...(typeInfo && {
              deviceType: typeInfo.deviceType,
              deviceTypeId: typeInfo.deviceTypeId,
            }),
          };
        });

      const matchedLocations = locations
        .filter(
          (l) => l.label?.toLowerCase().includes(query) || l.desc?.toLowerCase().includes(query),
        )
        .map((l) => ({
          uuid: l.uuid,
          label: l.label,
          desc: l.desc,
        }));

      const matchedGroups = groups
        .filter(
          (g) => g.label?.toLowerCase().includes(query) || g.desc?.toLowerCase().includes(query),
        )
        .map((g) => ({
          uuid: g.uuid,
          label: g.label,
          desc: g.desc,
          locationId: g.locationId,
        }));

      return this.successResult({
        total: matchedDevices.length + matchedLocations.length + matchedGroups.length,
        devices: matchedDevices,
        locations: matchedLocations,
        groups: matchedGroups,
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Fetch resource by "type:uuid" format */
  private async executeFetch(params: FetchParams, context: ToolContext): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const parts = params.id.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid id format. Expected "type:uuid" (e.g., "device:abc-123")');
      }

      const [type, uuid] = parts;
      let resource: IotDevice | IotLocation | IotGroup;

      switch (type.toLowerCase()) {
        case 'device':
          resource = await this.iotApiService.getDevice(projectApiKey, userId, uuid);
          break;
        case 'location':
          resource = await this.iotApiService.getLocation(projectApiKey, userId, uuid);
          break;
        case 'group':
          resource = await this.iotApiService.getGroup(projectApiKey, userId, uuid);
          break;
        default:
          throw new Error(
            `Unknown resource type: ${type}. Supported types: device, location, group`,
          );
      }

      return this.successResult(resource);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** List devices with slim response and device type enrichment */
  private async executeListDevices(
    params: ListDevicesParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const devices = await this.iotApiService.listDevices(
        projectApiKey,
        userId,
        params.locationId ?? undefined,
      );

      const slimDevices = devices.map((device) => {
        const typeInfo = resolveDeviceType(device);
        return {
          uuid: device.uuid,
          label: device.label,
          desc: device.desc,
          mac: device.mac,
          locationId: device.locationId,
          groupId: device.groupId,
          features: device.features,
          ...(typeInfo && { deviceType: typeInfo.deviceType, deviceTypeId: typeInfo.deviceTypeId }),
        };
      });

      return this.successResult({ total: slimDevices.length, devices: slimDevices });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** List locations with slim response */
  private async executeListLocations(
    _params: ListLocationsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const locations = await this.iotApiService.listLocations(projectApiKey, userId);
      const slimLocations = locations.map((loc) => ({
        uuid: loc.uuid,
        label: loc.label,
        desc: loc.desc,
      }));

      return this.successResult({ total: slimLocations.length, locations: slimLocations });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** List groups with slim response */
  private async executeListGroups(
    params: ListGroupsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const groups = await this.iotApiService.listGroups(
        projectApiKey,
        userId,
        params.locationId ?? undefined,
      );
      const slimGroups = groups.map((group) => ({
        uuid: group.uuid,
        label: group.label,
        desc: group.desc,
        locationId: group.locationId,
      }));

      return this.successResult({ total: slimGroups.length, groups: slimGroups });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Get device with full payload + deviceType/brand enrichment */
  private async executeGetDevice(
    params: GetDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const device = await this.iotApiService.getDevice(projectApiKey, userId, params.uuid);

      const typeInfo = resolveDeviceType(device);
      const productDecoded = device.productId ? decodeProductId(device.productId) : null;
      const enrichedDevice = {
        ...device,
        ...(typeInfo && { deviceType: typeInfo.deviceType, deviceTypeId: typeInfo.deviceTypeId }),
        ...(productDecoded && { brand: productDecoded.brand, ownership: productDecoded.ownership }),
      };

      // Return both text content (backward compatible) and structuredContent (for ChatGPT widgets)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(enrichedDevice) }],
        structuredContent: enrichedDevice as Record<string, unknown>,
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Update device properties (label, desc, locationId, groupId) */
  private async executeUpdateDevice(
    params: UpdateDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const { uuid, ...rawUpdates } = params;
      // Coerce null → undefined so downstream proxy types are satisfied
      const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([, v]) => v !== null));

      const result = await this.iotApiService.updateDevice(projectApiKey, userId, uuid, updates);
      return this.successResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Permanently delete a device — DESTRUCTIVE OPERATION */
  private async executeDeleteDevice(
    params: DeleteDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const result = await this.iotApiService.deleteDevice(projectApiKey, userId, params.uuid);
      return this.successResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Get device state by UUID (auth required, no userId needed) */
  private async executeGetDeviceState(
    params: GetDeviceStateParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const projectApiKey = this.requireAuthHeader(context);
      const state = await this.iotApiService.getDeviceState(projectApiKey, params.uuid);
      return this.successResult(state);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Get all device states in a location with slim response */
  private async executeGetLocationState(
    params: GetLocationStateParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const projectApiKey = this.requireAuthHeader(context);
      const state = await this.iotApiService.getLocationState(projectApiKey, params.locationUuid);

      // Slim location state — drop redundant loc/from/uuid, keep useful fields
      const slimState = Array.isArray(state)
        ? state.map((entry) => ({
            mac: entry.mac,
            devId: entry.devId,
            state: entry.state,
            updatedAt: entry.updatedAt,
          }))
        : state;

      return this.successResult(slimState);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Get device state by MAC address within a location */
  private async executeGetDeviceStateByMac(
    params: GetDeviceStateByMacParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const projectApiKey = this.requireAuthHeader(context);
      const state = await this.iotApiService.getDeviceStateByMac(
        projectApiKey,
        params.locationUuid,
        params.macAddress,
      );
      return this.successResult(state);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Send raw control command to device */
  private async executeControlDevice(
    params: ControlDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      // Fetch device details first to get required control fields
      const device = await this.iotApiService.getDevice(projectApiKey, userId, params.uuid);

      const controlPayload = {
        eid: device.eid,
        elementIds: params.elementIds,
        command: params.command,
        endpoint: device.endpoint,
        partnerId: device.partnerId,
        rootUuid: device.rootUuid,
        protocolCtl: device.protocolCtl,
      };

      const result = await this.iotApiService.controlDevice(projectApiKey, controlPayload);
      return this.successResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Control device using simplified action names */
  private async executeControlDeviceSimple(
    params: ControlDeviceSimpleParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      // Fetch device details first to get required control fields
      const device = await this.iotApiService.getDevice(projectApiKey, userId, params.uuid);

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
          if (params.value == null) {
            throw new Error('value is required for set_brightness action');
          }
          command = [28, params.value];
          break;
        case 'set_kelvin':
          if (params.value == null) {
            throw new Error('value is required for set_kelvin action');
          }
          command = [29, params.value];
          break;
        case 'set_temperature':
          if (params.value == null) {
            throw new Error('value is required for set_temperature action');
          }
          command = [20, params.value];
          break;
        case 'set_mode':
          if (params.value == null) {
            throw new Error('value is required for set_mode action');
          }
          command = [17, params.value];
          break;
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }

      // Use specified elementId or all device elementIds
      const elementIds = params.elementId != null ? [params.elementId] : device.elementIds;

      const controlPayload = {
        eid: device.eid,
        elementIds,
        command,
        endpoint: device.endpoint,
        partnerId: device.partnerId,
        rootUuid: device.rootUuid ? device.rootUuid : device.uuid,
        protocolCtl: device.protocolCtl,
      };

      const result = await this.iotApiService.controlDevice(projectApiKey, controlPayload);
      return this.successResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /** Return device documentation markdown (no auth, no API call) */
  private executeGetDeviceDocumentation(params: { topic: string }): CallToolResult {
    try {
      const content = GET_DEVICE_DOCUMENTATION_TOOL.execute(params.topic);
      return {
        content: [{ type: 'text' as const, text: content }],
      };
    } catch (error) {
      return this.errorResult(error, false);
    }
  }
}
