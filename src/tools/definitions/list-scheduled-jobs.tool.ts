import { z } from 'zod';

const ListScheduledJobsParamsSchema = z.object({});

export type ListScheduledJobsParams = z.infer<typeof ListScheduledJobsParamsSchema>;

export const LIST_SCHEDULED_JOBS_TOOL = {
  name: 'list_scheduled_jobs',
  description:
    'List all scheduled (pending), recently completed, and failed tool executions for the current user. Use to check status of scheduled actions or answer "did my schedule run?"',
  inputSchema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  metadata: {
    name: 'list_scheduled_jobs',
    description:
      'List all scheduled (pending), recently completed, and failed tool executions for the current user. Use to check status of scheduled actions or answer "did my schedule run?"',
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
  schema: ListScheduledJobsParamsSchema,
};
