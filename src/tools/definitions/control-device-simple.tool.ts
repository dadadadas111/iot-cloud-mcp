import { z } from 'zod';
import type { ControlAttrs } from '../utils/device-control.utils';

const HsvSchema = z.object({
  h: z.number().min(0).max(360).describe('Hue 0-360°'),
  s: z.number().min(0).max(100).describe('Saturation 0-100%'),
  v: z.number().min(0).max(100).describe('Value/brightness 0-100%'),
});

const ControlDeviceSimpleParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
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
    .describe('Specific element ID to control. Omit to control all elements.'),
});

export type ControlDeviceSimpleParams = z.infer<typeof ControlDeviceSimpleParamsSchema> &
  ControlAttrs & { uuid: string; elementId?: number };

const DESCRIPTION =
  'IMPORTANT: Always call get_device_state (or get_device) first. ' +
  'Attributes present in the state output are the ones this device supports — use the state as your reference. ' +
  'Set one or more attributes matching their state key names: ' +
  'power ("on"/"off"), brightness (0-100%), kelvin (0-65000K), temperature (15-30°C), ' +
  'mode ("AUTO"/"COOL"/"DRY"/"HEAT"/"FAN"), color ({h 0-360, s 0-100, v 0-100}). ' +
  'Only pass the attributes you want to change. ' +
  'Async via MQTT — wait 2-3s then re-check state.';

export const CONTROL_DEVICE_SIMPLE_TOOL = {
  name: 'control_device_simple',
  description: DESCRIPTION,
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: { type: 'string', description: 'Device UUID' },
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
        description: 'Specific element ID to control. Omit to control all elements.',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: 'control_device_simple',
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
  schema: ControlDeviceSimpleParamsSchema,
};
