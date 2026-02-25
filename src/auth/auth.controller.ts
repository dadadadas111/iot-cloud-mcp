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
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { OAuthService } from './services/oauth.service';
import { DiscoveryService } from './services/discovery.service';
import { AuthorizeQueryDto } from './dto/authorize.dto';
import { TokenRequestDto } from './dto/token-request.dto';
import { TokenResponseDto } from './dto/token-response.dto';
import { generateLoginPage } from './templates/login-page.template';

/**
 * OAuth 2.1 Authorization Controller
 * Implements OAuth 2.1 authorization flow endpoints
 */
@ApiTags('OAuth')
@Controller('auth/:projectApiKey')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly oauthService: OAuthService,
    private readonly discoveryService: DiscoveryService,
  ) {}

  /**
   * OAuth 2.1 Authorization Endpoint
   * Renders login page with OAuth parameters
   */
  @Get('authorize')
  @ApiOperation({ summary: 'OAuth 2.1 authorization endpoint' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  @ApiResponse({ status: 200, description: 'Login page rendered' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async authorize(
    @Param('projectApiKey') projectApiKey: string,
    @Query() query: AuthorizeQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`Authorization request for project ${projectApiKey}`);

    // Generate and return login page
    const html = generateLoginPage(projectApiKey, query);
    res.status(HttpStatus.OK).contentType('text/html').send(html);
  }

  /**
   * OAuth Login Form Handler
   * Processes login form submission and redirects with authorization code
   */
  @Post('login')
  @ApiOperation({ summary: 'Process login form and generate authorization code' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  @ApiResponse({ status: 302, description: 'Redirect to callback with code' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Param('projectApiKey') projectApiKey: string,
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
    this.logger.log(`Login attempt for ${body.email} in project ${projectApiKey}`);

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
  }

  /**
   * CORS Preflight Handler for Token Endpoint
   * Explicitly handles OPTIONS requests for token endpoint
   */
  @Options('token')
  @ApiOperation({ summary: 'CORS preflight for token endpoint' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  tokenOptions(@Res() res: Response): void {
    this.logger.log('CORS preflight request received for token endpoint');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, x-admin-api-key, x-project-api-key, mcp-protocol-version');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400');
    res.status(HttpStatus.NO_CONTENT).send();
  }
  /**
   * OAuth 2.1 Token Endpoint
   * Exchanges authorization code or refresh token for access token
   */
  @Post('token')
  @ApiOperation({ summary: 'OAuth 2.1 token endpoint' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  @ApiResponse({ status: 200, description: 'Token issued', type: TokenResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Invalid code or refresh token' })
  async token(
    @Param('projectApiKey') projectApiKey: string,
    @Body() body: TokenRequestDto,
    @Headers() headers: Record<string, string>,
  ): Promise<TokenResponseDto> {
    this.logger.log(`Token request for project ${projectApiKey}, grant_type: ${body.grant_type}`);
    this.logger.log(`Token request headers: ${JSON.stringify({
      authorization: headers.authorization || headers.Authorization || 'MISSING',
      'content-type': headers['content-type'],
      origin: headers.origin,
    })}`);
    this.logger.log(`Token request body: ${JSON.stringify(body)}`);

    // Parse Basic Auth header if present (ChatGPT MCP client pattern)
    let clientId: string | undefined;
    let clientSecret: string | undefined;
    const authHeader = headers.authorization || headers.Authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      try {
        const base64Credentials = authHeader.substring(6);
        const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
        const [id, secret] = credentials.split(':');
        clientId = id;
        clientSecret = secret;
        this.logger.log(`Basic Auth parsed: client_id=${clientId}`);
      } catch (error) {
        this.logger.warn(`Failed to parse Basic Auth header: ${error.message}`);
      }
    }

    // Handle authorization_code grant
    if (body.grant_type === 'authorization_code') {
      if (!body.code || !body.code_verifier || !body.redirect_uri) {
        throw new BadRequestException(
          'code, code_verifier, and redirect_uri are required for authorization_code grant',
        );
      }

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
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  @ApiResponse({ status: 200, description: 'Client registered' })
  async register(@Param('projectApiKey') projectApiKey: string): Promise<any> {
    this.logger.log(`Client registration request for project ${projectApiKey}`);

    // Return static client_id (PoC)
    return {
      client_id: 'web-client-static',
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  /**
   * Authorization Server Metadata (RFC 8414)
   */
  @Get('.well-known/oauth-authorization-server')
  @ApiOperation({ summary: 'OAuth 2.1 authorization server metadata' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  @ApiResponse({ status: 200, description: 'Server metadata' })
  getAuthServerMetadata(@Param('projectApiKey') projectApiKey: string): any {
    this.logger.log(`Metadata request for project ${projectApiKey}`);
    return this.discoveryService.getAuthorizationServerMetadata(projectApiKey);
  }

  /**
   * Protected Resource Metadata (RFC 8707)
   */
  @Get('.well-known/oauth-protected-resource')
  @ApiOperation({ summary: 'OAuth 2.1 protected resource metadata' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key' })
  @ApiResponse({ status: 200, description: 'Resource metadata' })
  getResourceMetadata(@Param('projectApiKey') projectApiKey: string): any {
    this.logger.log(`Resource metadata request for project ${projectApiKey}`);
    return this.discoveryService.getProtectedResourceMetadata(projectApiKey);
  }
}
