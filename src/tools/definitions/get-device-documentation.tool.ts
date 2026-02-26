/**
 * get_device_documentation Tool Definition
 * Provides AI agents with device control documentation
 */

import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

/**
 * get_device_documentation tool parameters
 */
const GetDeviceDocumentationParamsSchema = z.object({
  topic: z
    .enum(['overview', 'device_attributes', 'control_guide', 'state_guide'])
    .describe(
      'Which documentation to retrieve: overview (concepts), device_attributes (command reference), control_guide (workflows), state_guide (reading state)',
    ),
});

/** Type for get_device_documentation parameters */
export type GetDeviceDocumentationParams = z.infer<typeof GetDeviceDocumentationParamsSchema>;

/**
 * Read documentation file
 */
function readDocumentation(topic: string): string {
  const fileMap: Record<string, string> = {
    overview: 'overview.md',
    device_attributes: 'device-attributes.md',
    control_guide: 'control-guide.md',
    state_guide: 'state-guide.md',
  };

  try {
    const fileName = fileMap[topic];
    const filePath = path.join(__dirname, '../../../docs/ai-resources', fileName);
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    return `Error loading documentation: ${error.message}`;
  }
}

/**
 * get_device_documentation MCP Tool Definition
 *
 * Returns comprehensive documentation for device control.
 * AI agents should call this when they need detailed information about:
 * - Device concepts and field definitions (overview)
 * - Available commands and device types (device_attributes)
 * - Control workflows and examples (control_guide)
 * - Reading and interpreting state (state_guide)
 */
export const GET_DEVICE_DOCUMENTATION_TOOL = {
  name: 'get_device_documentation',
  description:
    'Get comprehensive documentation about IoT device control. Call this when you need details about device concepts, available commands, control workflows, or state structure. Returns full markdown documentation.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      topic: {
        type: 'string',
        enum: ['overview', 'device_attributes', 'control_guide', 'state_guide'],
        description:
          'Which documentation: overview (concepts & fields), device_attributes (commands & types), control_guide (workflows), state_guide (reading state)',
      },
    },
    required: ['topic'],
  },
  metadata: {
    name: 'get_device_documentation',
    description:
      'Get comprehensive documentation about IoT device control. Call this when you need details about device concepts, available commands, control workflows, or state structure. Returns full markdown documentation.',
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
  schema: GetDeviceDocumentationParamsSchema,
  execute: readDocumentation,
};
