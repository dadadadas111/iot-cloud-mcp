/**
 * search Tool Definition
 * Search across devices, locations, and groups by keyword
 * Returns aggregated search results across all resource types
 */

import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

/**
 * search tool parameters
 */
const SearchParamsSchema = PaginationParamsSchema.extend({
  query: z
    .string()
    .describe('Search keyword to match against device labels, location names, and group names'),
});

/** Type for search parameters */
export type SearchParams = z.infer<typeof SearchParamsSchema>;

/**
 * search MCP Tool Definition
 * Searches across multiple resource types and returns aggregated results
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const SEARCH_TOOL = {
  name: 'search',
  description:
    'Search devices, locations, and groups by keyword with compact pagination. Use keywords only — not full sentences (e.g., "phòng khách" not "bật đèn phòng khách"). Defaults to limit=20, offset=0. If nothing matched, a capped suggestion list is returned instead of dumping every device.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Search keyword to match against device labels, location names, and group names',
      },
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: ['query'],
  },
  metadata: {
    name: 'search',
    description:
      'Search devices, locations, and groups by keyword with compact pagination. Use keywords only — not full sentences (e.g., "phòng khách" not "bật đèn phòng khách"). Defaults to limit=20, offset=0. If nothing matched, a capped suggestion list is returned instead of dumping every device.',
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
  // Zod schema for validation (not sent to MCP, used internally)
  schema: SearchParamsSchema,
};
