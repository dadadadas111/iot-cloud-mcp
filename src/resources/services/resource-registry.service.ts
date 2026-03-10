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
import { OVERVIEW_RESOURCE } from '../definitions/overview.resource';
import { DEVICE_DASHBOARD_WIDGET } from '../../widgets/definitions/device-dashboard.widget';
import { DEVICE_LIST_WIDGET } from '../../widgets/definitions/device-list.widget';
import { DEVICE_CONTROL_WIDGET } from '../../widgets/definitions/device-control.widget';
import { WidgetService } from '../../widgets/services/widget.service';

/**
 * Service responsible for registering MCP resources with the MCP server
 */
@Injectable()
export class ResourceRegistryService {
  private readonly logger = new Logger(ResourceRegistryService.name);

  constructor(private readonly widgetService: WidgetService) {}

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
        this.logger.log('🔍 [RESOURCE ACCESS] device-attributes resource read requested');
        const content = await DEVICE_ATTRIBUTES_RESOURCE.read();
        this.logger.log(
          `✅ [RESOURCE ACCESS] device-attributes resource read successful (${content.length} chars)`,
        );
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
        this.logger.log('🔍 [RESOURCE ACCESS] control-guide resource read requested');
        const content = await CONTROL_GUIDE_RESOURCE.read();
        this.logger.log(
          `✅ [RESOURCE ACCESS] control-guide resource read successful (${content.length} chars)`,
        );
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
        this.logger.log('🔍 [RESOURCE ACCESS] state-guide resource read requested');
        const content = await STATE_GUIDE_RESOURCE.read();
        this.logger.log(
          `✅ [RESOURCE ACCESS] state-guide resource read successful (${content.length} chars)`,
        );
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

    // Register overview (read this first)
    mcpServer.registerResource(
      OVERVIEW_RESOURCE.name,
      OVERVIEW_RESOURCE.uri,
      {
        description: OVERVIEW_RESOURCE.description,
        mimeType: OVERVIEW_RESOURCE.mimeType,
      },
      async () => {
        this.logger.log('🔍 [RESOURCE ACCESS] overview resource read requested');
        const content = await OVERVIEW_RESOURCE.read();
        this.logger.log(
          `✅ [RESOURCE ACCESS] overview resource read successful (${content.length} chars)`,
        );
        return {
          contents: [
            {
              uri: OVERVIEW_RESOURCE.uri,
              mimeType: OVERVIEW_RESOURCE.mimeType,
              text: content,
            },
          ],
        };
      },
    );

    // Register device dashboard widget (ChatGPT interactive UI)
    // Returns static HTML with embedded JS that reads data from window.openai.toolOutput
    // at runtime in the ChatGPT iframe — no server-side data injection needed.
    mcpServer.registerResource(
      DEVICE_DASHBOARD_WIDGET.name,
      DEVICE_DASHBOARD_WIDGET.uri,
      {
        description: DEVICE_DASHBOARD_WIDGET.description,
        mimeType: DEVICE_DASHBOARD_WIDGET.mimeType,
      },
      async () => {
        this.logger.log('🔍 [RESOURCE ACCESS] device-dashboard widget resource read requested');
        const html = await this.widgetService.readStaticHtml('device-dashboard');
        this.logger.log(
          `✅ [RESOURCE ACCESS] device-dashboard widget resource read successful (${html.length} chars)`,
        );
        return {
          contents: [
            {
              uri: DEVICE_DASHBOARD_WIDGET.uri,
              mimeType: DEVICE_DASHBOARD_WIDGET.mimeType,
              text: html,
              _meta: { ui: { prefersBorder: true } },
            },
          ],
        };
      },
    );

    // Register device list widget (ChatGPT interactive UI)
    mcpServer.registerResource(
      DEVICE_LIST_WIDGET.name,
      DEVICE_LIST_WIDGET.uri,
      {
        description: DEVICE_LIST_WIDGET.description,
        mimeType: DEVICE_LIST_WIDGET.mimeType,
      },
      async () => {
        this.logger.log('🔍 [RESOURCE ACCESS] device-list widget resource read requested');
        const html = await this.widgetService.readStaticHtml('device-list');
        this.logger.log(
          `✅ [RESOURCE ACCESS] device-list widget resource read successful (${html.length} chars)`,
        );
        return {
          contents: [
            {
              uri: DEVICE_LIST_WIDGET.uri,
              mimeType: DEVICE_LIST_WIDGET.mimeType,
              text: html,
              _meta: { ui: { prefersBorder: true } },
            },
          ],
        };
      },
    );

    // Register device control widget (ChatGPT interactive UI)
    mcpServer.registerResource(
      DEVICE_CONTROL_WIDGET.name,
      DEVICE_CONTROL_WIDGET.uri,
      {
        description: DEVICE_CONTROL_WIDGET.description,
        mimeType: DEVICE_CONTROL_WIDGET.mimeType,
      },
      async () => {
        this.logger.log('🔍 [RESOURCE ACCESS] device-control widget resource read requested');
        const html = await this.widgetService.readStaticHtml('device-control');
        this.logger.log(
          `✅ [RESOURCE ACCESS] device-control widget resource read successful (${html.length} chars)`,
        );
        return {
          contents: [
            {
              uri: DEVICE_CONTROL_WIDGET.uri,
              mimeType: DEVICE_CONTROL_WIDGET.mimeType,
              text: html,
              _meta: { ui: { prefersBorder: true } },
            },
          ],
        };
      },
    );

    this.logger.log('MCP resources registered successfully');
  }
}
