/**
 * PartnerMetaService
 *
 * Fetches per-alias branding metadata from the external alias Redis instance.
 * Key format:  {ALIAS_REDIS_KEY_PREFIX}-meta:{alias}  →  JSON string (AliasMeta)
 *
 * Every consumer receives AliasMeta | null — null means "use defaults".
 * Validation failures, parse errors, and missing keys all return null
 * so the caller's fallback chain applies without branching.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { z } from 'zod';
import { ALIAS_REDIS_CLIENT } from './alias.constants';

/** Zod schema — single source of truth for AliasMeta shape + validation */
export const AliasMetaSchema = z.object({
  // Required
  partnerId: z.string().min(1),
  brandName: z.string().min(1),

  // MCP server identity
  mcpServerName: z.string().optional(),
  domain: z.string().optional(),

  // OAuth login page
  loginTitle: z.string().optional(),
  loginSubtitle: z.string().optional(),
  loginLogo: z.string().optional(),
  loginAccentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),

  // Widget footer
  widgetFooterText: z.string().optional(),
  widgetLogoUrl: z.string().startsWith('https://').optional(),
});

/** TypeScript type inferred from the Zod schema */
export type AliasMeta = z.infer<typeof AliasMetaSchema>;

@Injectable()
export class PartnerMetaService {
  private readonly logger = new Logger(PartnerMetaService.name);

  constructor(
    @Inject(ALIAS_REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fetches and validates alias metadata from Redis.
   * Returns null if the key is missing, unparseable, or fails validation.
   */
  async getAliasMeta(alias: string): Promise<AliasMeta | null> {
    const prefix = this.configService.get<string>('ALIAS_REDIS_KEY_PREFIX', 'alias');
    const key = `${prefix}-meta:${alias}`;

    let raw: string | null;
    try {
      raw = await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`Redis error fetching alias meta for ${alias}: ${(err as Error).message}`);
      return null;
    }

    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Failed to parse alias meta JSON for ${alias}`);
      return null;
    }

    const result = AliasMetaSchema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(
        `Invalid alias meta for ${alias}: ${result.error.issues.map((i) => i.message).join(', ')}`,
      );
      return null;
    }

    return result.data;
  }
}
