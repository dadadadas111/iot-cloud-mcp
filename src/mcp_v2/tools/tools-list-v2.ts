import * as z from 'zod';

export interface ToolMeta {
  description: string;
  inputSchema: z.ZodTypeAny;
}

export const ToolsListV2: Record<string, ToolMeta> = {
  init_api_key: {
    description: 'Initialize this MCP session with a project API key. MUST be called before other tools.',
    inputSchema: z.object({ apiKey: z.string().describe('Project API key (x-api-key)') }),
  },
  find_user_id: {
    description: 'Resolve an end-user ID by email or phone. Admin provides email/phone in `data`.',
    inputSchema: z.object({ data: z.string().describe('End-user email or phone') }),
  },
  list_devices: {
    description: 'List devices for a given end-user `userId` or resolve by email/phone using `data`.',
    inputSchema: z.object({ userId: z.string().optional(), data: z.string().optional().describe('End-user email or phone') }),
  },
  list_locations: {
    description: 'List locations for a given end-user `userId` or resolve by email/phone using `data`.',
    inputSchema: z.object({ userId: z.string().optional(), data: z.string().optional().describe('End-user email or phone') }),
  },
  list_groups: {
    description: "List user's groups for a given end-user `userId` or resolve by email/phone using `data`.",
    inputSchema: z.object({ userId: z.string().optional(), data: z.string().optional().describe('End-user email or phone') }),
  },
  get_device: {
    description: 'Get a single device by `userId` and `uuid`.',
    inputSchema: z.object({ userId: z.string(), uuid: z.string() }),
  },
  get_state_by_location: {
    description: 'Get device states for a `locationUuid`.',
    inputSchema: z.object({ locationUuid: z.string() }),
  },
  get_state_by_devId: {
    description: 'Get device state by `devId`.',
    inputSchema: z.object({ devId: z.string() }),
  },
  control_device_simple: {
    description:
      'Simplified device control. Provide `userId` (or email/phone to be resolved), `uuid`, `action`, and optional `value`/`elementId`.',
    inputSchema: z.object({
      userId: z.string().optional(),
      data: z.string().optional().describe('End-user email or phone (optional, will be resolved)'),
      uuid: z.string().describe('Device UUID'),
      action: z.enum(['turn_on', 'turn_off', 'set_brightness', 'set_kelvin', 'set_temperature', 'set_mode']),
      value: z.number().optional(),
      elementId: z.number().optional(),
    }),
  },
};

export const ToolNamesV2 = Object.keys(ToolsListV2);
