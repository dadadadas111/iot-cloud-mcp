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
import { OAuthService } from '../auth/services/oauth.service';
import { DiscoveryService } from '../auth/services/discovery.service';
import { AuthorizeQueryDto } from '../auth/dto/authorize.dto';
import { TokenRequestDto } from '../auth/dto/token-request.dto';
import { TokenResponseDto } from '../auth/dto/token-response.dto';
import { generateLoginPage } from '../auth/templates/login-page.template';
import { PartnerMetaService } from '../alias/partner-meta.service';
import { AliasService } from '../alias/alias.service';

/**
 * Subdomain-routed OAuth controller.
 *
 * Nginx rewrites {alias}.domain.com/* → /mcp/{alias}/*
 * This controller mirrors AuthController's endpoints under that prefix
 * so OAuth flows work through wildcard subdomains.
 *
 * Base-domain access (/auth/{alias}/*) continues to work via AuthController.
 */
@Controller('mcp/:alias')
export class McpAuthController {
  private readonly logger = new Logger(McpAuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly discoveryService: DiscoveryService,
    private readonly partnerMetaService: PartnerMetaService,
    private readonly aliasService: AliasService,
  ) {}

  private async resolveOrFail(alias: string): Promise<string> {
    const apiKey = await this.aliasService.resolveAlias(alias);
    if (!apiKey) {
      throw new NotFoundException(`Unknown alias '${alias}'`);
    }
    return apiKey;
  }

  @Get('.well-known/oauth-protected-resource')
  async getResourceMetadata(@Param('alias') alias: string): Promise<any> {
    await this.resolveOrFail(alias);
    return this.discoveryService.getSubdomainResourceMetadata(alias);
  }

  @Get('.well-known/oauth-authorization-server')
  async getAuthServerMetadata(@Param('alias') alias: string): Promise<any> {
    await this.resolveOrFail(alias);
    return this.discoveryService.getSubdomainAuthServerMetadata(alias);
  }

  @Get('authorize')
  async authorize(
    @Param('alias') alias: string,
    @Query() query: AuthorizeQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Subdomain authorize for alias: ${alias}`);

    const projectApiKey = await this.resolveOrFail(alias);
    const meta = await this.partnerMetaService.getAliasMeta(alias);

    const html = generateLoginPage(alias, query, meta ?? undefined, undefined, '/login');
    res.status(HttpStatus.OK).contentType('text/html').send(html);
  }

  @Post('login')
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
    this.logger.log(`Subdomain login for alias: ${alias}`);

    const projectApiKey = await this.resolveOrFail(alias);
    const meta = await this.partnerMetaService.getAliasMeta(alias);

    try {
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

      const redirectUrl = new URL(body.redirect_uri);
      redirectUrl.searchParams.set('code', authCode);
      redirectUrl.searchParams.set('state', body.state);

      this.logger.log(`Login successful, redirecting to ${redirectUrl.toString()}`);
      res.redirect(HttpStatus.FOUND, redirectUrl.toString());
    } catch (err) {
      this.logger.warn(`Login failed for ${body.email}: ${err.message}`);

      const oauthParams = {
        client_id: body.client_id,
        redirect_uri: body.redirect_uri,
        state: body.state,
        code_challenge: body.code_challenge,
        code_challenge_method: body.code_challenge_method,
        scope: body.scope,
        response_type: 'code' as const,
        resource: body.resource,
      };

      const html = generateLoginPage(
        alias,
        oauthParams,
        meta ?? undefined,
        err.message || 'Login failed',
        '/login',
      );
      res.status(HttpStatus.UNAUTHORIZED).contentType('text/html').send(html);
    }
  }

  @Options('token')
  tokenOptions(@Res() res: Response): void {
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

  @Post('token')
  async token(
    @Param('alias') alias: string,
    @Body() body: TokenRequestDto,
    @Headers() headers: Record<string, string>,
  ): Promise<TokenResponseDto> {
    this.logger.log(`Subdomain token request for alias: ${alias}, grant_type: ${body.grant_type}`);

    const projectApiKey = await this.resolveOrFail(alias);

    let clientId: string | undefined;
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const credentials = Buffer.from(authHeader.substring(6), 'base64').toString('utf-8');
        const [id] = credentials.split(':');
        clientId = id;
        this.logger.debug(`Basic Auth parsed: client_id=${clientId}`);
      } catch (error) {
        this.logger.warn(`Failed to parse Basic Auth header: ${error.message}`);
      }
    }

    if (body.grant_type === 'authorization_code') {
      if (!body.code) {
        throw new BadRequestException('code is required for authorization_code grant');
      }
      return this.oauthService.exchangeCode(
        projectApiKey,
        body.code,
        body.code_verifier,
        body.redirect_uri,
        body.resource,
      );
    }

    if (body.grant_type === 'refresh_token') {
      if (!body.refresh_token) {
        throw new BadRequestException('refresh_token is required for refresh_token grant');
      }
      return this.oauthService.refreshToken(projectApiKey, body.refresh_token, body.resource);
    }

    throw new BadRequestException('Unsupported grant_type');
  }

  @Post('register')
  async register(
    @Param('alias') alias: string,
    @Body() body?: Record<string, unknown>,
  ): Promise<any> {
    this.logger.log(`Subdomain client registration for alias: ${alias}`);
    await this.resolveOrFail(alias);

    const redirectUris =
      Array.isArray(body?.redirect_uris) &&
      body.redirect_uris.every((uri): uri is string => typeof uri === 'string')
        ? [...body.redirect_uris]
        : undefined;

    return {
      client_id: 'web-client-static',
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(redirectUris ? { redirect_uris: redirectUris } : {}),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
}
