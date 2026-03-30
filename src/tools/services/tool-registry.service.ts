import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolExecutorService } from './tool-executor.service';
import { SCHEDULE_PARAMS_SCHEMA } from '../../scheduler/scheduler.constants';
import { FETCH_USER_TOOL } from '../definitions/fetch-user.tool';
import { SEARCH_TOOL } from '../definitions/search.tool';
import { FETCH_TOOL } from '../definitions/fetch.tool';
import { LIST_DEVICES_TOOL } from '../definitions/list-devices.tool';
import { LIST_LOCATIONS_TOOL } from '../definitions/list-locations.tool';
import { LIST_GROUPS_TOOL } from '../definitions/list-groups.tool';
import { GET_DEVICE_TOOL } from '../definitions/get-device.tool';
import { UPDATE_DEVICE_TOOL } from '../definitions/update-device.tool';
import { DELETE_DEVICE_TOOL } from '../definitions/delete-device.tool';
import { GET_DEVICE_STATE_TOOL } from '../definitions/get-device-state.tool';
import { GET_LOCATION_STATE_TOOL } from '../definitions/get-location-state.tool';
import { GET_DEVICE_STATE_BY_MAC_TOOL } from '../definitions/get-device-state-by-mac.tool';
import { CONTROL_DEVICE_TOOL } from '../definitions/control-device.tool';
import { CONTROL_DEVICE_SIMPLE_TOOL } from '../definitions/control-device-simple.tool';
import { WIDGET_LIST_DEVICES_TOOL } from '../definitions/widget-list-devices.tool';
import { WIDGET_GET_DEVICE_TOOL } from '../definitions/widget-get-device.tool';
import { WIDGET_CONTROL_DEVICE_TOOL } from '../definitions/widget-control-device.tool';
import { INTERACTIVE_DEVICE_TOOL } from '../definitions/interactive-device.tool';
import { LIST_SMARTS_TOOL } from '../definitions/list-smarts.tool';
import { GET_SMART_TOOL } from '../definitions/get-smart.tool';
import { ACTIVATE_SMART_TOOL } from '../definitions/activate-smart.tool';
import { LIST_SMART_CMDS_TOOL } from '../definitions/list-smart-cmds.tool';
import { LIST_SCHEDULED_JOBS_TOOL } from '../definitions/list-scheduled-jobs.tool';
import { CANCEL_SCHEDULED_JOB_TOOL } from '../definitions/cancel-scheduled-job.tool';

type ToolDefinition = (typeof ALL_TOOL_DEFINITIONS)[number];

const ALL_TOOL_DEFINITIONS = [
  FETCH_USER_TOOL,
  SEARCH_TOOL,
  FETCH_TOOL,
  LIST_DEVICES_TOOL,
  LIST_LOCATIONS_TOOL,
  LIST_GROUPS_TOOL,
  GET_DEVICE_TOOL,
  UPDATE_DEVICE_TOOL,
  DELETE_DEVICE_TOOL,
  GET_DEVICE_STATE_TOOL,
  GET_LOCATION_STATE_TOOL,
  GET_DEVICE_STATE_BY_MAC_TOOL,
  CONTROL_DEVICE_TOOL,
  CONTROL_DEVICE_SIMPLE_TOOL,
  WIDGET_LIST_DEVICES_TOOL,
  WIDGET_GET_DEVICE_TOOL,
  WIDGET_CONTROL_DEVICE_TOOL,
  INTERACTIVE_DEVICE_TOOL,
  LIST_SMARTS_TOOL,
  GET_SMART_TOOL,
  ACTIVATE_SMART_TOOL,
  LIST_SMART_CMDS_TOOL,
  LIST_SCHEDULED_JOBS_TOOL,
  CANCEL_SCHEDULED_JOB_TOOL,
] as const;

const NON_SCHEDULABLE_TOOLS = new Set(['cancel_scheduled_job']);

function getToolAnnotations(tool: ToolDefinition) {
  const metadata = tool.metadata as {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };

  return {
    ...(metadata.readOnlyHint !== undefined ? { readOnlyHint: metadata.readOnlyHint } : {}),
    ...(metadata.destructiveHint !== undefined
      ? { destructiveHint: metadata.destructiveHint }
      : {}),
    ...(metadata.idempotentHint !== undefined ? { idempotentHint: metadata.idempotentHint } : {}),
    ...(metadata.openWorldHint !== undefined ? { openWorldHint: metadata.openWorldHint } : {}),
  };
}

@Injectable()
export class ToolRegistryService {
  constructor(private toolExecutor: ToolExecutorService) {}

  registerTools(mcpServer: McpServer, projectApiKey: string): void {
    for (const tool of ALL_TOOL_DEFINITIONS) {
      const isSchedulable =
        tool.metadata.readOnlyHint === false && !NON_SCHEDULABLE_TOOLS.has(tool.name);

      const schema = isSchedulable ? tool.schema.merge(SCHEDULE_PARAMS_SCHEMA) : tool.schema;

      mcpServer.registerTool(
        tool.name,
        {
          description: tool.metadata.description,
          inputSchema: schema,
          annotations: getToolAnnotations(tool),
          ...('_meta' in tool && tool._meta ? { _meta: tool._meta } : {}),
        },
        async (params: Record<string, unknown>, extra) => {
          return this.toolExecutor.executeTool(tool.name, params, {
            authorization: extra.authInfo?.token ? `Bearer ${extra.authInfo.token}` : '',
            projectApiKey,
            meta: extra as Record<string, unknown>,
          });
        },
      );
    }
  }
}
