import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT, MCP_SESSION_PREFIX, MCP_PROJECT_SESSIONS_PREFIX } from '../../redis/redis.constants';
import { RedisSessionData } from '../dto/mcp-session.dto';

/**
 * RedisSessionRepository
 * Encapsulates all Redis operations for MCP session metadata.
 * Handles serialization, TTL management, and project-session indexing.
 */
@Injectable()
export class RedisSessionRepository {
  private readonly logger = new Logger(RedisSessionRepository.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Builds the Redis key for a session
   */
  private sessionKey(projectApiKey: string, sessionId: string): string {
    return `${MCP_SESSION_PREFIX}${projectApiKey}:${sessionId}`;
  }

  /**
   * Builds the Redis key for a project's session set
   */
  private projectSetKey(projectApiKey: string): string {
    return `${MCP_PROJECT_SESSIONS_PREFIX}${projectApiKey}`;
  }

  /**
   * Saves session metadata to Redis with TTL and adds sessionId to the project set.
   * Uses a pipeline for atomicity.
   */
  async save(data: RedisSessionData, ttlSeconds: number): Promise<void> {
    const key = this.sessionKey(data.projectApiKey, data.sessionId);
    const setKey = this.projectSetKey(data.projectApiKey);
    const json = JSON.stringify(data);

    const pipeline = this.redis.pipeline();
    pipeline.set(key, json, 'EX', ttlSeconds);
    pipeline.sadd(setKey, data.sessionId);
    await pipeline.exec();

    this.logger.debug(
      `Session saved to Redis - Key: ${key}, TTL: ${ttlSeconds}s`,
    );
  }

  /**
   * Retrieves session metadata from Redis.
   * Returns null if session does not exist or has expired.
   */
  async get(projectApiKey: string, sessionId: string): Promise<RedisSessionData | null> {
    const key = this.sessionKey(projectApiKey, sessionId);
    const json = await this.redis.get(key);

    if (!json) {
      return null;
    }

    try {
      return JSON.parse(json) as RedisSessionData;
    } catch (err) {
      this.logger.error(`Failed to parse session data for key ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Deletes a session from Redis and removes it from the project set.
   * Uses a pipeline for atomicity.
   */
  async delete(projectApiKey: string, sessionId: string): Promise<boolean> {
    const key = this.sessionKey(projectApiKey, sessionId);
    const setKey = this.projectSetKey(projectApiKey);

    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    pipeline.srem(setKey, sessionId);
    const results = await pipeline.exec();

    // First command result: number of keys deleted (0 or 1)
    const deleted = results?.[0]?.[1] === 1;

    if (deleted) {
      this.logger.debug(`Session deleted from Redis - Key: ${key}`);
    }

    return deleted;
  }

  /**
   * Updates lastActivity timestamp and resets TTL.
   * Re-serializes the full session data to preserve all fields.
   */
  async updateLastActivity(
    projectApiKey: string,
    sessionId: string,
    ttlSeconds: number,
  ): Promise<void> {
    const key = this.sessionKey(projectApiKey, sessionId);
    const json = await this.redis.get(key);

    if (!json) {
      return;
    }

    try {
      const data = JSON.parse(json) as RedisSessionData;
      data.lastActivity = new Date().toISOString();
      await this.redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.error(
        `Failed to update lastActivity for key ${key}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Returns all active session IDs for a given project.
   * Filters out stale SET members whose session keys have expired in Redis.
   * Automatically prunes stale members from the SET.
   */
  async getProjectSessionIds(projectApiKey: string): Promise<string[]> {
    const setKey = this.projectSetKey(projectApiKey);
    const allMembers = await this.redis.smembers(setKey);

    if (allMembers.length === 0) {
      return [];
    }

    // Check which session keys actually exist in Redis
    const pipeline = this.redis.pipeline();
    for (const sid of allMembers) {
      pipeline.exists(this.sessionKey(projectApiKey, sid));
    }
    const results = await pipeline.exec();

    const activeIds: string[] = [];
    const staleIds: string[] = [];

    for (let i = 0; i < allMembers.length; i++) {
      const exists = results?.[i]?.[1] === 1;
      if (exists) {
        activeIds.push(allMembers[i]);
      } else {
        staleIds.push(allMembers[i]);
      }
    }

    // Prune stale members from the SET
    if (staleIds.length > 0) {
      const cleanupPipeline = this.redis.pipeline();
      for (const sid of staleIds) {
        cleanupPipeline.srem(setKey, sid);
      }
      await cleanupPipeline.exec();
      this.logger.debug(
        `Pruned ${staleIds.length} stale session(s) from project set ${setKey}`,
      );
    }

    return activeIds;
  }

  /**
   * Returns session statistics across all projects.
   * Uses getProjectSessionIds to get accurate counts (filters expired sessions).
   */
  async getStats(): Promise<{ totalSessions: number; projectCounts: Record<string, number> }> {
    let totalSessions = 0;
    const projectCounts: Record<string, number> = {};

    // Scan for all project set keys
    const pattern = `${MCP_PROJECT_SESSIONS_PREFIX}*`;
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      for (const setKey of keys) {
        const projectApiKey = setKey.replace(MCP_PROJECT_SESSIONS_PREFIX, '');
        // Use getProjectSessionIds for accurate count (prunes stale members)
        const activeIds = await this.getProjectSessionIds(projectApiKey);
        projectCounts[projectApiKey] = activeIds.length;
        totalSessions += activeIds.length;
      }
    } while (cursor !== '0');

    return { totalSessions, projectCounts };
  }
}
