import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface ConnectionState {
  token?: string | null | undefined;
  userId?: string | null | undefined;
  apiKey?: string;
}

/**
 * Redis Service for managing session state with TTL
 * Handles connection lifecycle and provides typed methods for session management
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private readonly sessionTtl: number;
  private readonly sessionPrefix = 'mcp:session:';

  constructor(private configService: ConfigService) {
    this.sessionTtl = this.configService.get<number>('REDIS_SESSION_TTL') || 3600; // 1 hour default
  }

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const db = this.configService.get<number>('REDIS_DB') || 0;

    this.logger.log(`Connecting to Redis at ${host}:${port} (db: ${db})`);

    this.client = new Redis({
      host,
      port,
      password,
      db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis connection attempt ${times}, retrying in ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis client ready');
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis client error:', error);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis client connection closed');
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis client reconnecting');
    });

    // Wait for connection to be ready
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', () => resolve());
      this.client.once('error', (error) => reject(error));
      // Timeout after 5 seconds
      setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
    });

    this.logger.log('Redis service initialized successfully');
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting Redis client');
    await this.client.quit();
  }

  /**
   * Get session state by session ID
   * Uses GETEX for atomic get-and-reset-TTL operation
   */
  async getSessionState(sessionId: string): Promise<ConnectionState | null> {
    const key = this.sessionPrefix + sessionId;

    try {
      // GETEX atomically gets value and resets TTL (Redis 6.2+)
      // Falls back to GET + EXPIRE for older Redis versions
      const data = await this.client.getex(key, 'EX', this.sessionTtl).catch(async () => {
        // Fallback for Redis < 6.2
        const value = await this.client.get(key);
        if (value) {
          // Best-effort TTL refresh - don't fail if expire fails
          await this.client.expire(key, this.sessionTtl).catch((err) => {
            this.logger.warn(`Failed to refresh TTL for session ${sessionId} (best-effort):`, err);
          });
        }
        return value;
      });

      if (!data) {
        return null;
      }

      const state = JSON.parse(data) as ConnectionState;
      this.logger.debug(`Session ${sessionId} accessed, TTL reset to ${this.sessionTtl}s`);
      return state;
    } catch (error) {
      this.logger.error(`Failed to get session data for ${sessionId}:`, error);
      throw error; // Let caller handle Redis unavailability
    }
  }

  /**
   * Set session state with TTL
   */
  async setSessionState(sessionId: string, state: ConnectionState): Promise<void> {
    const key = this.sessionPrefix + sessionId;
    const data = JSON.stringify(state);

    await this.client.setex(key, this.sessionTtl, data);
    this.logger.debug(`Session ${sessionId} saved with TTL ${this.sessionTtl}s`);
  }

  /**
   * Update session state (partial update with TTL reset)
   */
  async updateSessionState(sessionId: string, updates: Partial<ConnectionState>): Promise<void> {
    const existingState = await this.getSessionState(sessionId);

    if (!existingState) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const newState: ConnectionState = {
      ...existingState,
      ...updates,
    };

    await this.setSessionState(sessionId, newState);
  }

  /**
   * Delete session state
   */
  async deleteSessionState(sessionId: string): Promise<void> {
    const key = this.sessionPrefix + sessionId;
    await this.client.del(key);
    this.logger.debug(`Session ${sessionId} deleted`);
  }

  /**
   * Check if session exists
   */
  async hasSession(sessionId: string): Promise<boolean> {
    const key = this.sessionPrefix + sessionId;
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  /**
   * Get all session IDs (for debugging/monitoring)
   */
  async getAllSessionIds(): Promise<string[]> {
    const pattern = this.sessionPrefix + '*';
    const keys = await this.client.keys(pattern);
    return keys.map((key) => key.replace(this.sessionPrefix, ''));
  }

  /**
   * Get session TTL in seconds
   */
  async getSessionTtl(sessionId: string): Promise<number> {
    const key = this.sessionPrefix + sessionId;
    return await this.client.ttl(key);
  }

  /**
   * Get Redis client for advanced operations
   */
  getClient(): Redis {
    return this.client;
  }
}
