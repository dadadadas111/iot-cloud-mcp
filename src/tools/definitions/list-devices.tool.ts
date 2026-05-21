/**
 * list_devices Tool Definition
 * Get all devices, optionally filtered by location
 */

import { z } from 'zod';
import {
  PAGINATION_INPUT_SCHEMA_PROPERTIES,
  PaginationParamsSchema,
} from './pagination-params.tool';

/**
 * list_devices tool parameters
 */
const ListDevicesParamsSchema = PaginationParamsSchema.extend({
  locationId: z.string().nullish().describe('Optional location ID to filter devices by location'),
});

/** Type for list_devices parameters */
export type ListDevicesParams = z.infer<typeof ListDevicesParamsSchema>;

/**
 * list_devices MCP Tool Definition
 *
 * @see https://spec.modelcontextprotocol.io/latest/basic/tools/
 */
export const LIST_DEVICES_TOOL = {
  name: 'list_devices',
  description:
    'Get devices with compact pagination. Optionally filter by location using locationId. Defaults to limit=20, offset=0 to keep responses small for edge models.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationId: {
        type: ['string', 'null'],
        description: 'Optional location ID to filter devices by location',
      },
      ...PAGINATION_INPUT_SCHEMA_PROPERTIES,
    },
    required: [],
  },
  metadata: {
    name: 'list_devices',
    description:
      'Get devices with compact pagination. Optionally filter by location using locationId. Defaults to limit=20, offset=0 to keep responses small for edge models.',
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
  schema: ListDevicesParamsSchema,
  _meta: {
    ui: {
      resourceUri: 'ui://widget/device-app.html',
      visibility: ['model', 'app'],
    },
    'ui/resourceUri': 'ui://widget/device-app.html',
    'openai/outputTemplate': 'ui://widget/device-app.html',
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    'openai/toolInvocation/invoking': 'Loading devices...',
    'openai/toolInvocation/invoked': 'Devices loaded',
    'openai/widgetDescription':
      'Interactive device list is displayed as a widget. Do not describe it in text.',
  },
};
