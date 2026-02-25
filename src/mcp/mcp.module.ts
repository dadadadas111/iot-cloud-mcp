import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { SessionManagerService } from './services/session-manager.service';
import { McpServerFactory } from './services/mcp-server.factory';
import { McpProtocolHandlerService } from './services/mcp-protocol-handler.service';
import { ToolsModule } from '../tools/tools.module';
import { ResourcesModule } from '../resources/resources.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';

/**
 * McpModule
 * Implements Model Context Protocol with per-tenant MCP servers.
 * Provides streamable HTTP transport for MCP JSON-RPC 2.0 protocol.
 *
 * Features:
 * - Per-tenant MCP server instances for isolation
 * - In-memory session management (PoC)
 * - JWT-based authentication
 * - Tool registry integration
 * - Resource registry for documentation
 */
@Module({
  imports: [
    ToolsModule, // For tool registration
    ResourcesModule, // For resource registration
    AuthModule, // For JWT validation
    CommonModule, // For shared utilities and decorators
  ],
  controllers: [McpController],
  providers: [SessionManagerService, McpServerFactory, McpProtocolHandlerService],
  exports: [SessionManagerService, McpServerFactory, McpProtocolHandlerService],
})
export class McpModule {}
