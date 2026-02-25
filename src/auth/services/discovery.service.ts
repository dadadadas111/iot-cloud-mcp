import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * OAuth 2.1 Discovery Service
 * Implements RFC 8414 - OAuth 2.0 Authorization Server Metadata
 */
@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get protected resource metadata (RFC 8707)
   * Returns OAuth 2.0 Resource Server metadata
   *
   * @param projectApiKey - Project API key
   * @returns Resource metadata object
   */
  getProtectedResourceMetadata(projectApiKey: string): any {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    const resourceUrl = `${baseUrl}/api/${projectApiKey}`;

    this.logger.log(`Generating protected resource metadata for ${projectApiKey}`);

    return {
      resource: resourceUrl,
      authorization_servers: [`${baseUrl}/auth/${projectApiKey}`],
      bearer_methods_supported: ['header', 'body'],
      resource_signing_alg_values_supported: ['RS256', 'HS256'],
      resource_documentation: `${baseUrl}/docs`,
      resource_policy_uri: `${baseUrl}/policy`,
      resource_tos_uri: `${baseUrl}/terms`,
    };
  }

  /**
   * Get authorization server metadata (RFC 8414)
   * Returns OAuth 2.1 Authorization Server metadata
   *
   * @param projectApiKey - Project API key
   * @returns Authorization server metadata object
   */
  getAuthorizationServerMetadata(projectApiKey: string): any {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    const issuer = `${baseUrl}/auth/${projectApiKey}`;

    this.logger.log(`Generating authorization server metadata for ${projectApiKey}`);

    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      code_challenge_methods_supported: ['S256', 'plain'],
      scopes_supported: ['read', 'write', 'admin'],
      response_modes_supported: ['query', 'fragment'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256', 'HS256'],
      token_endpoint_auth_signing_alg_values_supported: ['RS256', 'HS256'],
      request_parameter_supported: false,
      request_uri_parameter_supported: false,
      require_request_uri_registration: false,
      claims_parameter_supported: false,
      revocation_endpoint: `${issuer}/revoke`,
      revocation_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      introspection_endpoint: `${issuer}/introspect`,
      introspection_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      service_documentation: `${baseUrl}/docs`,
      ui_locales_supported: ['en-US'],
      op_policy_uri: `${baseUrl}/policy`,
      op_tos_uri: `${baseUrl}/terms`,
    };
  }
}
