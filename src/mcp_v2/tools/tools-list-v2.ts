import * as z from 'zod';

export interface ToolMeta {
  description: string;
  inputSchema: z.ZodTypeAny;
}

export const ToolsListV2: Record<string, ToolMeta> = {
  find_user_id: {
    description: 'Resolve an end-user ID by email or phone. Admin provides email/phone in `data`.',
    inputSchema: z.object({ data: z.string().describe('End-user email or phone') }),
  },
  list_devices: {
    description: 'List devices for a given end-user `userId`.',
    inputSchema: z.object({ userId: z.string().describe('End-user userId') }).partial(),
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
