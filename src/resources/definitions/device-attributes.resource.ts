/**
 * Device Attributes Resource Definition
 * Provides reference documentation for device attributes, commands, and values
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * device_attributes MCP Resource Definition
 *
 * Converts device-attr-and-control.csv to markdown format for AI consumption
 */
export const DEVICE_ATTRIBUTES_RESOURCE = {
  uri: 'rogo://docs/device-attributes',
  name: 'Device Attributes Reference',
  description:
    'Complete reference of device types, their attributes, valid commands, and value ranges. Use this to understand what commands to send when controlling devices.',
  mimeType: 'text/markdown',

  /**
   * Read and format device attributes documentation
   */
  async read(): Promise<string> {
    try {
      const csvPath = path.join(__dirname, '../../../docs/new-tools/device-attr-and-control.csv');
      const csvContent = fs.readFileSync(csvPath, 'utf-8');

      // Convert CSV to readable markdown
      const lines = csvContent.trim().split('\n').slice(3); // Skip header rows

      let markdown = '# Device Attributes Reference\n\n';
      markdown +=
        'This reference shows what attributes and commands are available for each device type.\n\n';
      markdown += '**Command Format**: `[attributeId, value, ...]`\n\n';
      markdown += '---\n\n';

      let currentDevice = '';

      for (const line of lines) {
        const parts = line.split(',');

        const deviceType = parts[0]?.trim();
        const attribute = parts[1]?.trim();
        const valueDesc = parts[2]?.trim().replace(/"/g, '');
        const example = parts[3]?.trim().replace(/"/g, '');

        // New device type
        if (deviceType && deviceType !== currentDevice) {
          currentDevice = deviceType;
          markdown += `## ${deviceType}\n\n`;
        }

        // Attribute info
        if (attribute) {
          markdown += `### ${attribute}\n\n`;
          markdown += `**Values**: ${valueDesc}\n\n`;
          markdown += `**Example**: \`${example}\`\n\n`;
        }
      }

      markdown += '\n---\n\n';
      markdown += '## Common Patterns\n\n';
      markdown += '- **Turn device ON**: `[1, 1]`\n';
      markdown += '- **Turn device OFF**: `[1, 0]`\n';
      markdown += '- **Set brightness**: `[28, <value 0-1000>]`\n';
      markdown += '- **Set color temperature**: `[29, <value 0-65000>]`\n';
      markdown += '- **Set AC temperature**: `[20, <value 15-30>]`\n';
      markdown += '- **Set AC mode**: `[17, <0=AUTO|1=COOLING|2=DRY|3=HEATING|4=FAN>]`\n';

      return markdown;
    } catch (error) {
      return `# Error Loading Device Attributes\n\n${error.message}`;
    }
  },
};
