/**
 * get_device_state_by_mac Tool Definition
 * Get device state by MAC address within a location
 */

import { z } from 'zod';

/**
 * get_device_state_by_mac tool parameters
 */
const GetDeviceStateByMacParamsSchema = z.object({
  locationUuid: z.string().describe('Location UUID'),
  macAddress: z.string().describe('Device MAC address'),
});

/** Type for get_device_state_by_mac parameters */
export type GetDeviceStateByMacParams = z.infer<typeof GetDeviceStateByMacParamsSchema>;

/**
 * get_device_state_by_mac MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const GET_DEVICE_STATE_BY_MAC_TOOL = {
  name: 'get_device_state_by_mac',
  description:
    'Get device state by MAC address within a location. Useful when you have the MAC address but not the device UUID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationUuid: {
        type: 'string',
        description: 'Location UUID',
      },
      macAddress: {
        type: 'string',
        description: 'Device MAC address',
      },
    },
    required: ['locationUuid', 'macAddress'],
  },
  metadata: {
    name: 'get_device_state_by_mac',
    description:
      'Get device state by MAC address within a location. Useful when you have the MAC address but not the device UUID.',
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
  schema: GetDeviceStateByMacParamsSchema,
};
