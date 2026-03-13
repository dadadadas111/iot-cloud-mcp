import { Module, Global, Logger, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ALIAS_REDIS_CLIENT } from './alias.constants';
import { AliasService } from './alias.service';
import { PartnerMetaService } from './partner-meta.service';

const logger = new Logger('AliasRedisModule');

/**
 * AliasModule
 *
 * Provides a dedicated ioredis connection to the external alias Redis instance.
 * Kept separate from RedisModule (session store) so the two concerns never share
 * a connection and can be configured / replaced independently.
 *
 * Key format stored by the dashboard:
 *   {ALIAS_REDIS_KEY_PREFIX}:{alias}  →  projectApiKey (plain string)
 */
@Global()
@Module({
  providers: [
    {
      provide: ALIAS_REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const client = new Redis({
          host: configService.get<string>('ALIAS_REDIS_HOST', 'localhost'),
          port: configService.get<number>('ALIAS_REDIS_PORT', 6379),
          password: configService.get<string>('ALIAS_REDIS_PASSWORD') || undefined,
          db: configService.get<number>('ALIAS_REDIS_DB', 0),
          retryStrategy: (times: number) => {
            if (times > 3) {
              logger.error(`Alias Redis connection failed after ${times} attempts. Giving up.`);
              return null;
            }
            const delay = Math.min(times * 500, 3000);
            logger.warn(
              `Alias Redis connection attempt ${times} failed. Retrying in ${delay}ms...`,
            );
            return delay;
          },
          lazyConnect: false,
        });

        client.on('connect', () => {
          logger.log('Alias Redis client connected');
        });

        client.on('error', (err: Error) => {
          logger.error(`Alias Redis client error: ${err.message}`);
        });

        client.on('close', () => {
          logger.warn('Alias Redis client connection closed');
        });

        return client;
      },
      inject: [ConfigService],
    },
    AliasService,
    PartnerMetaService,
  ],
  exports: [AliasService, PartnerMetaService],
})
export class AliasModule implements OnModuleDestroy {
  constructor(
    @Inject(ALIAS_REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.redis.quit();
      logger.log('Alias Redis client disconnected gracefully');
    } catch (err) {
      logger.error(`Error disconnecting Alias Redis: ${(err as Error).message}`);
    }
  }
}
