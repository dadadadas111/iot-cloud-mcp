/**
 * fetchUser Tool Definition
 * Defines the fetchUser MCP tool with zod schema and metadata
 * Used by ToolRegistryService to register with MCP server
 */

import { z } from 'zod';

/**
 * fetchUser tool parameter schema
 * Validates input parameters for user fetching
 */
const FetchUserParamsSchema = z.object({
  userId: z.string().min(1, 'userId is required').describe('The user ID to fetch'),
});

/** Type for fetchUser parameters */
export type FetchUserParams = z.infer<typeof FetchUserParamsSchema>;

/**
 * fetchUser MCP Tool Definition
 * Declares the tool with metadata, description, and security requirements
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const FETCH_USER_TOOL = {
  name: 'fetchUser',
  description: 'Fetch user data from the Old API Server by userId',
  inputSchema: {
    type: 'object' as const,
    properties: {
      userId: {
        type: 'string',
        description: 'The user ID to fetch',
      },
    },
    required: ['userId'],
  },
  metadata: {
    name: 'fetchUser',
    description: 'Fetch user data from the Old API Server by userId',
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
