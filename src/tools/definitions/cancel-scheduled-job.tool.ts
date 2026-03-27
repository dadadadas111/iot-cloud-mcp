import { z } from 'zod';

const CancelScheduledJobParamsSchema = z.object({
  jobId: z.string().describe('Job ID to cancel (from list_scheduled_jobs)'),
});

export type CancelScheduledJobParams = z.infer<typeof CancelScheduledJobParamsSchema>;

export const CANCEL_SCHEDULED_JOB_TOOL = {
  name: 'cancel_scheduled_job',
  description:
    'Cancel a pending scheduled tool execution by job ID. Only works on jobs that have not yet executed.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      jobId: {
        type: 'string',
        description: 'Job ID to cancel (from list_scheduled_jobs)',
      },
    },
    required: ['jobId'],
  },
  metadata: {
    name: 'cancel_scheduled_job',
    description:
      'Cancel a pending scheduled tool execution by job ID. Only works on jobs that have not yet executed.',
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
  schema: CancelScheduledJobParamsSchema,
};
