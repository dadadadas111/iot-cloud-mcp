/**
 * get_device Tool Definition
 * Get a specific device by UUID
 */

import { z } from 'zod';

/**
 * get_device tool parameters
 */
const GetDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
});

/** Type for get_device parameters */
export type GetDeviceParams = z.infer<typeof GetDeviceParamsSchema>;

/**
 * get_device MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const GET_DEVICE_TOOL = {
  name: 'get_device',
  description:
    'Get a specific device by UUID. Returns detailed device information including label, description, location, group, and control parameters.',
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
    name: 'get_device',
    description:
      'Get a specific device by UUID. Returns detailed device information including label, description, location, group, and control parameters.',
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
  schema: GetDeviceParamsSchema,
};
