import { z } from 'zod';

const ListSmartsParamsSchema = z.object({});

export type ListSmartsParams = z.infer<typeof ListSmartsParamsSchema>;

export const LIST_SMARTS_TOOL = {
  name: 'list_smarts',
  description:
    'List all smarts (scenes/automations) for the authenticated user. Returns label, smid, locId needed for activation. Use fav to prioritize commonly-used smarts.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    name: 'list_smarts',
    description:
      'List all smarts (scenes/automations) for the authenticated user. Returns label, smid, locId needed for activation. Use fav to prioritize commonly-used smarts.',
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
  schema: ListSmartsParamsSchema,
};
