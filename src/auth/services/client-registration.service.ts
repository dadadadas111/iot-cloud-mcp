import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { ClientRepository } from './client.repository';
import {
  ClientRegistrationRequestDto,
  ClientRegistrationResponse,
  OAuthClientRecord,
} from '../dto/client-registration.dto';

const DEFAULT_GRANT_TYPES = ['authorization_code', 'refresh_token'];
const DEFAULT_RESPONSE_TYPES = ['code'];
const DEFAULT_AUTH_METHOD = 'none';
const DEFAULT_MAX_CLIENTS_PER_ALIAS = 50;

@Injectable()
export class ClientRegistrationService {
  private readonly logger = new Logger(ClientRegistrationService.name);

  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly configService: ConfigService,
  ) {}

  async registerClient(
    alias: string,
    dto: ClientRegistrationRequestDto,
  ): Promise<ClientRegistrationResponse> {
    this.validateRedirectUris(dto.redirect_uris);
    await this.enforceClientLimit(alias);

    const clientId = uuidv4();
    const authMethod = dto.token_endpoint_auth_method || DEFAULT_AUTH_METHOD;
    const issuedAt = Math.floor(Date.now() / 1000);

    let plaintextSecret: string | undefined;
    let secretHash: string | undefined;

    if (authMethod !== 'none') {
      plaintextSecret = randomBytes(32).toString('hex');
      secretHash = await this.clientRepository.hashSecret(plaintextSecret);
    }

    const record: OAuthClientRecord = {
      client_id: clientId,
      client_secret_hash: secretHash,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: secretHash ? 0 : undefined,
      redirect_uris: dto.redirect_uris,
      grant_types: dto.grant_types || DEFAULT_GRANT_TYPES,
      response_types: dto.response_types || DEFAULT_RESPONSE_TYPES,
      token_endpoint_auth_method: authMethod,
      client_name: dto.client_name,
      scope: dto.scope,
      alias,
    };

    await this.clientRepository.save(record);

    this.logger.log(`Client registered: ${clientId} (${authMethod}) for alias ${alias}`);

    return {
      client_id: clientId,
      client_secret: plaintextSecret,
      client_id_issued_at: issuedAt,
      client_secret_expires_at: secretHash ? 0 : undefined,
      redirect_uris: record.redirect_uris,
      grant_types: record.grant_types,
      response_types: record.response_types,
      token_endpoint_auth_method: record.token_endpoint_auth_method,
      client_name: record.client_name,
      scope: record.scope,
    };
  }

  async authenticateClient(
    alias: string,
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthClientRecord | null> {
    const record = await this.clientRepository.get(alias, clientId);
    if (!record) return null;

    if (record.token_endpoint_auth_method === 'none') {
      return record;
    }

    if (!clientSecret || !record.client_secret_hash) {
      return null;
    }

    const valid = await this.clientRepository.verifySecret(clientSecret, record.client_secret_hash);
    return valid ? record : null;
  }

  async getClient(alias: string, clientId: string): Promise<OAuthClientRecord | null> {
    return this.clientRepository.get(alias, clientId);
  }

  validateRedirectUri(record: OAuthClientRecord, redirectUri: string): boolean {
    return record.redirect_uris.includes(redirectUri);
  }

  private validateRedirectUris(uris: string[]): void {
    for (const uri of uris) {
      try {
        const parsed = new URL(uri);
        if (parsed.hash) {
          throw new BadRequestException({
            error: 'invalid_redirect_uri',
            error_description: `Redirect URI must not contain a fragment: ${uri}`,
          });
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        throw new BadRequestException({
          error: 'invalid_redirect_uri',
          error_description: `Invalid redirect URI: ${uri}`,
        });
      }
    }
  }

  private async enforceClientLimit(alias: string): Promise<void> {
    const maxClients = this.configService.get<number>(
      'MAX_CLIENTS_PER_ALIAS',
      DEFAULT_MAX_CLIENTS_PER_ALIAS,
    );
    const currentCount = await this.clientRepository.countClientsForAlias(alias);
    if (currentCount >= maxClients) {
      throw new BadRequestException({
        error: 'invalid_client_metadata',
        error_description: `Maximum number of clients (${maxClients}) reached for this tenant`,
      });
    }
  }
}
