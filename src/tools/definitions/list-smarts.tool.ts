import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

const ListSmartsParamsSchema = PaginationParamsSchema.extend({});

export type ListSmartsParams = z.infer<typeof ListSmartsParamsSchema>;

export const LIST_SMARTS_TOOL = {
  name: 'list_smarts',
  description:
    'List smarts (scenes/automations) with compact pagination. Call this when user expresses an intent that might match a scene — "going to sleep", "leaving home", "movie time", etc. Match user intent loosely to smart labels. Defaults to limit=20, offset=0.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: [],
  },
  metadata: {
    name: 'list_smarts',
    description:
      'List smarts (scenes/automations) with compact pagination. Call this when user expresses an intent that might match a scene — "going to sleep", "leaving home", "movie time", etc. Match user intent loosely to smart labels. Defaults to limit=20, offset=0.',
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
