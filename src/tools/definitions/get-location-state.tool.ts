/**
 * get_location_state Tool Definition
 * Get the current state of all devices in a location
 */

import { z } from 'zod';

/**
 * get_location_state tool parameters
 */
const GetLocationStateParamsSchema = z.object({
  locationUuid: z.string().describe('Location UUID'),
});

/** Type for get_location_state parameters */
export type GetLocationStateParams = z.infer<typeof GetLocationStateParamsSchema>;

/**
 * get_location_state MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const GET_LOCATION_STATE_TOOL = {
  name: 'get_location_state',
  description:
    'Get the current state of all devices in a location. Returns state for all devices within the specified location.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationUuid: {
        type: 'string',
        description: 'Location UUID',
      },
    },
    required: ['locationUuid'],
  },
  metadata: {
    name: 'get_location_state',
    description:
      'Get the current state of all devices in a location. Returns state for all devices within the specified location.',
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
  schema: GetLocationStateParamsSchema,
};
