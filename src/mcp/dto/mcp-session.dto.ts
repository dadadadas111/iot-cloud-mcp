import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * MCP Session DTO
 * Represents an active MCP session for a project/user combination.
 */
export interface McpSession {
  /**
   * Unique session identifier (UUID)
   */
  sessionId: string;

  /**
   * Project API key this session belongs to
   */
  projectApiKey: string;

  /**
   * MCP Server instance for this session
   */
  server: McpServer;

  /**
   * User ID extracted from JWT token
   */
  userId: string;

  /**
   * Session creation timestamp
   */
  createdAt: Date;

  /**
   * Last activity timestamp (for cleanup)
   */
  lastActivity: Date;
}
