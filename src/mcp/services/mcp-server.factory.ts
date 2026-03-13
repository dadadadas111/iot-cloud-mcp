import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistryService } from '../../tools/services/tool-registry.service';
import { ResourceRegistryService } from '../../resources/services/resource-registry.service';
import { AliasMeta } from '../../alias/partner-meta.service';

function buildInstructions(meta?: AliasMeta): string {
  const brand = meta?.brandName ?? 'IoT Cloud';
  const domain = meta?.domain ?? 'IoT';

  return `${brand} MCP Server - ${domain} device control

Key Concepts:
- Device: ${domain} hardware (light, switch, AC, lock, gate) identified by UUID
- Element: Physical control point (e.g., 4-button switch has 4 elements)
- Attribute: Controllable property (brightness, color, temperature, etc.)
- UUID format: MongoDB _id (24 hex characters, no dashes)

Getting Started:
1. Read device-attributes MCP resource for detailed attribute/command reference
2. Use get_device_state to discover device capabilities and current values
3. For common actions: control_device_simple (turn_on, set_brightness, etc.)
4. For precise control: control_device with specific attribute elementIds

All device control operations require only: uuid, elementIds (or action), and command/value.`;
}

/**
 * McpServerFactory
 * Creates and configures MCP Server instances per tenant.
 * Each project gets its own isolated server with registered tools.
 */
@Injectable()
export class McpServerFactory {
  private readonly logger = new Logger(McpServerFactory.name);

  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly resourceRegistry: ResourceRegistryService,
  ) {}

  /**
   * Creates a new MCP Server instance for a project
   * @param projectApiKey - Project API key (used for server naming)
   * @returns Configured MCP Server instance
   */
  createServer(projectApiKey: string, meta?: AliasMeta): McpServer {
    this.logger.log(`Creating MCP server for project: ${projectApiKey}`);

    const serverName =
      meta?.mcpServerName ??
      (meta?.brandName ? meta.brandName.toLowerCase().replace(/\s+/g, '-') : undefined) ??
      `mcp-gateway-${projectApiKey}`;

    // Create server with name and capabilities
    const server = new McpServer(
      {
        name: serverName,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
        instructions: buildInstructions(meta),
      },
    );

    // Register all available tools on this server instance
    this.toolRegistry.registerTools(server, projectApiKey);

    // Register all available resources
    this.resourceRegistry.registerResources(server, meta);

    this.logger.log(`MCP server created and tools registered for project: ${projectApiKey}`);

    return server;
  }

  /**
   * Gets or creates a cached server instance (future enhancement)
   * For PoC, always creates a new server
   * @param projectApiKey - Project API key
   * @returns Configured MCP Server instance
   */
  getOrCreateServer(projectApiKey: string, meta?: AliasMeta): McpServer {
    // For PoC: always create new server per session
    // Future: implement caching/pooling if needed
    return this.createServer(projectApiKey, meta);
  }
}
