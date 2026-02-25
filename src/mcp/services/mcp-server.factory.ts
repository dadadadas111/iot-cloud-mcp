import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ToolRegistryService } from '../../tools/services/tool-registry.service';

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
    private readonly configService: ConfigService,
  ) {}

  /**
   * Creates a new MCP Server instance for a project
   * @param projectApiKey - Project API key (used for server naming)
   * @returns Configured MCP Server instance
   */
  createServer(projectApiKey: string): Server {
    this.logger.log(`Creating MCP server for project: ${projectApiKey}`);

    // Create server with name and capabilities
    const server = new Server(
      {
        name: `mcp-gateway-${projectApiKey}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Register all available tools on this server instance
    this.toolRegistry.registerTools(server as any, projectApiKey);


    this.logger.log(`MCP server created and tools registered for project: ${projectApiKey}`);

    return server;
  }

  /**
   * Gets or creates a cached server instance (future enhancement)
   * For PoC, always creates a new server
   * @param projectApiKey - Project API key
   * @returns Configured MCP Server instance
   */
  getOrCreateServer(projectApiKey: string): Server {
    // For PoC: always create new server per session
    // Future: implement caching/pooling if needed
    return this.createServer(projectApiKey);
  }
}
