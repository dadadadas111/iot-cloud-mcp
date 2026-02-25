import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { McpSession } from '../dto/mcp-session.dto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * SessionManagerService
 * Manages MCP sessions per tenant with in-memory storage.
 * Uses a two-level Map structure: projectApiKey -> sessionId -> McpSession
 */
@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);

  /**
   * Two-level map: projectApiKey -> sessionId -> McpSession
   * Enables per-tenant session isolation
   */
  private readonly sessions: Map<string, Map<string, McpSession>> = new Map();

  /**
   * Creates a new MCP session for a project/user combination
   * @param projectApiKey - Project API key
   * @param userId - User ID from JWT token
   * @param server - MCP Server instance
   * @returns Newly created session ID (UUID)
   */
  createSession(projectApiKey: string, userId: string, server: Server): string {
    const sessionId = uuidv4();
    const now = new Date();

    const session: McpSession = {
      sessionId,
      projectApiKey,
      server,
      userId,
      createdAt: now,
      lastActivity: now,
    };

    // Get or create project-level map
    if (!this.sessions.has(projectApiKey)) {
      this.sessions.set(projectApiKey, new Map());
      this.logger.log(`Created session map for project: ${projectApiKey}`);
    }

    const projectSessions = this.sessions.get(projectApiKey)!;
    projectSessions.set(sessionId, session);

    this.logger.log(
      `Session created - Project: ${projectApiKey}, SessionId: ${sessionId}, UserId: ${userId}`,
    );

    return sessionId;
  }

  /**
   * Retrieves an existing MCP session
   * @param projectApiKey - Project API key
   * @param sessionId - Session ID
   * @returns McpSession or null if not found
   */
  getSession(projectApiKey: string, sessionId: string): McpSession | null {
    const projectSessions = this.sessions.get(projectApiKey);
    if (!projectSessions) {
      this.logger.debug(`No sessions found for project: ${projectApiKey}`);
      return null;
    }

    const session = projectSessions.get(sessionId);
    if (!session) {
      this.logger.debug(`Session not found - Project: ${projectApiKey}, SessionId: ${sessionId}`);
      return null;
    }

    // Update last activity
    session.lastActivity = new Date();
    return session;
  }

  /**
   * Deletes an MCP session
   * @param projectApiKey - Project API key
   * @param sessionId - Session ID
   * @returns true if deleted, false if not found
   */
  deleteSession(projectApiKey: string, sessionId: string): boolean {
    const projectSessions = this.sessions.get(projectApiKey);
    if (!projectSessions) {
      return false;
    }

    const deleted = projectSessions.delete(sessionId);

    // Clean up empty project map
    if (projectSessions.size === 0) {
      this.sessions.delete(projectApiKey);
      this.logger.log(`Removed empty session map for project: ${projectApiKey}`);
    }

    if (deleted) {
      this.logger.log(`Session deleted - Project: ${projectApiKey}, SessionId: ${sessionId}`);
    }

    return deleted;
  }

  /**
   * Cleans up stale sessions based on last activity time
   * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns Number of sessions cleaned up
   */
  cleanupStale(maxAgeMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [projectApiKey, projectSessions] of this.sessions.entries()) {
      const sessionsToDelete: string[] = [];

      for (const [sessionId, session] of projectSessions.entries()) {
        const age = now - session.lastActivity.getTime();
        if (age > maxAgeMs) {
          sessionsToDelete.push(sessionId);
        }
      }

      // Delete stale sessions
      for (const sessionId of sessionsToDelete) {
        projectSessions.delete(sessionId);
        cleanedCount++;
      }

      // Clean up empty project map
      if (projectSessions.size === 0) {
        this.sessions.delete(projectApiKey);
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} stale sessions`);
    }

    return cleanedCount;
  }

  /**
   * Gets session statistics
   * @returns Object with total sessions and per-project counts
   */
  getStats(): { totalSessions: number; projectCounts: Record<string, number> } {
    let totalSessions = 0;
    const projectCounts: Record<string, number> = {};

    for (const [projectApiKey, projectSessions] of this.sessions.entries()) {
      const count = projectSessions.size;
      projectCounts[projectApiKey] = count;
      totalSessions += count;
    }

    return { totalSessions, projectCounts };
  }
}
