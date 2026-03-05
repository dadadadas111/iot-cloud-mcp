/**
 * fetch Tool Definition
 * Retrieve complete details by ID in format "type:uuid"
 * Supports device, location, and group resources
 */

import { z } from 'zod';

/**
 * fetch tool parameters
 */
const FetchParamsSchema = z.object({
  id: z
    .string()
    .describe(
      'Resource ID in format "type:uuid" (e.g., "device:abc-123", "location:xyz-456", "group:def-789")',
    ),
});

/** Type for fetch parameters */
export type FetchParams = z.infer<typeof FetchParamsSchema>;

/**
 * fetch MCP Tool Definition
 * Retrieves complete resource details by ID
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const FETCH_TOOL = {
  name: 'fetch',
  description:
    'Retrieve complete details by ID. Format: "type:uuid" where type is device, location, or group.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      id: {
        type: 'string',
        description:
          'Resource ID in format "type:uuid" (e.g., "device:abc-123", "location:xyz-456", "group:def-789")',
      },
    },
    required: ['id'],
  },
  metadata: {
    name: 'fetch',
    description:
      'Retrieve complete details by ID. Format: "type:uuid" where type is device, location, or group.',
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
  schema: FetchParamsSchema,
};
