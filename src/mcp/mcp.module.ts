import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { SessionManagerService } from './services/session-manager.service';
import { McpServerFactory } from './services/mcp-server.factory';
import { ToolsModule } from '../tools/tools.module';
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
 */
@Module({
  imports: [
    ToolsModule, // For tool registration
    AuthModule, // For JWT validation
    CommonModule, // For shared utilities and decorators
  ],
  controllers: [McpController],
  providers: [SessionManagerService, McpServerFactory],
  exports: [SessionManagerService, McpServerFactory],
})
export class McpModule {}
