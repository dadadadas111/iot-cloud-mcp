/**
 * control_device Tool Definition
 * Send raw control command to device - DESTRUCTIVE OPERATION
 */

import { z } from 'zod';

/**
 * control_device tool parameters
 */
const ControlDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
  elementIds: z.array(z.number()).describe('Array of element IDs to control'),
  command: z
    .array(z.number())
    .describe(
      'Command array: [attributeId, value, attributeId2, value2, ...]. Examples: [1, 1] for ON, [28, 700] for brightness 700',
    ),
});

/** Type for control_device parameters */
export type ControlDeviceParams = z.infer<typeof ControlDeviceParamsSchema>;

/**
 * control_device MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const CONTROL_DEVICE_TOOL = {
  name: 'control_device',
  description:
    'Send raw control command to device. THIS IS A DESTRUCTIVE OPERATION that changes device state. Command format: [attributeId, value, ...]. Examples: [1, 1]=ON, [1, 0]=OFF, [28, 700]=brightness 700, [257, 1, 1, 24, 2, 0]=AC ON/COOLING/24°C/normal fan/auto swing. Wait 2-3 seconds before checking state as commands are asynchronous (MQTT).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID',
      },
      elementIds: {
        type: 'array',
        items: {
          type: 'number',
        },
        description: 'Array of element IDs to control',
      },
      command: {
        type: 'array',
        items: {
          type: 'number',
        },
        description:
          'Command array: [attributeId, value, attributeId2, value2, ...]. Examples: [1, 1] for ON, [28, 700] for brightness 700',
      },
    },
    required: ['uuid', 'elementIds', 'command'],
  },
  metadata: {
    name: 'control_device',
    description:
      'Send raw control command to device. THIS IS A DESTRUCTIVE OPERATION that changes device state. Command format: [attributeId, value, ...]. Examples: [1, 1]=ON, [1, 0]=OFF, [28, 700]=brightness 700, [257, 1, 1, 24, 2, 0]=AC ON/COOLING/24°C/normal fan/auto swing. Wait 2-3 seconds before checking state as commands are asynchronous (MQTT).',
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
  schema: ControlDeviceParamsSchema,
};
