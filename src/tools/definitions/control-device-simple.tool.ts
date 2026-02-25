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
      'Action to perform. Options: turn_on, turn_off, set_brightness (0-1000), set_kelvin (0-65000), set_temperature (15-30°C), set_mode (0=AUTO, 1=COOLING, 2=DRY, 3=HEATING, 4=FAN)',
    ),
  value: z
    .number()
    .optional()
    .describe(
      'Value for set_* actions. Required for set_brightness, set_kelvin, set_temperature, set_mode. Not used for turn_on/turn_off',
    ),
  elementId: z
    .number()
    .optional()
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
    'Control device using simplified actions. THIS IS A DESTRUCTIVE OPERATION that changes device state. Actions: turn_on, turn_off, set_brightness (0-1000), set_kelvin (0-65000), set_temperature (15-30°C for AC), set_mode (0=AUTO, 1=COOLING, 2=DRY, 3=HEATING, 4=FAN for AC). Wait 2-3 seconds before checking state as commands are asynchronous (MQTT).',
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
          'Action to perform. Options: turn_on, turn_off, set_brightness (0-1000), set_kelvin (0-65000), set_temperature (15-30°C), set_mode (0=AUTO, 1=COOLING, 2=DRY, 3=HEATING, 4=FAN)',
      },
      value: {
        type: 'number',
        description:
          'Value for set_* actions. Required for set_brightness, set_kelvin, set_temperature, set_mode. Not used for turn_on/turn_off',
      },
      elementId: {
        type: 'number',
        description: 'Optional specific element ID to control. If omitted, controls all elements',
      },
    },
    required: ['uuid', 'action'],
  },
  metadata: {
    name: 'control_device_simple',
    description:
      'Control device using simplified actions. THIS IS A DESTRUCTIVE OPERATION that changes device state. Actions: turn_on, turn_off, set_brightness (0-1000), set_kelvin (0-65000), set_temperature (15-30°C for AC), set_mode (0=AUTO, 1=COOLING, 2=DRY, 3=HEATING, 4=FAN for AC). Wait 2-3 seconds before checking state as commands are asynchronous (MQTT).',
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
