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

All device control operations require only: uuid, elementIds (or action), and command/value.

Smarts (Scenes/Automations):
- A Smart is a user-created automation that bundles multiple device commands into one action (e.g., "Good Night" turns off lights + sets AC + locks doors).
- When user expresses an intent that could match a scene ("I'm going to sleep", "I'm leaving", "movie time", "I'm home"):
  1. Call list_smarts to find matching smarts by label. Match loosely — "I'm going to sleep" should match "Good Night", "Sleep Mode", "Bedtime", etc.
  2. If one clear match: activate_smart with its smid and locId.
  3. If multiple matches: prefer fav: true smarts, or ask the user which one.
  4. If no match: show available smarts so the user can pick.
- To preview what a smart will do before activating: call list_smart_cmds with smartId, then cross-reference targetId with known devices.
- You cannot create or edit smarts — direct the user to the ${brand} app for that.

Scheduling:
- Any action tool (control_device, control_device_simple, activate_smart, etc.) can be scheduled for later execution.
- Add delay (seconds) for relative timing: "5 phút nữa" → delay: 300
- Add executeAt (ISO 8601 with timezone) for absolute timing: "10h sáng mai" → executeAt: "2026-03-28T10:00:00+07:00"
- Cannot use both delay and executeAt on the same call.
- Scheduled tools return a jobId. Use list_scheduled_jobs to check status, cancel_scheduled_job to cancel.
- Maximum schedule horizon: 7 days. Jobs persist across server restarts.
- Read-only tools (list_*, get_*) cannot be scheduled — only action/mutation tools.`;
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
