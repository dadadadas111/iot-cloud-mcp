import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

const ListSmartCmdsParamsSchema = PaginationParamsSchema.extend({
  smartId: z
    .string()
    .nullish()
    .describe('Optional smart UUID to filter commands for a specific smart'),
});

export type ListSmartCmdsParams = z.infer<typeof ListSmartCmdsParamsSchema>;

export const LIST_SMART_CMDS_TOOL = {
  name: 'list_smart_cmds',
  description:
    "List smart commands (what a smart will do) with compact pagination. Without smartId returns commands across all smarts. With smartId returns only that smart's commands. Defaults to limit=20, offset=0. target: 1=Device, 2=Group, 3=Location.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      smartId: {
        type: ['string', 'null'],
        description: 'Optional smart UUID to filter commands for a specific smart',
      },
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: [],
  },
  metadata: {
    name: 'list_smart_cmds',
    description:
      "List smart commands (what a smart will do) with compact pagination. Without smartId returns commands across all smarts. With smartId returns only that smart's commands. Defaults to limit=20, offset=0. target: 1=Device, 2=Group, 3=Location.",
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
  schema: ListSmartCmdsParamsSchema,
};
