/**
 * Control Guide Resource Definition
 * Step-by-step guide for AI agents on how to control devices
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
    '[Manual Reference] Step-by-step guide for controlling devices: how to get device info, determine commands, and verify results. For AI-accessible docs, use get_device_documentation tool instead.',
  mimeType: 'text/markdown',

  async read(): Promise<string> {
    try {
      const guidePath = path.join(process.cwd(), 'docs', 'ai-resources', 'control-guide.md');
      return fs.readFileSync(guidePath, 'utf-8');
    } catch (error) {
      return `# Error Loading Control Guide\n\n${error.message}`;
    }
  },
};
