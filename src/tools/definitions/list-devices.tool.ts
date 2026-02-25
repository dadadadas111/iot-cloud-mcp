/**
 * list_devices Tool Definition
 * Get all devices, optionally filtered by location
 */

import { z } from 'zod';

/**
 * list_devices tool parameters
 */
const ListDevicesParamsSchema = z.object({
  locationId: z.string().optional().describe('Optional location ID to filter devices by location'),
});

/** Type for list_devices parameters */
export type ListDevicesParams = z.infer<typeof ListDevicesParamsSchema>;

/**
 * list_devices MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const LIST_DEVICES_TOOL = {
  name: 'list_devices',
  description: 'Get all devices. Optionally filter by location using locationId parameter.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationId: {
        type: 'string',
        description: 'Optional location ID to filter devices by location',
      },
    },
    required: [],
  },
  metadata: {
    name: 'list_devices',
    description: 'Get all devices. Optionally filter by location using locationId parameter.',
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
  schema: ListDevicesParamsSchema,
};
