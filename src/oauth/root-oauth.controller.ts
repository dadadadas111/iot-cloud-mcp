import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from './oauth.service';
import { randomUUID } from 'crypto';

class TokenRequestDto {
  @ApiProperty({ description: 'Grant type', example: 'authorization_code' })
  @IsString()
  grant_type: string;

  @ApiProperty({ description: 'Authorization code from authorize endpoint' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({ description: 'Redirect URI used in authorize request' })
  @IsString()
  @IsOptional()
  redirect_uri?: string;

  @ApiProperty({ description: 'Client ID' })
  @IsString()
  @IsOptional()
  client_id?: string;

  @ApiProperty({ description: 'Code verifier for PKCE' })
  @IsString()
  @IsOptional()
  code_verifier?: string;

  @ApiProperty({ description: 'Refresh token for refresh_token grant' })
  @IsString()
  @IsOptional()
  refresh_token?: string;

  @ApiProperty({ description: 'Resource indicator (RFC 8707)' })
  @IsString()
  @IsOptional()
  resource?: string;
}

class ClientRegistrationDto {
  @ApiProperty({ description: 'Client redirect URIs', type: [String], required: false })
  @IsOptional()
  redirect_uris?: string[];

  @ApiProperty({ description: 'Token endpoint auth method', example: 'none', required: false })
  @IsString()
  @IsOptional()
  token_endpoint_auth_method?: string;

  @ApiProperty({ description: 'Grant types', type: [String], required: false })
  @IsOptional()
  grant_types?: string[];

  @ApiProperty({ description: 'Response types', type: [String], required: false })
  @IsOptional()
  response_types?: string[];

  @ApiProperty({ description: 'Client name', required: false })
  @IsString()
  @IsOptional()
  client_name?: string;

  @ApiProperty({ description: 'Application type', example: 'web', required: false })
  @IsString()
  @IsOptional()
  application_type?: string;
}

@ApiTags('OAuth2 Root Endpoints')
@Controller() // No prefix - serves at root level
export class RootOAuthController {
  constructor(
    private oauthService: OAuthService,
    private configService: ConfigService,
  ) { }

  @Get('.well-known/oauth-authorization-server')
  @ApiOperation({
    summary: 'OAuth2 Discovery Endpoint',
    description: 'Returns OAuth2 server metadata for automatic client configuration',
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth2 server metadata',
    schema: {
      type: 'object',
      properties: {
        issuer: { type: 'string' },
        authorization_endpoint: { type: 'string' },
        token_endpoint: { type: 'string' },
        response_types_supported: { type: 'array', items: { type: 'string' } },
        grant_types_supported: { type: 'array', items: { type: 'string' } },
        code_challenge_methods_supported: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  getDiscoveryDocument() {
    const baseUrl = this.getBaseUrl();
    const rootUrl = baseUrl.replace(/\/api$/, '');
    // Return root-level endpoints for ChatGPT compatibility

    return {
      issuer: rootUrl,
      authorization_endpoint: `${rootUrl}/authorize`,
      token_endpoint: `${rootUrl}/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['iot:read', 'iot:write', 'iot:control'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      registration_endpoint: `${rootUrl}/register`,
    };
  }

  @Get('.well-known/oauth-protected-resource')
  @ApiOperation({
    summary: 'MCP Protected Resource Metadata (RFC 9728)',
    description: 'Returns MCP resource server metadata with authorization servers for MCP clients',
  })
  @ApiResponse({
    status: 200,
    description: 'MCP resource metadata',
    schema: {
      type: 'object',
      properties: {
        resource: { type: 'string' },
        authorization_servers: { type: 'array', items: { type: 'string' } },
        scopes_supported: { type: 'array', items: { type: 'string' } },
        resource_documentation: { type: 'string' },
      },
    },
  })
  getMcpResourceMetadata() {
    const baseUrl = this.getBaseUrl();
    const rootUrl = baseUrl.replace(/\/api$/, '');
    // Return root domain as authorization server for ChatGPT compatibility

    return {
      resource: baseUrl,
      authorization_servers: [rootUrl],
      scopes_supported: ['iot:read', 'iot:write', 'iot:control'],
      resource_documentation: `${baseUrl}/docs`,
    };
  }

  @Get('authorize')
  @ApiOperation({
    summary: 'OAuth2 Authorization Endpoint (Root Level)',
    description:
      'Root-level OAuth2 authorization endpoint for ChatGPT compatibility. Identical logic to /api/oauth/authorize.',
  })
  @ApiQuery({
    name: 'response_type',
    description: 'Response type (must be "code")',
    example: 'code',
  })
  @ApiQuery({ name: 'client_id', description: 'Client identifier', example: 'claude-mcp' })
  @ApiQuery({
    name: 'redirect_uri',
    description: 'Callback URI',
    example: 'https://claude.ai/oauth/callback',
  })
  @ApiQuery({ name: 'state', description: 'Client state for CSRF protection', required: false })
  @ApiQuery({ name: 'code_challenge', description: 'PKCE code challenge', required: false })
  @ApiQuery({
    name: 'code_challenge_method',
    description: 'PKCE challenge method',
    required: false,
    example: 'S256',
  })
  @ApiQuery({ name: 'resource', description: 'Resource indicator (RFC 8707)', required: false })
  @ApiQuery({ name: 'api_key', description: 'IoT API key for authentication', required: false })
  @ApiResponse({ status: 302, description: 'Redirect to login UI or callback with auth code' })
  async authorize(
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
    @Query('state') state?: string,
    @Query('code_challenge') codeChallenge?: string,
    @Query('code_challenge_method') codeChallengeMethod?: string,
    @Query('resource') resource?: string,
    @Query('api_key') apiKey?: string,
  ) {
    // Validate required parameters
    if (responseType !== 'code') {
      throw new BadRequestException('Unsupported response_type. Must be "code".');
    }

    if (!clientId || !redirectUri) {
      throw new BadRequestException('Missing required parameters: client_id and redirect_uri');
    }

    // Validate PKCE if provided
    if (codeChallenge && codeChallengeMethod !== 'S256') {
      throw new BadRequestException(
        'Unsupported code_challenge_method. Must be "S256" if provided.',
      );
    }

    // Store authorization request parameters
    const authRequest = await this.oauthService.createAuthorizationRequest({
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
      resource, // Include resource parameter
      apiKey, // Include API key parameter
    });

    // Redirect to login UI with auth request ID
    const baseUrl = this.getBaseUrl();
    const loginUrl = `${baseUrl}/login?auth_request_id=${authRequest.id}`;

    res.redirect(loginUrl);
  }

  @Get('login')
  @ApiOperation({
    summary: 'OAuth2 Login UI (Root Level)',
    description: 'Root-level login form for OAuth2 authorization flow',
  })
  @ApiQuery({
    name: 'auth_request_id',
    description: 'Authorization request ID from authorize endpoint',
  })
  async loginForm(@Query('auth_request_id') authRequestId: string, @Res() res: Response) {
    if (!authRequestId) {
      throw new BadRequestException('Missing auth_request_id parameter');
    }

    // Verify auth request exists
    const authRequest = await this.oauthService.getAuthorizationRequest(authRequestId);
    if (!authRequest) {
      throw new BadRequestException('Invalid or expired authorization request');
    }

    // Return simple HTML login form
    const html = this.generateLoginHTML(authRequestId);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  @Post('login')
  @HttpCode(HttpStatus.FOUND) // 302 redirect
  @ApiOperation({
    summary: 'Process OAuth2 Login (Root Level)',
    description: 'Root-level login form submission handler',
  })
  async processLogin(
    @Body('auth_request_id') authRequestId: string,
    @Body('email') email: string,
    @Body('password') password: string,
    @Res() res: Response,
  ) {
    if (!authRequestId || !email || !password) {
      throw new BadRequestException('Missing required fields');
    }

    try {
      // Get the authorization request
      const authRequest = await this.oauthService.getAuthorizationRequest(authRequestId);
      if (!authRequest) {
        throw new BadRequestException('Invalid or expired authorization request');
      }

      // Authenticate user with existing auth service
      const loginResult = await this.oauthService.authenticateUser(email, password);

      // Generate authorization code
      const authCode = await this.oauthService.createAuthorizationCode(authRequest, loginResult);

      // Build callback URL with auth code
      let callbackUrl = `${authRequest.redirectUri}?code=${authCode}`;
      if (authRequest.state) {
        callbackUrl += `&state=${encodeURIComponent(authRequest.state)}`;
      }

      // Redirect to client callback
      res.redirect(callbackUrl);
    } catch (error) {
      // Redirect back to login form with error
      const baseUrl = this.getBaseUrl();
      const errorUrl = `${baseUrl}/login?auth_request_id=${authRequestId}&error=${encodeURIComponent(error.message)}`;
      res.redirect(errorUrl);
    }
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'OAuth2 Token Endpoint (Root Level)',
    description:
      'Root-level token endpoint for ChatGPT compatibility. Identical logic to /api/oauth/token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token response',
    schema: {
      type: 'object',
      properties: {
        access_token: { type: 'string' },
        token_type: { type: 'string', example: 'Bearer' },
        expires_in: { type: 'number' },
        refresh_token: { type: 'string' },
      },
    },
  })
  async token(@Body() tokenRequest: TokenRequestDto) {
    const { grant_type } = tokenRequest;

    if (grant_type === 'authorization_code') {
      const { code, redirect_uri, client_id, code_verifier } = tokenRequest;

      if (!code || !redirect_uri) {
        throw new BadRequestException('Missing required parameters for authorization_code grant');
      }

      return await this.oauthService.exchangeCodeForTokens({
        code,
        redirectUri: redirect_uri,
        clientId: client_id,
        codeVerifier: code_verifier,
        resource: tokenRequest.resource, // Include resource parameter
      });
    } else if (grant_type === 'refresh_token') {
      const { refresh_token } = tokenRequest;

      if (!refresh_token) {
        throw new BadRequestException('Missing refresh_token parameter');
      }

      return await this.oauthService.refreshAccessToken(refresh_token);
    } else {
      throw new BadRequestException(`Unsupported grant_type: ${grant_type}`);
    }
  }

  @Post('oauth/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'OAuth2 Dynamic Client Registration (RFC 7591)',
    description: 'Registers a new OAuth2 client dynamically for MCP integration',
  })
  @ApiResponse({
    status: 201,
    description: 'Client registration response',
    schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        client_id_issued_at: { type: 'number' },
        redirect_uris: { type: 'array', items: { type: 'string' } },
        token_endpoint_auth_method: { type: 'string' },
        grant_types: { type: 'array', items: { type: 'string' } },
        response_types: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async registerClient(
    @Body() clientMetadata: ClientRegistrationDto,
    @Headers('authorization') authHeader?: string,
  ) {
    // Generate unique client ID
    const clientId = randomUUID();

    // For MCP clients, we typically use 'none' auth method
    const authMethod = clientMetadata.token_endpoint_auth_method || 'none';

    // Store client metadata (for now, just in memory - extend with database later)
    await this.oauthService.storeClientMetadata(clientId, {
      ...clientMetadata,
      token_endpoint_auth_method: authMethod,
      created_at: new Date(),
    });

    // Return RFC 7591 compliant registration response
    const response: any = {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: clientMetadata.redirect_uris || [],
      token_endpoint_auth_method: authMethod,
      grant_types: clientMetadata.grant_types || ['authorization_code', 'refresh_token'],
      response_types: clientMetadata.response_types || ['code'],
    };

    if (clientMetadata.client_name) {
      response.client_name = clientMetadata.client_name;
    }

    if (clientMetadata.application_type) {
      response.application_type = clientMetadata.application_type;
    }

    return response;
  }

  private getBaseUrl(): string {
    // Return the ROOT base URL (no /api prefix) for root-level endpoints
    const configBaseUrl = this.configService.get<string>('BASE_URL');
    if (configBaseUrl) {
      // Remove /api suffix if present to get root domain
      return configBaseUrl.replace(/\/api$/, '');
    }
    // Fallback for staging - root domain only
    return 'https://mcp-stag.dash.id.vn';
  }

  private generateLoginHTML(authRequestId: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IoT Cloud - Login</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 2rem;
            font-size: 0.9rem;
        }
        .form-group {
            margin-bottom: 1rem;
        }
        label {
            display: block;
            margin-bottom: 0.25rem;
            color: #555;
            font-weight: 500;
        }
        input[type="email"], input[type="password"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
            box-sizing: border-box;
        }
        input[type="email"]:focus, input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }
        .submit-btn {
            width: 100%;
            background: #667eea;
            color: white;
            padding: 0.75rem;
            border: none;
            border-radius: 4px;
            font-size: 1rem;
            cursor: pointer;
            margin-top: 1rem;
        }
        .submit-btn:hover {
            background: #5a6fd8;
        }
        .error {
            background: #fee;
            border: 1px solid #fcc;
            color: #c33;
            padding: 0.75rem;
            border-radius: 4px;
            margin-bottom: 1rem;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>IoT Cloud Login</h1>
        <p class="subtitle">Sign in to authorize access to your IoT devices</p>
        
        <form method="POST" action="/login">
            <input type="hidden" name="auth_request_id" value="${authRequestId}" />
            
            <div class="form-group">
                <label for="email">Email Address</label>
                <input type="email" id="email" name="email" required />
            </div>
            
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" name="password" required />
            </div>
            
            <button type="submit" class="submit-btn">Sign In</button>
        </form>
    </div>
</body>
</html>
    `;
  }
}
