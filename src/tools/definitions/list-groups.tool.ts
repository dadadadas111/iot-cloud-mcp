/**
 * list_groups Tool Definition
 * Get all groups, optionally filtered by location
 */

import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

/**
 * list_groups tool parameters
 */
const ListGroupsParamsSchema = PaginationParamsSchema.extend({
  locationId: z.string().nullish().describe('Optional location ID to filter groups by location'),
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
  description:
    'Get groups with compact pagination. Optionally filter by location using locationId. Defaults to limit=20, offset=0.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationId: {
        type: ['string', 'null'],
        description: 'Optional location ID to filter groups by location',
      },
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: [],
  },
  metadata: {
    name: 'list_groups',
    description:
      'Get groups with compact pagination. Optionally filter by location using locationId. Defaults to limit=20, offset=0.',
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
