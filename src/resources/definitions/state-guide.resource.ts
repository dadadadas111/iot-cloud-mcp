/**
 * State Guide Resource Definition
 * Teaches AI agents how to read and interpret device state
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * state_guide MCP Resource Definition
 */
export const STATE_GUIDE_RESOURCE = {
  uri: 'rogo://docs/state-guide',
  name: 'Device State Guide',
  description:
    '[Manual Reference] Complete guide for reading device state: structure explanation, real examples, and how to use state for verification and capability discovery. For AI-accessible docs, use get_device_documentation tool instead.',
  mimeType: 'text/markdown',

  async read(): Promise<string> {
    try {
      const guidePath = path.join(__dirname, '../../../docs/ai-resources/state-guide.md');
      return fs.readFileSync(guidePath, 'utf-8');
    } catch (error) {
      return `# Error Loading State Guide\n\n${error.message}`;
    }
  },
};
