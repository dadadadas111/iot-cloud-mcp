/**
 * search Tool Definition
 * Search across devices, locations, and groups by keyword
 * Returns aggregated search results across all resource types
 */

import { z } from 'zod';

/**
 * search tool parameters
 */
const SearchParamsSchema = z.object({
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
    'Search across devices, locations, and groups by keyword. Returns matching resources from all types.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description:
          'Search keyword to match against device labels, location names, and group names',
      },
    },
    required: ['query'],
  },
  metadata: {
    name: 'search',
    description:
      'Search across devices, locations, and groups by keyword. Returns matching resources from all types.',
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
