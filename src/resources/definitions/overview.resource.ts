/**
 * Overview Resource Definition
 * Provides high-level introduction to the IoT Cloud MCP Bridge
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * overview MCP Resource Definition
 *
 * Provides system overview, core concepts, field definitions, and glossary
 * Optimized for AI agents learning the system for the first time
 */
export const OVERVIEW_RESOURCE = {
  uri: 'rogo://docs/overview',
  name: 'IoT MCP Overview',
  description:
    'Introduction to the IoT Cloud MCP Bridge: system architecture, core concepts (device/element/attribute/state), field definitions (uuid/eid/rootUuid), and quick reference. Read this first.',
  mimeType: 'text/markdown',

  /**
   * Read overview documentation
   */
  async read(): Promise<string> {
    try {
      const mdPath = path.join(__dirname, '../../../docs/ai-resources/overview.md');
      const content = fs.readFileSync(mdPath, 'utf-8');
      return content;
    } catch (error) {
      return `# Error Loading Overview\n\n${error.message}`;
    }
  },
};
