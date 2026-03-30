import { z } from 'zod';

const ActivateSmartParamsSchema = z.object({
  smid: z.number().describe('Smart ID number (from list_smarts)'),
  locId: z.string().describe('Location ID string (from list_smarts)'),
});

export type ActivateSmartParams = z.infer<typeof ActivateSmartParamsSchema>;

export const ACTIVATE_SMART_TOOL = {
  name: 'activate_smart',
  description:
    'Activate a user-created smart (scene/automation) by smid and locId. This runs the preconfigured actions in that smart. Use list_smarts first to find the correct smart.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      smid: {
        type: 'number',
        description: 'Smart ID number (from list_smarts)',
      },
      locId: {
        type: 'string',
        description: 'Location ID string (from list_smarts)',
      },
    },
    required: ['smid', 'locId'],
  },
  metadata: {
    name: 'activate_smart',
    description:
      'Activate a user-created smart (scene/automation) by smid and locId. This runs the preconfigured actions in that smart. Use list_smarts first to find the correct smart.',
    readOnlyHint: false,
    securitySchemes: {
      oauth2: {
        type: 'oauth2',
        flows: {
          implicit: {
            scopes: {
              'mcp.tools.write': 'Write access to MCP tools',
            },
          },
        },
      },
    },
  },
  schema: ActivateSmartParamsSchema,
};
