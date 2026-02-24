import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Res,
  Req,
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
}

@ApiTags('OAuth2')
@Controller()
export class OAuthController {
  constructor(
    private oauthService: OAuthService,
    private configService: ConfigService,
  ) {}

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

    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['iot:read', 'iot:write', 'iot:control'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    };
  }

  @Get('oauth/authorize')
  @ApiOperation({
    summary: 'OAuth2 Authorization Endpoint',
    description:
      'Initiates OAuth2 authorization flow. Redirects to login UI or directly to callback with auth code.',
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
  @ApiResponse({ status: 302, description: 'Redirect to login UI or callback with auth code' })
  async authorize(
    @Query('response_type') responseType: string,
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Res() res: Response,
    @Query('state') state?: string,
    @Query('code_challenge') codeChallenge?: string,
    @Query('code_challenge_method') codeChallengeMethod?: string,
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
    });

    // Redirect to login UI with auth request ID
    const baseUrl = this.getBaseUrl();
    const loginUrl = `${baseUrl}/oauth/login?auth_request_id=${authRequest.id}`;

    res.redirect(loginUrl);
  }

  @Get('oauth/login')
  @ApiOperation({
    summary: 'OAuth2 Login UI',
    description: 'Displays login form for OAuth2 authorization flow',
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

  @Post('oauth/login')
  @HttpCode(HttpStatus.FOUND) // 302 redirect
  @ApiOperation({
    summary: 'Process OAuth2 Login',
    description: 'Handles login form submission and redirects with authorization code',
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
      const errorUrl = `${baseUrl}/oauth/login?auth_request_id=${authRequestId}&error=${encodeURIComponent(error.message)}`;
      res.redirect(errorUrl);
    }
  }

  @Post('oauth/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'OAuth2 Token Endpoint',
    description: 'Exchanges authorization code for access tokens or refreshes tokens',
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

  private getBaseUrl(): string {
    const host = this.configService.get<string>('HOST') || 'localhost';
    const port = this.configService.get<number>('PORT') || 3001;
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const isStaging = this.configService.get<string>('NODE_ENV') === 'staging';

    if (isProduction || isStaging) {
      // In production, use configured base URL or construct from host/port
      return this.configService.get<string>('BASE_URL') || `https://${host}`;
    }

    return `http://${host}:${port}`;
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
        
        <form method="POST" action="/oauth/login">
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
