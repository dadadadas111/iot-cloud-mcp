import { z } from 'zod';
import type { ControlAttrs } from '../utils/device-control.utils';

const HsvSchema = z.object({
  h: z.number().min(0).max(360).describe('Hue 0-360°'),
  s: z.number().min(0).max(100).describe('Saturation 0-100%'),
  v: z.number().min(0).max(100).describe('Value/brightness 0-100%'),
});

const ControlDevicesBulkParamsSchema = z.object({
  uuids: z
    .array(z.string())
    .min(1)
    .max(50)
    .describe('Device UUIDs to control (1-50). Typically obtained from a prior list_devices call.'),
  power: z.enum(['on', 'off']).optional().describe('"on" or "off"'),
  brightness: z.number().min(0).max(100).optional().describe('Brightness 0-100 (%)'),
  kelvin: z.number().min(0).max(65000).optional().describe('Color temperature 0-65000 (K)'),
  temperature: z.number().min(15).max(30).optional().describe('Target temperature 15-30 (°C)'),
  mode: z
    .enum(['AUTO', 'COOL', 'DRY', 'HEAT', 'FAN'])
    .optional()
    .describe('AC mode: AUTO, COOL, DRY, HEAT, or FAN'),
  color: HsvSchema.optional().describe('HSV color — h 0-360°, s 0-100%, v 0-100%'),
  elementId: z
    .number()
    .optional()
    .describe(
      'Optional element ID applied uniformly to ALL targeted devices. Omit to control all elements on each device. Only use if every targeted device shares the same element numbering.',
    ),
});

export type ControlDevicesBulkParams = z.infer<typeof ControlDevicesBulkParamsSchema> &
  ControlAttrs & { uuids: string[]; elementId?: number };

const DESCRIPTION =
  'Apply the SAME control settings to multiple devices in one call (e.g. "turn off all lights", "set all ACs to 26°C"). ' +
  'You must already have the UUIDs — typically from a prior list_devices call; the AI is responsible for selecting which devices to target. ' +
  'Pass only the attributes you want to change — each device silently ignores attributes it does not support. ' +
  'Devices are controlled in parallel (concurrency 10) and partial failures are reported per-device, so one offline device will not block the others. ' +
  'Returns { total, succeeded, failed, results[] } so you can tell the user exactly which devices succeeded or failed. ' +
  'For single-device control use control_device_simple instead. Async via MQTT — wait 2-3s then re-check state.';

export const CONTROL_DEVICES_BULK_TOOL = {
  name: 'control_devices_bulk',
  description: DESCRIPTION,
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuids: {
        type: 'array',
        items: { type: 'string' },
        minItems: 1,
        maxItems: 50,
        description:
          'Device UUIDs to control (1-50). Typically obtained from a prior list_devices call.',
      },
      power: { type: 'string', enum: ['on', 'off'], description: '"on" or "off"' },
      brightness: { type: 'number', minimum: 0, maximum: 100, description: 'Brightness 0-100 (%)' },
      kelvin: {
        type: 'number',
        minimum: 0,
        maximum: 65000,
        description: 'Color temperature 0-65000 (K)',
      },
      temperature: {
        type: 'number',
        minimum: 15,
        maximum: 30,
        description: 'Target temperature 15-30 (°C)',
      },
      mode: {
        type: 'string',
        enum: ['AUTO', 'COOL', 'DRY', 'HEAT', 'FAN'],
        description: 'AC mode',
      },
      color: {
        type: 'object',
        properties: {
          h: { type: 'number', minimum: 0, maximum: 360, description: 'Hue 0-360°' },
          s: { type: 'number', minimum: 0, maximum: 100, description: 'Saturation 0-100%' },
          v: { type: 'number', minimum: 0, maximum: 100, description: 'Value/brightness 0-100%' },
        },
        required: ['h', 's', 'v'],
        description: 'HSV color',
      },
      elementId: {
        type: 'number',
        description:
          'Optional element ID applied uniformly to ALL targeted devices. Omit to control all elements on each device.',
      },
    },
    required: ['uuids'],
  },
  metadata: {
    name: 'control_devices_bulk',
    description: DESCRIPTION,
    readOnlyHint: false,
    destructiveHint: true,
    securitySchemes: {
      oauth2: {
        type: 'oauth2',
        flows: {
          implicit: {
            scopes: {
              'mcp.tools.write': 'Write access to MCP tools',
            },
          },
        },
      },
    },
  },
  schema: ControlDevicesBulkParamsSchema,
};
