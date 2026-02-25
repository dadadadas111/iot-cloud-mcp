/**
 * Tools Module
 * Provides MCP tool definitions and execution services
 * Handles tool registration and dynamic execution via MCP server
 */

import { Module } from '@nestjs/common';
import { ProxyModule } from '../proxy/proxy.module';
import { CommonModule } from '../common/common.module';
import { ToolRegistryService } from './services/tool-registry.service';
import { ToolExecutorService } from './services/tool-executor.service';

/**
 * ToolsModule provides:
 * - ToolRegistryService: Registers tools with MCP server
 * - ToolExecutorService: Executes tool calls with authentication
 *
 * Tools are stateless and request-scoped via MCP context
 */
@Module({
  imports: [ProxyModule, CommonModule],
  providers: [ToolRegistryService, ToolExecutorService],
  exports: [ToolRegistryService, ToolExecutorService],
})
export class ToolsModule {}
