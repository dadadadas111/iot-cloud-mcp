/**
 * list_locations Tool Definition
 * Get all locations for the authenticated user
 */

import { z } from 'zod';

/**
 * list_locations tool has no parameters
 */
const ListLocationsParamsSchema = z.object({});

/** Type for list_locations parameters */
export type ListLocationsParams = z.infer<typeof ListLocationsParamsSchema>;

/**
 * list_locations MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const LIST_LOCATIONS_TOOL = {
  name: 'list_locations',
  description: 'Get all locations for the authenticated user.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    name: 'list_locations',
    description: 'Get all locations for the authenticated user.',
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
