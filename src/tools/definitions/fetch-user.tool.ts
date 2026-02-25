/**
 * fetchUser Tool Definition
 * Defines the fetchUser MCP tool with zod schema and metadata
 * Used by ToolRegistryService to register with MCP server
 */

import { z } from 'zod';

/**
 * fetchUser tool has no parameters - userId is extracted from Bearer token
 */
const FetchUserParamsSchema = z.object({});

/** Type for fetchUser parameters (empty object) */
export type FetchUserParams = z.infer<typeof FetchUserParamsSchema>;

/**
 * fetchUser MCP Tool Definition
 * Declares the tool with metadata, description, and security requirements
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const FETCH_USER_TOOL = {
  name: 'fetchUser',
  description: 'Fetch the authenticated user\'s data from the IoT API Server (userId extracted from token)',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    name: 'fetchUser',
    description: 'Fetch the authenticated user\'s data from the IoT API Server (userId extracted from token)',
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
  schema: FetchUserParamsSchema,
};
