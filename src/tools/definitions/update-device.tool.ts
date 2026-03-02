/**
 * update_device Tool Definition
 * Update device properties like label, description, location, or group
 */

import { z } from 'zod';

/**
 * update_device tool parameters
 */
const UpdateDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
  label: z.string().nullish().describe('Optional new label for the device'),
  desc: z.string().nullish().describe('Optional new description for the device'),
  locationId: z.string().nullish().describe('Optional new location UUID to move the device'),
  groupId: z.string().nullish().describe('Optional new group UUID to assign the device'),
});

/** Type for update_device parameters */
export type UpdateDeviceParams = z.infer<typeof UpdateDeviceParamsSchema>;

/**
 * update_device MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const UPDATE_DEVICE_TOOL = {
  name: 'update_device',
  description:
    'Update device properties. You can update label, description, location, or group. At least one optional field must be provided.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID',
      },
      label: {
        type: ['string', 'null'],
        description: 'Optional new label for the device',
      },
      desc: {
        type: ['string', 'null'],
        description: 'Optional new description for the device',
      },
      locationId: {
        type: ['string', 'null'],
        description: 'Optional new location UUID to move the device',
      },
      groupId: {
        type: ['string', 'null'],
        description: 'Optional new group UUID to assign the device',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: 'update_device',
    description:
      'Update device properties. You can update label, description, location, or group. At least one optional field must be provided.',
    readOnlyHint: false,
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
  schema: UpdateDeviceParamsSchema,
};
