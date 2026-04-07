/**
 * Tool Executor Service
 * Executes MCP tools by routing to appropriate service methods
 * Handles authentication via JWT tokens and formats responses for MCP
 */

import { IotDevice, IotLocation, IotGroup } from '../../proxy/dto/iot-api-response.dto';
import { Injectable, Inject, BadRequestException, forwardRef } from '@nestjs/common';
import { extractStateMap, translateDeviceState } from '../utils/device-state.utils';
import { buildControlCommands } from '../utils/device-control.utils';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { IotApiService } from '../../proxy/services/iot-api.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
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
import {
  WIDGET_LIST_DEVICES_TOOL,
  WidgetListDevicesParams,
} from '../definitions/widget-list-devices.tool';
import {
  WIDGET_GET_DEVICE_TOOL,
  WidgetGetDeviceParams,
} from '../definitions/widget-get-device.tool';
import {
  WIDGET_CONTROL_DEVICE_TOOL,
  WidgetControlDeviceParams,
} from '../definitions/widget-control-device.tool';
import {
  INTERACTIVE_DEVICE_TOOL,
  InteractiveDeviceParams,
} from '../definitions/interactive-device.tool';
import { LIST_SMARTS_TOOL, ListSmartsParams } from '../definitions/list-smarts.tool';
import { GET_SMART_TOOL, GetSmartParams } from '../definitions/get-smart.tool';
import { ACTIVATE_SMART_TOOL, ActivateSmartParams } from '../definitions/activate-smart.tool';
import { LIST_SMART_CMDS_TOOL, ListSmartCmdsParams } from '../definitions/list-smart-cmds.tool';
import {
  LIST_SCHEDULED_JOBS_TOOL,
  ListScheduledJobsParams,
} from '../definitions/list-scheduled-jobs.tool';
import {
  CANCEL_SCHEDULED_JOB_TOOL,
  CancelScheduledJobParams,
} from '../definitions/cancel-scheduled-job.tool';
import { sanitizeErrorForClient } from '../../common/utils/error.utils';

/** Context for tool execution containing request metadata */
interface ToolContext {
  authorization?: string;
  projectApiKey?: string;
  userId?: string;
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
  constructor(
    private iotApiService: IotApiService,
    @Inject(forwardRef(() => SchedulerService))
    private schedulerService: SchedulerService,
  ) {}

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
      this.executeControlDeviceSimple(p as unknown as ControlDeviceSimpleParams, c),
    [WIDGET_LIST_DEVICES_TOOL.name]: (p, c) =>
      this.executeWidgetListDevices(p as WidgetListDevicesParams, c),
    [WIDGET_GET_DEVICE_TOOL.name]: (p, c) =>
      this.executeWidgetGetDevice(p as WidgetGetDeviceParams, c),
    [WIDGET_CONTROL_DEVICE_TOOL.name]: (p, c) =>
      this.executeWidgetControlDevice(p as WidgetControlDeviceParams, c),
    [INTERACTIVE_DEVICE_TOOL.name]: (p, c) =>
      this.executeWidgetControlDevice(p as InteractiveDeviceParams, c),
    [LIST_SMARTS_TOOL.name]: (p, c) => this.executeListSmarts(p as ListSmartsParams, c),
    [GET_SMART_TOOL.name]: (p, c) => this.executeGetSmart(p as GetSmartParams, c),
    [ACTIVATE_SMART_TOOL.name]: (p, c) => this.executeActivateSmart(p as ActivateSmartParams, c),
    [LIST_SMART_CMDS_TOOL.name]: (p, c) => this.executeListSmartCmds(p as ListSmartCmdsParams, c),
    [LIST_SCHEDULED_JOBS_TOOL.name]: (p, c) =>
      this.executeListScheduledJobs(p as ListScheduledJobsParams, c),
    [CANCEL_SCHEDULED_JOB_TOOL.name]: (p, c) =>
      this.executeCancelScheduledJob(p as CancelScheduledJobParams, c),
  };
  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Extract userId from JWT in authorization header. Throws AuthRequiredError if missing. */
  private extractUserContext(context: ToolContext): { userId: string; projectApiKey: string } {
    if (context.userId) {
      return { userId: context.userId, projectApiKey: context.projectApiKey || 'unknown' };
    }
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

    const { delay, executeAt, ...toolParams } = params as Record<string, unknown> & {
      delay?: number;
      executeAt?: string;
    };

    if (delay !== undefined || executeAt !== undefined) {
      return this.schedulerService.schedule({
        toolName,
        params: toolParams,
        delay,
        executeAt,
        authorization: context.authorization || '',
        projectApiKey: context.projectApiKey || 'unknown',
      });
    }

    return handler(toolParams, context);
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

      const tokens = params.query.toLowerCase().split(/\s+/).filter(Boolean);
      const scoreText = (text: string) =>
        tokens.filter((t) => text.toLowerCase().includes(t)).length;

      const matchedDevices = devices
        .map((d) => ({ d, score: Math.max(scoreText(d.label ?? ''), scoreText(d.desc ?? '')) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ d }) => {
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
        .filter((l) => scoreText(l.label ?? '') + scoreText(l.desc ?? '') > 0)
        .map((l) => ({ uuid: l.uuid, label: l.label, desc: l.desc }));

      const matchedGroups = groups
        .filter((g) => scoreText(g.label ?? '') + scoreText(g.desc ?? '') > 0)
        .map((g) => ({ uuid: g.uuid, label: g.label, desc: g.desc, locationId: g.locationId }));

      if (
        matchedDevices.length === 0 &&
        matchedLocations.length === 0 &&
        matchedGroups.length === 0
      ) {
        return this.successResult({
          total: 0,
          devices: [],
          locations: [],
          groups: [],
          message: 'No matches found. Try shorter keywords. All available devices:',
          allDevices: devices.map((d) => {
            const typeInfo = resolveDeviceType(d);
            return {
              uuid: d.uuid,
              label: d.label,
              ...(typeInfo && { deviceType: typeInfo.deviceType }),
            };
          }),
        });
      }

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

      const result = { _view: 'list', total: slimDevices.length, devices: slimDevices };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
      };
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

  /** Get device with full payload + deviceType/brand enrichment + location/group labels + state */
  private async executeGetDevice(
    params: GetDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const device = await this.iotApiService.getDevice(projectApiKey, userId, params.uuid);

      // Fetch location label, group label, and device state in parallel
      const [location, group, state] = await Promise.all([
        device.locationId
          ? this.iotApiService
              .getLocation(projectApiKey, userId, device.locationId)
              .catch(() => null)
          : Promise.resolve(null),
        device.groupId
          ? this.iotApiService.getGroup(projectApiKey, userId, device.groupId).catch(() => null)
          : Promise.resolve(null),
        this.iotApiService.getDeviceState(projectApiKey, params.uuid).catch(() => null),
      ]);

      const typeInfo = resolveDeviceType(device);
      const productDecoded = device.productId ? decodeProductId(device.productId) : null;

      // Normalize state to flat element→attribute map { "1": { "1": [1,1] }, ... }
      // The getDeviceState API may return wrapped: { state: {...}, mac, devId, ... }
      const stateMap = extractStateMap(state);

      const enrichedDevice = {
        ...device,
        ...(typeInfo && { deviceType: typeInfo.deviceType, deviceTypeId: typeInfo.deviceTypeId }),
        ...(productDecoded && { brand: productDecoded.brand, ownership: productDecoded.ownership }),
        locationLabel: location?.label ?? null,
        groupLabel: group?.label ?? null,
        state: stateMap,
      };

      const result = { _view: 'dashboard', ...enrichedDevice };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(enrichedDevice) }],
        structuredContent: result as Record<string, unknown>,
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
      const stateMap = extractStateMap(state);
      const translated = stateMap ? translateDeviceState(stateMap) : {};
      return this.successResult({ uuid: params.uuid, ...translated });
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

      const slimState = Array.isArray(state)
        ? state.map((entry) => {
            const stateMap = extractStateMap(entry.state ?? entry);
            const translated = stateMap ? translateDeviceState(stateMap) : {};
            return {
              mac: entry.mac,
              devId: entry.devId,
              ...translated,
              updatedAt: entry.updatedAt,
            };
          })
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
      const stateMap = extractStateMap(state);
      const translated = stateMap ? translateDeviceState(stateMap) : {};
      return this.successResult({ macAddress: params.macAddress, ...translated });
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

  /** Control device by setting one or more attributes (property-bag matching state output keys) */
  private async executeControlDeviceSimple(
    params: ControlDeviceSimpleParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const { uuid, elementId, ...attrs } = params;
      const commands = buildControlCommands(attrs);

      if (commands.length === 0) {
        throw new BadRequestException(
          'At least one attribute must be specified: power, brightness, kelvin, temperature, mode, or color.',
        );
      }

      const device = await this.iotApiService.getDevice(projectApiKey, userId, uuid);
      const elementIds = elementId != null ? [elementId] : device.elementIds;
      const basePayload = {
        eid: device.eid,
        elementIds,
        endpoint: device.endpoint,
        partnerId: device.partnerId,
        rootUuid: device.rootUuid ?? device.uuid,
        protocolCtl: device.protocolCtl,
      };

      const results: unknown[] = [];
      for (const command of commands) {
        results.push(
          await this.iotApiService.controlDevice(projectApiKey, { ...basePayload, command }),
        );
      }

      return this.successResult(results.length === 1 ? results[0] : results);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /**
   * Widget-only: fetch device details + state for in-place navigation.
   * Same logic as executeGetDevice but without _view hint — the widget decides the view.
   * Not visible to the model (visibility: ['app']).
   */
  private async executeWidgetGetDevice(
    params: WidgetGetDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const device = await this.iotApiService.getDevice(projectApiKey, userId, params.uuid);

      const [location, group, state] = await Promise.all([
        device.locationId
          ? this.iotApiService
              .getLocation(projectApiKey, userId, device.locationId)
              .catch(() => null)
          : Promise.resolve(null),
        device.groupId
          ? this.iotApiService.getGroup(projectApiKey, userId, device.groupId).catch(() => null)
          : Promise.resolve(null),
        this.iotApiService.getDeviceState(projectApiKey, params.uuid).catch(() => null),
      ]);

      const typeInfo = resolveDeviceType(device);
      const productDecoded = device.productId ? decodeProductId(device.productId) : null;
      const stateMap = extractStateMap(state);

      const enrichedDevice = {
        _view: 'dashboard',
        ...device,
        ...(typeInfo && { deviceType: typeInfo.deviceType, deviceTypeId: typeInfo.deviceTypeId }),
        ...(productDecoded && { brand: productDecoded.brand, ownership: productDecoded.ownership }),
        locationLabel: location?.label ?? null,
        groupLabel: group?.label ?? null,
        state: stateMap,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(enrichedDevice) }],
        structuredContent: enrichedDevice as Record<string, unknown>,
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /**
   * Widget-only: fetch device details + state for dashboard→control view transition.
   * Same logic as executeWidgetGetDevice but adds _view: 'control' to structuredContent.
   * Not visible to the model (visibility: ['app']).
   */
  private async executeWidgetControlDevice(
    params: WidgetControlDeviceParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const device = await this.iotApiService.getDevice(projectApiKey, userId, params.uuid);

      const [location, group, state] = await Promise.all([
        device.locationId
          ? this.iotApiService
              .getLocation(projectApiKey, userId, device.locationId)
              .catch(() => null)
          : Promise.resolve(null),
        device.groupId
          ? this.iotApiService.getGroup(projectApiKey, userId, device.groupId).catch(() => null)
          : Promise.resolve(null),
        this.iotApiService.getDeviceState(projectApiKey, params.uuid).catch(() => null),
      ]);

      const typeInfo = resolveDeviceType(device);
      const productDecoded = device.productId ? decodeProductId(device.productId) : null;
      const stateMap = extractStateMap(state);

      const enrichedDevice = {
        _view: 'control',
        ...device,
        ...(typeInfo && { deviceType: typeInfo.deviceType, deviceTypeId: typeInfo.deviceTypeId }),
        ...(productDecoded && { brand: productDecoded.brand, ownership: productDecoded.ownership }),
        locationLabel: location?.label ?? null,
        groupLabel: group?.label ?? null,
        state: stateMap,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(enrichedDevice) }],
        structuredContent: enrichedDevice as Record<string, unknown>,
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  /**
   * Widget-only: fetch device list for in-place list view refresh.
   * Same data as list_devices but includes structuredContent for widget re-rendering.
   * Not visible to the model (visibility: ['app']).
   */
  private async executeWidgetListDevices(
    params: WidgetListDevicesParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);

      const allDevices = await this.iotApiService.listDevices(
        projectApiKey,
        userId,
        params.locationId ?? undefined,
      );

      // Filter by groupId client-side (API doesn't support groupId query param)
      const devices = params.groupId
        ? allDevices.filter((d) => d.groupId === params.groupId)
        : allDevices;

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

      // Resolve context labels in parallel when a filter is active
      const [locationLabel, groupLabel] = await Promise.all([
        params.locationId
          ? this.iotApiService
              .getLocation(projectApiKey, userId, params.locationId)
              .then((l) => l.label ?? null)
              .catch(() => null)
          : Promise.resolve(null),
        params.groupId
          ? this.iotApiService
              .getGroup(projectApiKey, userId, params.groupId)
              .then((g) => g.label ?? null)
              .catch(() => null)
          : Promise.resolve(null),
      ]);

      const _view = params.locationId ? 'location' : params.groupId ? 'group' : 'list';

      const result = {
        _view,
        total: slimDevices.length,
        devices: slimDevices,
        ...(params.locationId && { locationId: params.locationId, locationLabel }),
        ...(params.groupId && { groupId: params.groupId, groupLabel }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return this.errorResult(error);
    }
  }

  // ─── Smart (Scene/Automation) Handlers ────────────────────────────────────────

  private async executeListSmarts(
    _params: ListSmartsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const smarts = await this.iotApiService.listSmarts(projectApiKey, userId);

      const slimSmarts = smarts.map((smart) => ({
        uuid: smart.uuid,
        label: smart.label,
        smid: smart.smid,
        locId: smart.locId,
        fav: smart.fav,
      }));

      return this.successResult({ total: slimSmarts.length, smarts: slimSmarts });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async executeGetSmart(
    params: GetSmartParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const smart = await this.iotApiService.getSmart(projectApiKey, userId, params.uuid);

      return this.successResult({
        uuid: smart.uuid,
        label: smart.label,
        smid: smart.smid,
        locId: smart.locId,
        fav: smart.fav,
      });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async executeActivateSmart(
    params: ActivateSmartParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { projectApiKey } = this.extractUserContext(context);
      const result = await this.iotApiService.activateSmart(
        projectApiKey,
        params.smid,
        params.locId,
      );

      return this.successResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async executeListSmartCmds(
    params: ListSmartCmdsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const cmds = await this.iotApiService.listSmartCmds(
        projectApiKey,
        userId,
        params.smartId ?? undefined,
      );

      const slimCmds = cmds.map((cmd) => ({
        uuid: cmd.uuid,
        smartId: cmd.smartId,
        targetId: cmd.targetId,
        target: cmd.target,
        cmds: cmd.cmds,
      }));

      return this.successResult({ total: slimCmds.length, commands: slimCmds });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  // ─── Scheduler Management Handlers ──────────────────────────────────────────

  private async executeListScheduledJobs(
    _params: ListScheduledJobsParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const jobs = await this.schedulerService.listJobs(userId, projectApiKey);
      return this.successResult({ total: jobs.length, jobs });
    } catch (error) {
      return this.errorResult(error);
    }
  }

  private async executeCancelScheduledJob(
    params: CancelScheduledJobParams,
    context: ToolContext,
  ): Promise<CallToolResult> {
    try {
      const { userId, projectApiKey } = this.extractUserContext(context);
      const result = await this.schedulerService.cancelJob(params.jobId, userId, projectApiKey);
      return this.successResult(result);
    } catch (error) {
      return this.errorResult(error);
    }
  }
}
