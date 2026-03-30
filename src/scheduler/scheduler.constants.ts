import { z } from 'zod';

export const SCHEDULER_QUEUE = 'tool-scheduler';

export const SCHEDULER_DEFAULTS = {
  maxDelaySeconds: 7 * 24 * 3600, // 7 days
  jobRetentionSeconds: 24 * 3600, // 24 hours
} as const;

export const SCHEDULE_PARAMS_SCHEMA = z.object({
  delay: z
    .number()
    .positive()
    .optional()
    .describe('Delay in seconds before executing this tool. Cannot be used with executeAt.'),
  executeAt: z
    .string()
    .optional()
    .describe(
      'ISO 8601 timestamp with timezone (e.g. 2026-03-28T10:00:00+07:00) for when to execute. Cannot be used with delay.',
    ),
});
