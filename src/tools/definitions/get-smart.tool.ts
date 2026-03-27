import { z } from 'zod';

const GetSmartParamsSchema = z.object({
  uuid: z.string().describe('Smart UUID (24-character hex string)'),
});

export type GetSmartParams = z.infer<typeof GetSmartParamsSchema>;

export const GET_SMART_TOOL = {
  name: 'get_smart',
  description: 'Get a specific smart (scene/automation) by UUID.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Smart UUID (24-character hex string)',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: 'get_smart',
    description: 'Get a specific smart (scene/automation) by UUID.',
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
  schema: GetSmartParamsSchema,
};
