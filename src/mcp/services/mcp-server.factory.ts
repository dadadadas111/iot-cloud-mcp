import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ToolRegistryService } from '../../tools/services/tool-registry.service';
import { ResourceRegistryService } from '../../resources/services/resource-registry.service';

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
    private readonly configService: ConfigService,
  ) {}

  /**
   * Creates a new MCP Server instance for a project
   * @param projectApiKey - Project API key (used for server naming)
   * @returns Configured MCP Server instance
   */
  createServer(projectApiKey: string): McpServer {
    this.logger.log(`Creating MCP server for project: ${projectApiKey}`);

    // Create server with name and capabilities
    const server = new McpServer(
      {
        name: `mcp-gateway-${projectApiKey}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
        instructions: `IoT Device Control MCP Server

Key Concepts:
- Device: IoT hardware (light, switch, AC, lock, gate) identified by UUID
- Element: Physical control point (e.g., 4-button switch has 4 elements)
- Attribute: Controllable property (brightness, color, temperature, etc.)
- UUID format: MongoDB _id (24 hex characters, no dashes)

Getting Started:
1. Call get_device_documentation tool for detailed reference guides
2. Use get_device_state to discover device capabilities and current values
3. For common actions: control_device_simple (turn_on, set_brightness, etc.)
4. For precise control: control_device with specific attribute elementIds

All device control operations require only: uuid, elementIds (or action), and command/value.`,
      },
    );

    // Register all available tools on this server instance
    this.toolRegistry.registerTools(server, projectApiKey);

    // Register all available resources
    this.resourceRegistry.registerResources(server);


    this.logger.log(`MCP server created and tools registered for project: ${projectApiKey}`);

    return server;
  }

  /**
   * Gets or creates a cached server instance (future enhancement)
   * For PoC, always creates a new server
   * @param projectApiKey - Project API key
   * @returns Configured MCP Server instance
   */
  getOrCreateServer(projectApiKey: string): McpServer {
    // For PoC: always create new server per session
    // Future: implement caching/pooling if needed
    return this.createServer(projectApiKey);
  }
}
