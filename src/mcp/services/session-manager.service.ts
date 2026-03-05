import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';
import { McpSession, RedisSessionData } from '../dto/mcp-session.dto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RedisSessionRepository } from './redis-session.repository';
import { McpServerFactory } from './mcp-server.factory';

/**
 * SessionManagerService
 * Manages MCP sessions per tenant with Redis-backed metadata storage
 * and a local in-memory cache for non-serializable McpServer instances.
 */
@Injectable()
export class SessionManagerService {
  private readonly logger = new Logger(SessionManagerService.name);

  /** Local cache for non-serializable McpServer instances */
  private readonly serverCache: Map<string, McpServer> = new Map();

  /** Session TTL in seconds (from MCP_SESSION_TTL env var, default 3600) */
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisRepo: RedisSessionRepository,
    private readonly serverFactory: McpServerFactory,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>('MCP_SESSION_TTL', 3600);
  }

  /**
   * Builds the server cache key from project and session identifiers
   */
  private cacheKey(projectApiKey: string, sessionId: string): string {
    return `${projectApiKey}:${sessionId}`;
  }

  /**
   * Creates a new MCP session for a project/user combination.
   * Stores metadata in Redis and caches the McpServer instance locally.
   * @param projectApiKey - Project API key
   * @param userId - User ID from JWT token
   * @param server - MCP Server instance
   * @param existingSessionId - Optional pre-generated session ID (e.g. from SDK transport)
   * @returns Session ID (provided or newly generated UUID)
   */
  async createSession(
    projectApiKey: string,
    userId: string,
    server: McpServer,
    existingSessionId?: string,
  ): Promise<string> {
    const sessionId = existingSessionId || uuidv4();
    const now = new Date().toISOString();

    const sessionData: RedisSessionData = {
      sessionId,
      projectApiKey,
      userId,
      createdAt: now,
      lastActivity: now,
    };

    await this.redisRepo.save(sessionData, this.ttlSeconds);

    // Cache McpServer locally (non-serializable)
    this.serverCache.set(this.cacheKey(projectApiKey, sessionId), server);

    this.logger.log(
      `Session created - Project: ${projectApiKey}, SessionId: ${sessionId}, UserId: ${userId}`,
    );

    return sessionId;
  }

  /**
   * Retrieves an existing MCP session.
   * Fetches metadata from Redis, gets/recreates McpServer from local cache.
   * @param projectApiKey - Project API key
   * @param sessionId - Session ID
   * @returns McpSession or null if not found
   */
  async getSession(projectApiKey: string, sessionId: string): Promise<McpSession | null> {
    const sessionData = await this.redisRepo.get(projectApiKey, sessionId);

    if (!sessionData) {
      this.logger.debug(
        `Session not found in Redis - Project: ${projectApiKey}, SessionId: ${sessionId}`,
      );
      return null;
    }

    // Update last activity in Redis (async, resets TTL)
    await this.redisRepo.updateLastActivity(projectApiKey, sessionId, this.ttlSeconds);

    // Get or recreate McpServer from local cache
    const key = this.cacheKey(projectApiKey, sessionId);
    let server = this.serverCache.get(key);

    if (!server) {
      this.logger.log(`Recreating McpServer for session ${sessionId} (not in local cache)`);
      server = this.serverFactory.createServer(projectApiKey);
      this.serverCache.set(key, server);
    }

    return {
      sessionId: sessionData.sessionId,
      projectApiKey: sessionData.projectApiKey,
      server,
      userId: sessionData.userId,
      createdAt: new Date(sessionData.createdAt),
      lastActivity: new Date(sessionData.lastActivity),
    };
  }

  /**
   * Deletes an MCP session from Redis and local cache.
   * @param projectApiKey - Project API key
   * @param sessionId - Session ID
   * @returns true if deleted, false if not found
   */
  async deleteSession(projectApiKey: string, sessionId: string): Promise<boolean> {
    const deleted = await this.redisRepo.delete(projectApiKey, sessionId);

    // Always remove from local cache
    this.serverCache.delete(this.cacheKey(projectApiKey, sessionId));

    if (deleted) {
      this.logger.log(`Session deleted - Project: ${projectApiKey}, SessionId: ${sessionId}`);
    }

    return deleted;
  }

  /**
   * No-op: Redis TTL handles session expiration automatically.
   * Kept for API compatibility.
   * @param _maxAgeMs - Ignored (Redis TTL governs expiration)
   * @returns Always 0 (Redis handles cleanup via TTL)
   */
  async cleanupStale(_maxAgeMs?: number): Promise<number> {
    // Redis TTL handles expiration automatically — no manual cleanup needed.
    this.logger.debug('cleanupStale called — Redis TTL handles expiration');
    return 0;
  }

  /**
   * Gets session statistics from Redis.
   * @returns Object with total sessions and per-project counts
   */
  async getStats(): Promise<{ totalSessions: number; projectCounts: Record<string, number> }> {
    return this.redisRepo.getStats();
  }
}
