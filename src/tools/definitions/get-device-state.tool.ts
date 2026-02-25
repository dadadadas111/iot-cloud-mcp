/**
 * get_device_state Tool Definition
 * Get the current state of a specific device by UUID
 */

import { z } from 'zod';

/**
 * get_device_state tool parameters
 */
const GetDeviceStateParamsSchema = z.object({
  deviceUuid: z.string().describe('Device UUID'),
});

/** Type for get_device_state parameters */
export type GetDeviceStateParams = z.infer<typeof GetDeviceStateParamsSchema>;

/**
 * get_device_state MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const GET_DEVICE_STATE_TOOL = {
  name: 'get_device_state',
  description:
    'Get the current state of a specific device by UUID. Returns device state with attributes like power, brightness, temperature, etc.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      deviceUuid: {
        type: 'string',
        description: 'Device UUID',
      },
    },
    required: ['deviceUuid'],
  },
  metadata: {
    name: 'get_device_state',
    description:
      'Get the current state of a specific device by UUID. Returns device state with attributes like power, brightness, temperature, etc.',
    readOnlyHint: true,
    securitySchemes: {
      oauth2: {
        type: 'oauth2',
        flows: {
          implicit: {
            scopes: {
              'mcp.tools.read': 'Read access to MCP tools',
            },
          },
        },
      },
    },
  },
  schema: GetDeviceStateParamsSchema,
};
