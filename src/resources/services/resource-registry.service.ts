/**
 * Resource Registry Service
 * Registers all available MCP resources with the MCP server
 * Provides documentation and reference materials for AI consumption
 */

import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEVICE_ATTRIBUTES_RESOURCE } from '../definitions/device-attributes.resource';
import { CONTROL_GUIDE_RESOURCE } from '../definitions/control-guide.resource';
import { STATE_GUIDE_RESOURCE } from '../definitions/state-guide.resource';

/**
 * Service responsible for registering MCP resources with the MCP server
 */
@Injectable()
export class ResourceRegistryService {
  private readonly logger = new Logger(ResourceRegistryService.name);

  /**
   * Register all available resources with the MCP server
   * Called during server initialization
   *
   * @param mcpServer - McpServer instance
   */
  registerResources(mcpServer: McpServer): void {
    this.logger.log('Registering MCP resources');

    // Register device attributes reference
    mcpServer.registerResource(
      DEVICE_ATTRIBUTES_RESOURCE.name,
      DEVICE_ATTRIBUTES_RESOURCE.uri,
      {
        description: DEVICE_ATTRIBUTES_RESOURCE.description,
        mimeType: DEVICE_ATTRIBUTES_RESOURCE.mimeType,
      },
      async () => {
        const content = await DEVICE_ATTRIBUTES_RESOURCE.read();
        return {
          contents: [
            {
              uri: DEVICE_ATTRIBUTES_RESOURCE.uri,
              mimeType: DEVICE_ATTRIBUTES_RESOURCE.mimeType,
              text: content,
            },
          ],
        };
      },
    );

    // Register control guide
    mcpServer.registerResource(
      CONTROL_GUIDE_RESOURCE.name,
      CONTROL_GUIDE_RESOURCE.uri,
      {
        description: CONTROL_GUIDE_RESOURCE.description,
        mimeType: CONTROL_GUIDE_RESOURCE.mimeType,
      },
      async () => {
        const content = await CONTROL_GUIDE_RESOURCE.read();
        return {
          contents: [
            {
              uri: CONTROL_GUIDE_RESOURCE.uri,
              mimeType: CONTROL_GUIDE_RESOURCE.mimeType,
              text: content,
            },
          ],
        };
      },
    );

    // Register state guide
    mcpServer.registerResource(
      STATE_GUIDE_RESOURCE.name,
      STATE_GUIDE_RESOURCE.uri,
      {
        description: STATE_GUIDE_RESOURCE.description,
        mimeType: STATE_GUIDE_RESOURCE.mimeType,
      },
      async () => {
        const content = await STATE_GUIDE_RESOURCE.read();
        return {
          contents: [
            {
              uri: STATE_GUIDE_RESOURCE.uri,
              mimeType: STATE_GUIDE_RESOURCE.mimeType,
              text: content,
            },
          ],
        };
      },
    );

    this.logger.log('MCP resources registered successfully');
  }
}
