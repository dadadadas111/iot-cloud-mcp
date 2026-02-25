/**
 * delete_device Tool Definition
 * Permanently delete a device - DESTRUCTIVE OPERATION
 */

import { z } from 'zod';

/**
 * delete_device tool parameters
 */
const DeleteDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID to delete'),
});

/** Type for delete_device parameters */
export type DeleteDeviceParams = z.infer<typeof DeleteDeviceParamsSchema>;

/**
 * delete_device MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const DELETE_DEVICE_TOOL = {
  name: 'delete_device',
  description:
    'Permanently delete a device. THIS IS A DESTRUCTIVE OPERATION and cannot be undone. The device will be removed from the system.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID to delete',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: 'delete_device',
    description:
      'Permanently delete a device. THIS IS A DESTRUCTIVE OPERATION and cannot be undone. The device will be removed from the system.',
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
  schema: DeleteDeviceParamsSchema,
};
