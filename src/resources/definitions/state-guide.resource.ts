/**
 * State Guide Resource Definition
 * Explains how to read and interpret device state
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
    'How to read and interpret device state structure: state[deviceId][elementId][attributeId] format and attribute values.',
  mimeType: 'text/markdown',

  async read(): Promise<string> {
    try {
      const guidePath = path.join(__dirname, '../../../docs/new-tools/how-to-read-state.md');
      return fs.readFileSync(guidePath, 'utf-8');
    } catch (error) {
      return `# Error Loading State Guide\n\n${error.message}`;
    }
  },
};
