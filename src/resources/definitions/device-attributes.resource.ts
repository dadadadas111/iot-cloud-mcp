/**
 * Device Attributes Resource Definition
 * Provides simplified, AI-friendly reference for device attributes and commands
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * device_attributes MCP Resource Definition
 *
 * Provides complete device attributes reference optimized for AI agent consumption
 */
export const DEVICE_ATTRIBUTES_RESOURCE = {
  uri: 'rogo://docs/device-attributes',
  name: 'Device Attributes Reference',
  description:
    '[Manual Reference] Complete reference of device types, attributes, commands, and value ranges. For AI-accessible docs, use get_device_documentation tool instead.',
  mimeType: 'text/markdown',

  /**
   * Read simplified device attributes documentation
   */
  async read(): Promise<string> {
    try {
      const mdPath = path.join(process.cwd(), 'docs', 'ai-resources', 'device-attributes.md');
      const content = fs.readFileSync(mdPath, 'utf-8');
      return content;
    } catch (error) {
      return `# Error Loading Device Attributes\n\n${error.message}`;
    }
  },
};
