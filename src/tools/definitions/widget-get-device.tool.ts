/**
 * _widget_get_device Tool Definition
 * Internal widget-only tool for in-place navigation in the device-app SPA.
 *
 * Same data as get_device (enriched device + state) but:
 * - visibility: ['app'] — only callable from widgets via callTool, invisible to model
 * - No outputTemplate / resourceUri — returns data silently without rendering a new widget
 *
 * The device-app widget uses this for list→dashboard and dashboard→control transitions
 * so the current widget re-renders in place instead of spawning a new one.
 */

import { z } from 'zod';

const WidgetGetDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
});

export type WidgetGetDeviceParams = z.infer<typeof WidgetGetDeviceParamsSchema>;

export const WIDGET_GET_DEVICE_TOOL = {
  name: '_widget_get_device',
  description: 'Internal: fetch device details + state for widget navigation. Not for direct use.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: '_widget_get_device',
    description:
      'Internal: fetch device details + state for widget navigation. Not for direct use.',
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
  schema: WidgetGetDeviceParamsSchema,
  _meta: {
    ui: {
      visibility: ['app'],
    },
    'openai/visibility': 'private',
  },
};
