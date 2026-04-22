import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

const ListScheduledJobsParamsSchema = PaginationParamsSchema.extend({});

export type ListScheduledJobsParams = z.infer<typeof ListScheduledJobsParamsSchema>;

export const LIST_SCHEDULED_JOBS_TOOL = {
  name: 'list_scheduled_jobs',
  description:
    'List scheduled (pending), recently completed, and failed tool executions with compact pagination. Defaults to limit=20, offset=0.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: [],
  },
  metadata: {
    name: 'list_scheduled_jobs',
    description:
      'List scheduled (pending), recently completed, and failed tool executions with compact pagination. Defaults to limit=20, offset=0.',
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
