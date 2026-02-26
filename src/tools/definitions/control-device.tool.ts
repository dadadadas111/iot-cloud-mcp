/**
 * control_device Tool Definition
 * Simplified tool for controlling IoT devices
 */

import { z } from 'zod';

/**
 * control_device tool parameters
 *
 * This tool requires only the minimal parameters needed to control a device.
 * Other details (e.g., endpoint, partnerId, rootUuid) are fetched automatically.
 */
const ControlDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID to control'),
  elementIds: z
    .array(z.number())
    .describe('Array of element IDs to control (e.g., [1, 2, 3])'),
  command: z
    .array(z.number())
    .describe('Array of commands to send to the elements (e.g., [1, 0])'),
});

/** Type for control_device parameters */
export type ControlDeviceParams = z.infer<typeof ControlDeviceParamsSchema>;

/**
 * control_device MCP Tool Definition
 *
 * This tool allows you to control IoT devices by specifying the device UUID,
 * the elements to control, and the commands to send. Other required fields
 * are fetched automatically based on the device UUID.
 *
 * Example:
 * ```json
 * {
 *   "uuid": "6989563f05252e68f5879eae",
 *   "elementIds": [1, 2],
 *   "command": [1, 0]
 * }
 * ```
 *
 * This example turns off elements 1 and 2 of the specified device.
 */
export const CONTROL_DEVICE_TOOL = {
  name: 'control_device',
  description:
    'Control IoT devices by UUID, element IDs, and commands. Elements are physical parts (e.g., 4-button switch has 4 elements). Command format: [attrId, value]. Common attrs: 1=ON_OFF (0/1), 28=BRIGHTNESS (0-1000), 29=KELVIN, 20=TEMP_SET (15-30°C), 17=MODE. Call get_device_documentation for full reference.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID to control',
      },
      elementIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of element IDs to control (e.g., [1, 2, 3])',
      },
      command: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of commands to send to the elements (e.g., [1, 0])',
      },
    },
    required: ['uuid', 'elementIds', 'command'],
  },
  metadata: {
    name: 'control_device',
    description:
    'Control IoT devices by UUID, element IDs, and commands. Elements are physical parts (e.g., 4-button switch has 4 elements). Command format: [attrId, value]. Common attrs: 1=ON_OFF (0/1), 28=BRIGHTNESS (0-1000), 29=KELVIN, 20=TEMP_SET (15-30°C), 17=MODE. Call get_device_documentation for full reference.',
    examples: [
      {
        input: {
          uuid: '6989563f05252e68f5879eae',
          elementIds: [1, 2],
          command: [1, 0],
        },
        description: 'Turns off elements 1 and 2 of the specified device.',
      },
    ],
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
  schema: ControlDeviceParamsSchema,
};
