/**
 * control_device_simple Tool Definition
 * Control device using simplified actions - DESTRUCTIVE OPERATION
 */

import { z } from 'zod';

/**
 * control_device_simple tool parameters
 */
const ControlDeviceSimpleParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
  action: z
    .enum(['turn_on', 'turn_off', 'set_brightness', 'set_kelvin', 'set_temperature', 'set_mode'])
    .describe(
      'Action to perform. Options: turn_on, turn_off, set_brightness (0-100%), set_kelvin (0-65000K), set_temperature (15-30°C), set_mode (0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN)',
    ),
  value: z
    .number()
    .nullish()
    .describe(
      'Value for set_* actions. Ranges: set_brightness 0-100 (percent), set_kelvin 0-65000, set_temperature 15-30, set_mode 0-4. Not used for turn_on/turn_off.',
    ),
  elementId: z
    .number()
    .nullish()
    .describe('Optional specific element ID to control. If omitted, controls all elements'),
});

/** Type for control_device_simple parameters */
export type ControlDeviceSimpleParams = z.infer<typeof ControlDeviceSimpleParamsSchema>;

/**
 * control_device_simple MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const CONTROL_DEVICE_SIMPLE_TOOL = {
  name: 'control_device_simple',
  description:
    'IMPORTANT: Always call get_device_state (or get_device) first to read current state before issuing control commands. Controlling a device without knowing its current state may cause unintended behavior. ' +
    'Simplified device control with action names. DESTRUCTIVE. Actions: turn_on/off, set_brightness (0-100%), set_kelvin (0-65000K), set_temperature (15-30°C), set_mode (0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN). If elementId omitted, controls all elements. Async via MQTT: wait 2-3s before checking state.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID',
      },
      action: {
        type: 'string',
        enum: [
          'turn_on',
          'turn_off',
          'set_brightness',
          'set_kelvin',
          'set_temperature',
          'set_mode',
        ],
        description:
          'Action to perform. Options: turn_on, turn_off, set_brightness (0-100%), set_kelvin (0-65000K), set_temperature (15-30°C), set_mode (0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN)',
      },
      value: {
        type: ['number', 'null'],
        description:
          'Value for set_* actions. Ranges: set_brightness 0-100 (percent), set_kelvin 0-65000, set_temperature 15-30, set_mode 0-4. Not used for turn_on/turn_off.',
      },
      elementId: {
        type: ['number', 'null'],
        description: 'Optional specific element ID to control. If omitted, controls all elements',
      },
    },
    required: ['uuid', 'action'],
  },
  metadata: {
    name: 'control_device_simple',
    description:
      'IMPORTANT: Always call get_device_state (or get_device) first to read current state before issuing control commands. Controlling a device without knowing its current state may cause unintended behavior. ' +
      'Simplified device control with action names. DESTRUCTIVE. Actions: turn_on/off, set_brightness (0-100%), set_kelvin (0-65000K), set_temperature (15-30°C), set_mode (0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN). If elementId omitted, controls all elements. Async via MQTT: wait 2-3s before checking state.',
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
