/**
 * list_groups Tool Definition
 * Get all groups, optionally filtered by location
 */

import { z } from 'zod';

/**
 * list_groups tool parameters
 */
const ListGroupsParamsSchema = z.object({
  locationId: z.string().optional().describe('Optional location ID to filter groups by location'),
});

/** Type for list_groups parameters */
export type ListGroupsParams = z.infer<typeof ListGroupsParamsSchema>;

/**
 * list_groups MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const LIST_GROUPS_TOOL = {
  name: 'list_groups',
  description: 'Get all groups. Optionally filter by location using locationId parameter.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationId: {
        type: 'string',
        description: 'Optional location ID to filter groups by location',
      },
    },
    required: [],
  },
  metadata: {
    name: 'list_groups',
    description: 'Get all groups. Optionally filter by location using locationId parameter.',
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
  schema: ListGroupsParamsSchema,
};
