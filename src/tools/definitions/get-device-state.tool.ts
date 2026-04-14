/**
 * get_device_state Tool Definition
 * Get the current state of a specific device by UUID
 */

import { z } from 'zod';

/**
 * get_device_state tool parameters
 */
const GetDeviceStateParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
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
    'Get the current state of a device by UUID. Returns human-readable state: { uuid, power ("on"/"off"), mode ("AUTO"/"COOL"/"DRY"/"HEAT"/"FAN"), temperature (°C), brightness (0-100%), kelvin }. Multi-element devices (e.g. multi-gang switches) return { uuid, elementCount, elements: { "1": {...}, "2": {...} } } with per-element state. Unknown attributes appear as attr_N.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: 'get_device_state',
    description:
      'Get the current state of a device by UUID. Returns human-readable state: { uuid, power ("on"/"off"), mode ("AUTO"/"COOL"/"DRY"/"HEAT"/"FAN"), temperature (°C), brightness (0-100%), kelvin }. Multi-element devices (e.g. multi-gang switches) return { uuid, elementCount, elements: { "1": {...}, "2": {...} } } with per-element state. Unknown attributes appear as attr_N.',
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
