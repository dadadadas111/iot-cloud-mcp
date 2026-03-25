import { Injectable, Inject, Logger } from '@nestjs/common';
import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import Redis from 'ioredis';
import {
  REDIS_CLIENT,
  OAUTH_CLIENT_PREFIX,
  OAUTH_ALIAS_CLIENTS_PREFIX,
} from '../../redis/redis.constants';
import { OAuthClientRecord } from '../dto/client-registration.dto';

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;

@Injectable()
export class ClientRepository {
  private readonly logger = new Logger(ClientRepository.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private clientKey(alias: string, clientId: string): string {
    return `${OAUTH_CLIENT_PREFIX}${alias}:${clientId}`;
  }

  private aliasSetKey(alias: string): string {
    return `${OAUTH_ALIAS_CLIENTS_PREFIX}${alias}`;
  }

  async save(record: OAuthClientRecord): Promise<void> {
    const key = this.clientKey(record.alias, record.client_id);
    const setKey = this.aliasSetKey(record.alias);
    const json = JSON.stringify(record);

    const pipeline = this.redis.pipeline();
    pipeline.set(key, json);
    pipeline.sadd(setKey, record.client_id);
    await pipeline.exec();

    this.logger.debug(`Client saved: ${record.client_id} for alias ${record.alias}`);
  }

  async get(alias: string, clientId: string): Promise<OAuthClientRecord | null> {
    const key = this.clientKey(alias, clientId);
    const json = await this.redis.get(key);

    if (!json) {
      return null;
    }

    try {
      return JSON.parse(json) as OAuthClientRecord;
    } catch (err) {
      this.logger.error(`Failed to parse client record for ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async delete(alias: string, clientId: string): Promise<boolean> {
    const key = this.clientKey(alias, clientId);
    const setKey = this.aliasSetKey(alias);

    const pipeline = this.redis.pipeline();
    pipeline.del(key);
    pipeline.srem(setKey, clientId);
    const results = await pipeline.exec();

    const deleted = results?.[0]?.[1] === 1;
    if (deleted) {
      this.logger.debug(`Client deleted: ${clientId} for alias ${alias}`);
    }
    return deleted;
  }

  async getClientIdsForAlias(alias: string): Promise<string[]> {
    const setKey = this.aliasSetKey(alias);
    return this.redis.smembers(setKey);
  }

  async countClientsForAlias(alias: string): Promise<number> {
    const setKey = this.aliasSetKey(alias);
    return this.redis.scard(setKey);
  }

  async hashSecret(plaintext: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = (await scryptAsync(plaintext, salt, SCRYPT_KEYLEN)) as Buffer;
    return `${salt}:${derived.toString('hex')}`;
  }

  async verifySecret(plaintext: string, stored: string): Promise<boolean> {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;

    const derived = (await scryptAsync(plaintext, salt, SCRYPT_KEYLEN)) as Buffer;
    const storedBuffer = Buffer.from(hash, 'hex');

    if (derived.length !== storedBuffer.length) return false;
    return timingSafeEqual(derived, storedBuffer);
  }
}
