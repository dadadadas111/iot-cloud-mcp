import { Module, Global, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

const logger = new Logger('RedisModule');

/**
 * RedisModule
 * Provides a configured ioredis client as a global injectable provider.
 * Reads connection config from environment variables via ConfigService.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const client = new Redis({
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: configService.get<number>('REDIS_DB', 0),
          retryStrategy: (times: number) => {
            if (times > 3) {
              logger.error(`Redis connection failed after ${times} attempts. Giving up.`);
              return null; // Stop retrying
            }
            const delay = Math.min(times * 500, 3000);
            logger.warn(`Redis connection attempt ${times} failed. Retrying in ${delay}ms...`);
            return delay;
          },
          lazyConnect: false,
        });

        client.on('connect', () => {
          logger.log('Redis client connected');
        });

        client.on('error', (err: Error) => {
          logger.error(`Redis client error: ${err.message}`);
        });

        client.on('close', () => {
          logger.warn('Redis client connection closed');
        });

        return client;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
      logger.log('Redis client disconnected gracefully');
    } catch (err) {
      logger.error(`Error disconnecting Redis: ${(err as Error).message}`);
    }
  }
}
