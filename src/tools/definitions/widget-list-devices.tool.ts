/**
 * _widget_list_devices Tool Definition
 * Internal widget-only tool for in-place device list refresh in the device-app SPA.
 *
 * THIS TOOL IS EXCLUSIVELY FOR USE BY THE DEVICE-APP WIDGET VIA callTool().
 * - visibility: ['app'] — only callable from within widgets, never shown to or invoked by the AI model
 * - No outputTemplate / resourceUri — returns data silently to the widget without spawning a new widget message
 *
 * Normal MCP clients (Claude, n8n, API consumers) MUST use `list_devices` instead.
 * The underscore-prefixed name and 'INTERNAL WIDGET USE ONLY' description signal that
 * this tool should never be called by AI models or non-widget clients.
 */

import { z } from 'zod';

const WidgetListDevicesParamsSchema = z.object({
  locationId: z.string().nullish().describe('Optional location ID to filter devices by location'),
});

/** Type for _widget_list_devices parameters */
export type WidgetListDevicesParams = z.infer<typeof WidgetListDevicesParamsSchema>;

/**
 * _widget_list_devices MCP Tool Definition
 *
 * App-only sibling of list_devices designed for the device-app ChatGPT widget.
 * Identical data shape to list_devices but returns structuredContent so the widget
 * can re-render its list view in-place without spawning a new ChatGPT widget message.
 */
export const WIDGET_LIST_DEVICES_TOOL = {
  name: '_widget_list_devices',
  description:
    'INTERNAL WIDGET USE ONLY — do NOT call this tool. Use list_devices instead. ' +
    'This tool exists exclusively for the device-app ChatGPT widget to refresh its device list ' +
    'in-place via callTool() without spawning a new widget message. ' +
    'It is invisible to the AI model (visibility: app-only) and returns structuredContent for widget rendering.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      locationId: {
        type: ['string', 'null'],
        description: 'Optional location ID to filter devices by location',
      },
    },
    required: [],
  },
  metadata: {
    name: '_widget_list_devices',
    description:
      'INTERNAL WIDGET USE ONLY — do NOT call this tool. Use list_devices instead. ' +
      'This tool exists exclusively for the device-app ChatGPT widget to refresh its device list in-place.',
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
  schema: WidgetListDevicesParamsSchema,
  _meta: {
    ui: {
      visibility: ['app'],
    },
    'openai/visibility': 'private',
  },
};
