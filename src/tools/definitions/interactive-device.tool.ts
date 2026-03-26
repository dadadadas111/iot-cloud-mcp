import { z } from 'zod';

const InteractiveDeviceParamsSchema = z.object({
  uuid: z.string().describe('Device UUID'),
});

export type InteractiveDeviceParams = z.infer<typeof InteractiveDeviceParamsSchema>;

export const INTERACTIVE_DEVICE_TOOL = {
  name: 'interactive_device',
  description:
    'Open an interactive control panel widget for a device. ' +
    'Use this when the user wants to control or manage a device without specifying exact actions ' +
    '(e.g. "control the light", "adjust the AC", "manage bedroom lamp"). ' +
    'Shows a visual UI with power toggle, brightness slider, temperature controls, mode selector, etc. ' +
    'Do NOT use if the user specifies an exact command — use control_device_simple instead ' +
    '(e.g. "turn off the light" or "set brightness to 80").',
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
    name: 'interactive_device',
    description:
      'Open an interactive control panel widget for a device. ' +
      'Use when user wants to control a device without specifying exact actions. ' +
      'Shows visual UI with power, brightness, temperature, and mode controls.',
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
  schema: InteractiveDeviceParamsSchema,
  _meta: {
    ui: {
      resourceUri: 'ui://widget/device-app.html',
      visibility: ['model', 'app'],
    },
    'ui/resourceUri': 'ui://widget/device-app.html',
    'openai/outputTemplate': 'ui://widget/device-app.html',
    'openai/widgetAccessible': true,
    'openai/resultCanProduceWidget': true,
    'openai/toolInvocation/invoking': 'Opening device controls...',
    'openai/toolInvocation/invoked': 'Device controls ready',
    'openai/widgetDescription':
      'Interactive device control panel is displayed as a widget. Do not describe it in text.',
  },
};
