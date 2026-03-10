/**
 * interact_device Tool Definition
 * Fetch device details + state and render the interactive control panel widget.
 * Users can toggle, slide, and tap controls to send commands in real time.
 */

import { z } from 'zod';

/**
 * interact_device tool parameters
 */
const InteractDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID to control interactively'),
});

/** Type for interact_device parameters */
export type InteractDeviceParams = z.infer<typeof InteractDeviceParamsSchema>;

/**
 * interact_device MCP Tool Definition
 *
 * Works like get_device but renders the control widget instead of the dashboard.
 * The widget uses callTool('control_device_simple', ...) to send commands.
 */
export const INTERACT_DEVICE_TOOL = {
  name: 'interact_device',
  description:
    'Open interactive control panel for a device. Shows toggles, sliders, and buttons for real-time device control. Use this when the user wants to control or adjust a device (brightness, temperature, on/off, mode, etc.).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      uuid: {
        type: 'string',
        description: 'Device UUID to control interactively',
      },
    },
    required: ['uuid'],
  },
  metadata: {
    name: 'interact_device',
    description:
      'Open interactive control panel for a device. Shows toggles, sliders, and buttons for real-time device control. Use this when the user wants to control or adjust a device (brightness, temperature, on/off, mode, etc.).',
    readOnlyHint: false,
    destructiveHint: true,
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
  schema: InteractDeviceParamsSchema,
  _meta: {
    ui: {
      resourceUri: 'ui://widget/device-control.html',
      visibility: ['model', 'app'],
    },
    'openai/outputTemplate': 'ui://widget/device-control.html',
    'openai/widgetAccessible': true,
    'openai/toolInvocation/invoking': 'Opening control panel...',
    'openai/toolInvocation/invoked': 'Control panel ready',
  },
};
