import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ALIAS_REDIS_CLIENT } from './alias.constants';

/**
 * AliasService
 *
 * Resolves partner aliases to their underlying project API keys.
 * Partners register via the dashboard which writes:
 *   {ALIAS_REDIS_KEY_PREFIX}:{alias}  →  projectApiKey
 * into the external Redis instance.
 *
 * The key prefix is env-configurable so staging and production can share
 * the same Redis while using different namespaces (e.g. "alias-staging:" vs "alias:").
 */
@Injectable()
export class AliasService {
  private readonly logger = new Logger(AliasService.name);

  constructor(
    @Inject(ALIAS_REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolves an alias to the actual project API key.
   * Returns null if the alias is not registered.
   */
  async resolveAlias(alias: string): Promise<string | null> {
    const prefix = this.configService.get<string>('ALIAS_REDIS_KEY_PREFIX', 'alias');
    const key = `${prefix}:${alias}`;

    const apiKey = await this.redis.get(key);

    if (!apiKey) {
      this.logger.warn(`Alias not found: ${alias} (key: ${key})`);
      return null;
    }

    this.logger.debug(`Alias resolved: ${alias} → ${apiKey}`);
    return apiKey;
  }
}
