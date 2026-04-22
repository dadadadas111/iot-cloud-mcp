import { z } from 'zod';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export const PaginationParamsSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .nullish()
    .describe(`Maximum number of items to return. Defaults to ${DEFAULT_PAGE_LIMIT}.`),
  offset: z
    .number()
    .int()
    .min(0)
    .nullish()
    .describe('Zero-based index of the first item to return. Defaults to 0.'),
});

export const PAGINATION_INPUT_SCHEMA_PROPERTIES = {
  limit: {
    type: ['number', 'null'],
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: `Maximum number of items to return. Defaults to ${DEFAULT_PAGE_LIMIT}.`,
  },
  offset: {
    type: ['number', 'null'],
    minimum: 0,
    description: 'Zero-based index of the first item to return. Defaults to 0.',
  },
} as const;
