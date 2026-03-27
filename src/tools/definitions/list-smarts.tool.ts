import { z } from 'zod';

const ListSmartsParamsSchema = z.object({});

export type ListSmartsParams = z.infer<typeof ListSmartsParamsSchema>;

export const LIST_SMARTS_TOOL = {
  name: 'list_smarts',
  description:
    'List all smarts (scenes/automations) for the user. Call this when user expresses an intent that might match a scene — "going to sleep", "leaving home", "movie time", etc. Match user intent loosely to smart labels. Returns label, smid, locId needed for activation. Prefer fav: true when ambiguous.',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    name: 'list_smarts',
    description:
      'List all smarts (scenes/automations) for the user. Call this when user expresses an intent that might match a scene — "going to sleep", "leaving home", "movie time", etc. Match user intent loosely to smart labels. Returns label, smid, locId needed for activation. Prefer fav: true when ambiguous.',
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
