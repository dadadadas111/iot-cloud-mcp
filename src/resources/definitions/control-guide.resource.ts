/**
 * Control Guide Resource Definition
 * Explains how to structure device control commands
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * control_guide MCP Resource Definition
 */
export const CONTROL_GUIDE_RESOURCE = {
  uri: 'rogo://docs/control-guide',
  name: 'Device Control Guide',
  description:
    'Comprehensive guide on how to control devices: command structure, elements, required fields, and best practices.',
  mimeType: 'text/markdown',

  async read(): Promise<string> {
    try {
      const guidePath = path.join(__dirname, '../../../docs/new-tools/how-to-control-devices.md');
      return fs.readFileSync(guidePath, 'utf-8');
    } catch (error) {
      return `# Error Loading Control Guide\n\n${error.message}`;
    }
  },
};
