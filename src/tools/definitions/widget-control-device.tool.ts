/**
 * _widget_control_device Tool Definition
 * Internal widget-only tool for dashboard→control view transition in the device-app SPA.
 *
 * Same data as get_device (enriched device + state) but:
 * - visibility: ['app'] — only callable from widgets via callTool, invisible to model
 * - Returns structuredContent with _view: 'control' so the widget renders the control panel
 * - No outputTemplate / resourceUri — returns data silently without rendering a new widget
 *
 * The device-app widget uses this for dashboard→control transitions
 * so the current widget re-renders in place instead of spawning a new one.
 */

import { z } from 'zod';

const WidgetControlDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
});

export type WidgetControlDeviceParams = z.infer<typeof WidgetControlDeviceParamsSchema>;

export const WIDGET_CONTROL_DEVICE_TOOL = {
  name: '_widget_control_device',
  description:
    'INTERNAL WIDGET USE ONLY — do NOT call this tool. Use get_device instead. This tool exists exclusively for the device-app ChatGPT widget to navigate from dashboard to control view in-place via callTool() without spawning a new widget message. It is invisible to the AI model (visibility: app-only).',
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
    name: '_widget_control_device',
    description:
      'INTERNAL WIDGET USE ONLY — do NOT call this tool. Use get_device instead. This tool exists exclusively for the device-app ChatGPT widget to navigate from dashboard to control view in-place.',
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
  schema: WidgetControlDeviceParamsSchema,
  _meta: {
    ui: {
      visibility: ['app'],
    },
    'openai/visibility': 'private',
  },
};
