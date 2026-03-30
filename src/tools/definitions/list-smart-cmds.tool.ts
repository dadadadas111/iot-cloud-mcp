import { z } from 'zod';

const ListSmartCmdsParamsSchema = z.object({
  smartId: z
    .string()
    .nullish()
    .describe('Optional smart UUID to filter commands for a specific smart'),
});

export type ListSmartCmdsParams = z.infer<typeof ListSmartCmdsParamsSchema>;

export const LIST_SMART_CMDS_TOOL = {
  name: 'list_smart_cmds',
  description:
    "List smart commands (what a smart will do). Without smartId returns all commands across all smarts. With smartId returns only that smart's commands. Use to preview actions before activating. target: 1=Device, 2=Group, 3=Location.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      smartId: {
        type: ['string', 'null'],
        description: 'Optional smart UUID to filter commands for a specific smart',
      },
    },
    required: [],
  },
  metadata: {
    name: 'list_smart_cmds',
    description:
      "List smart commands (what a smart will do). Without smartId returns all commands across all smarts. With smartId returns only that smart's commands. Use to preview actions before activating. target: 1=Device, 2=Group, 3=Location.",
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
