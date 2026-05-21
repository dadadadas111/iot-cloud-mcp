/**
 * list_locations Tool Definition
 * Get all locations for the authenticated user
 */

import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

/**
 * list_locations tool has no parameters
 */
const ListLocationsParamsSchema = PaginationParamsSchema.extend({});

/** Type for list_locations parameters */
export type ListLocationsParams = z.infer<typeof ListLocationsParamsSchema>;

/**
 * list_locations MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const LIST_LOCATIONS_TOOL = {
  name: 'list_locations',
  description:
    'Get locations for the authenticated user with compact pagination. Defaults to limit=20, offset=0.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: [],
  },
  metadata: {
    name: 'list_locations',
    description:
      'Get locations for the authenticated user with compact pagination. Defaults to limit=20, offset=0.',
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
  schema: ListLocationsParamsSchema,
};
