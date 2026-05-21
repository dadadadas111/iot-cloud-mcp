import {
  Controller,
  Get,
  Post,
  Options,
  Body,
  Query,
  Param,
  Res,
  Headers,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OAuthService } from './services/oauth.service';
import { DiscoveryService } from './services/discovery.service';
import { AuthorizeQueryDto } from './dto/authorize.dto';
import { TokenRequestDto } from './dto/token-request.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { generateLoginPage } from './templates/login-page.template';
import { PartnerMetaService } from '../alias/partner-meta.service';
import { AliasService } from '../alias/alias.service';

/**
 * OAuth 2.1 Authorization Controller
 * Implements OAuth 2.1 authorization flow endpoints.
 *
 * Route param is :alias (the partner alias from the subdomain).
 * AliasService resolves alias → real projectApiKey for IoT API calls.
 * PartnerMetaService resolves alias → branding for login page rendering.
 */
@ApiTags('OAuth')
@Controller('auth/:alias')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly discoveryService: DiscoveryService,
    private readonly partnerMetaService: PartnerMetaService,
    private readonly aliasService: AliasService,
  ) {}

  /**
   * Resolves a partner alias to the actual project API key.
   * Sends a 404 JSON response and returns null when the alias is unknown.
   * Use for handlers that inject @Res() directly.
   */
  private async resolveAlias(alias: string, body: unknown, res: Response): Promise<string | null> {
    const apiKey = await this.aliasService.resolveAlias(alias);
    if (!apiKey) {
      res.status(HttpStatus.NOT_FOUND).json({
        jsonrpc: '2.0',
        error: {
          code: -32004,
          message: `Not Found: Unknown alias '${alias}'`,
        },
        id: (body as Record<string, unknown>)?.id || null,
      });
      return null;
    }
    return apiKey;
  }

  /**
   * OAuth 2.1 Authorization Endpoint
   * Renders login page with OAuth parameters and partner branding.
   */
  @Get('authorize')
  @ApiOperation({ summary: 'OAuth 2.1 authorization endpoint' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  @ApiResponse({ status: 200, description: 'Login page rendered' })
  @ApiResponse({ status: 404, description: 'Unknown alias' })
  async authorize(
    @Param('alias') alias: string,
    @Query() query: AuthorizeQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Authorization request for alias: ${alias}`);
    this.logger.debug(`  redirect_uri: ${query.redirect_uri}`);
    this.logger.debug(`  response_type: ${query.response_type}`);

    // Validate alias exists (we need the real key to confirm, even if not used here)
    const projectApiKey = await this.resolveAlias(alias, undefined, res);
    if (!projectApiKey) return;

    const meta = await this.partnerMetaService.getAliasMeta(alias);

    // Generate login page — pass alias as the key for form action URL (/auth/{alias}/login)
    const html = generateLoginPage(alias, query, meta ?? undefined);
    res.status(HttpStatus.OK).contentType('text/html').send(html);
  }

  /**
   * OAuth Login Form Handler
   * Processes login form submission and redirects with authorization code.
   */
  @Post('login')
  @ApiOperation({ summary: 'Process login form and generate authorization code' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  @ApiResponse({ status: 302, description: 'Redirect to callback with code' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 404, description: 'Unknown alias' })
  async login(
    @Param('alias') alias: string,
    @Body()
    body: {
      email: string;
      password: string;
      client_id: string;
      redirect_uri: string;
      state: string;
      code_challenge: string;
      code_challenge_method: string;
      scope?: string;
      resource?: string;
    },
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Login attempt for alias: ${alias}`);
    this.logger.debug(`  Redirect URI from form: ${body.redirect_uri}`);

    // Resolve alias → real project API key (required for IoT API authentication calls)
    const projectApiKey = await this.resolveAlias(alias, body, res);
    if (!projectApiKey) return;

    const meta = await this.partnerMetaService.getAliasMeta(alias);

    try {
      // Authenticate user and generate authorization code
      const authCode = await this.oauthService.handleLogin(
        projectApiKey,
        body.email,
        body.password,
        body.code_challenge,
        body.code_challenge_method,
        body.redirect_uri,
        body.state,
        body.scope,
        body.resource,
      );

      // Build redirect URL with authorization code
      const redirectUrl = new URL(body.redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      redirectUrl.searchParams.set('state', body.state);

      this.logger.log(`Login successful, redirecting to ${redirectUrl.toString()}`);
      res.redirect(HttpStatus.FOUND, redirectUrl.toString());
    } catch (err) {
      this.logger.warn(`Login failed for ${body.email}: ${err.message}`);

      // Re-render login page with error — pass alias for form action URL
      const oauthParams = {
        client_id: body.client_id,
        redirect_uri: body.redirect_uri,
        state: body.state,
        code_challenge: body.code_challenge,
        code_challenge_method: body.code_challenge_method,
        scope: body.scope,
        response_type: 'code',
        resource: body.resource,
      };

      const html = generateLoginPage(
        alias,
        oauthParams,
        meta ?? undefined,
        err.message || 'Login failed',
      );
      res.status(HttpStatus.UNAUTHORIZED).contentType('text/html').send(html);
    }
  }

  /**
   * CORS Preflight Handler for Token Endpoint
   */
  @Options('token')
  @ApiOperation({ summary: 'CORS preflight for token endpoint' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  tokenOptions(@Res() res: Response): void {
    this.logger.log('CORS preflight request received for token endpoint');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, x-admin-api-key, x-project-api-key, mcp-protocol-version',
    );
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.status(HttpStatus.NO_CONTENT).send();
  }

  /**
   * OAuth 2.1 Token Endpoint
   * Exchanges authorization code or refresh token for access token.
   */
  @Post('token')
  @ApiOperation({ summary: 'OAuth 2.1 token endpoint' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  @ApiResponse({ status: 200, description: 'Token issued', type: TokenResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Invalid code or refresh token' })
  @ApiResponse({ status: 404, description: 'Unknown alias' })
  async token(
    @Param('alias') alias: string,
    @Body() body: TokenRequestDto,
    @Headers() headers: Record<string, string>,
  ): Promise<TokenResponseDto> {
    this.logger.log(`Token request for alias: ${alias}, grant_type: ${body.grant_type}`);
    this.logger.debug(
      `Token request headers: ${JSON.stringify({
        authorization: headers.authorization || headers.Authorization ? '[PRESENT]' : 'MISSING',
        'content-type': headers['content-type'],
        origin: headers.origin,
      })}`,
    );
    // Note: body may contain code, refresh_token, code_verifier — never log at info level
    this.logger.debug(
      `Token request grant_type=${body.grant_type}, client_id=${body.client_id || 'none'}`,
    );

    // Resolve alias → real project API key
    const projectApiKey = await this.aliasService.resolveAlias(alias);
    if (!projectApiKey) {
      throw new NotFoundException(`Unknown alias '${alias}'`);
    }

    // Parse Basic Auth header if present (ChatGPT MCP client pattern)
    let clientId: string | undefined;
    let _clientSecret: string | undefined;
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.substring(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [id, secret] = credentials.split(':');
        clientId = id;
        _clientSecret = secret;
        this.logger.debug(`Basic Auth parsed: client_id=${clientId}`);
      } catch (error) {
        this.logger.warn(`Failed to parse Basic Auth header: ${error.message}`);
      }
    }

    // Handle authorization_code grant
    if (body.grant_type === 'authorization_code') {
      if (!body.code) {
        throw new BadRequestException('code is required for authorization_code grant');
      }

      // PKCE `code_verifier` and `redirect_uri` are optional for this implementation
      // because the underlying IoT API performs the actual token exchange and
      // does not require those parameters. Accept requests from clients that
      // don't implement PKCE (e.g., some OAuth clients) to improve compatibility.
      return this.oauthService.exchangeCode(
        projectApiKey,
        body.code,
        body.code_verifier,
        body.redirect_uri,
        body.resource,
      );
    }

    // Handle refresh_token grant
    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) {
        throw new BadRequestException('refresh_token is required for refresh_token grant');
      }

      return this.oauthService.refreshToken(projectApiKey, body.refresh_token, body.resource);
    }

    throw new BadRequestException('Unsupported grant_type');
  }

  /**
   * Static Client Registration
   * Returns static client_id (PoC - no actual registration)
   */
  @Post('register')
  @ApiOperation({ summary: 'Static client registration (PoC)' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  @ApiResponse({ status: 200, description: 'Client registered' })
  async register(
    @Param('alias') alias: string,
    @Body() body?: Record<string, unknown>,
  ): Promise<any> {
    this.logger.log(`Client registration request for alias: ${alias}`);

    const redirectUris =
      Array.isArray(body?.redirect_uris) &&
      body.redirect_uris.every((uri): uri is string => typeof uri === 'string')
        ? [...body.redirect_uris]
        : undefined;

    // Return static client_id (PoC)
    return {
      client_id: 'web-client-static',
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(redirectUris ? { redirect_uris: redirectUris } : {}),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  /**
   * Authorization Server Metadata (RFC 8414)
   * Returns metadata with alias-based endpoint URLs.
   */
  @Get('.well-known/oauth-authorization-server')
  @ApiOperation({ summary: 'OAuth 2.1 authorization server metadata' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  @ApiResponse({ status: 200, description: 'Server metadata' })
  getAuthServerMetadata(@Param('alias') alias: string): any {
    this.logger.log(`Auth server metadata request for alias: ${alias}`);
    // Pass alias — discovery service builds URLs like /auth/{alias}/authorize
    return this.discoveryService.getAuthorizationServerMetadata(alias);
  }

  /**
   * Protected Resource Metadata (RFC 8707)
   * Returns metadata with alias-based MCP resource URL.
   */
  @Get('.well-known/oauth-protected-resource')
  @ApiOperation({ summary: 'OAuth 2.1 protected resource metadata' })
  @ApiParam({ name: 'alias', description: 'Partner alias' })
  @ApiResponse({ status: 200, description: 'Resource metadata' })
  getResourceMetadata(@Param('alias') alias: string): any {
    this.logger.log(`Resource metadata request for alias: ${alias}`);
    // Pass alias — discovery service builds resource URL as /mcp/{alias}
    return this.discoveryService.getProtectedResourceMetadata(alias);
  }
}
