import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SessionStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionStoreService.name);
  private client: Redis;
  private readonly sessionTtl: number;
  private readonly prefix = 'mcp_v2:session:';

  constructor(private configService: ConfigService) {
    this.sessionTtl = this.configService.get<number>('REDIS_SESSION_TTL') || 3600;
  }

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const port = this.configService.get<number>('REDIS_PORT') || 6379;
    const password = this.configService.get<string>('REDIS_PASSWORD') || undefined;
    const db = this.configService.get<number>('REDIS_DB') || 0;

    this.client = new Redis({ host, port, password, db });
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', () => resolve());
      this.client.once('error', (e) => reject(e));
      setTimeout(() => reject(new Error('Redis connect timeout')), 5000);
    });
    this.logger.log('SessionStore Redis ready');
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  private key(sessionId: string) {
    return this.prefix + sessionId;
  }

  async setApiKey(sessionId: string, apiKey: string): Promise<void> {
    await this.client.setex(this.key(sessionId), this.sessionTtl, JSON.stringify({ apiKey }));
    this.logger.debug(`Saved apiKey for session ${sessionId}`);
  }

  async getApiKey(sessionId: string): Promise<string | null> {
    const val = await this.client.get(this.key(sessionId));
    if (!val) return null;
    try {
      const parsed = JSON.parse(val);
      return parsed.apiKey || null;
    } catch (e) {
      this.logger.warn('Failed to parse session value', e);
      return null;
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.client.del(this.key(sessionId));
  }
}
