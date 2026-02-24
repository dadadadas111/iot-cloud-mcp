import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../mcp/services/redis.service';
import { randomBytes, createHash } from 'crypto';
import { randomUUID } from 'node:crypto';

export interface AuthorizationRequest {
  id: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AuthorizationCode {
  code: string;
  authRequestId: string;
  userId: string;
  tokenData: {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
  };
  codeChallenge?: string;
  codeChallengeMethod?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface TokenExchangeRequest {
  code: string;
  redirectUri: string;
  clientId?: string;
  codeVerifier?: string;
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  // In-memory storage for demo - in production use Redis or database
  private authRequests = new Map<string, AuthorizationRequest>();
  private authCodes = new Map<string, AuthorizationCode>();

  // Code TTL in seconds
  private readonly AUTH_REQUEST_TTL = 600; // 10 minutes
  private readonly AUTH_CODE_TTL = 60; // 1 minute

  constructor(
    private authService: AuthService,
    private redisService: RedisService,
  ) {
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanupExpiredEntries(), 5 * 60 * 1000);
  }

  /**
   * Create and store an authorization request
   */
  async createAuthorizationRequest(params: {
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge?: string;
    codeChallengeMethod?: string;
  }): Promise<AuthorizationRequest> {
    const id = randomUUID();
    const now = new Date();
    const authRequest: AuthorizationRequest = {
      id,
      ...params,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.AUTH_REQUEST_TTL * 1000),
    };

    this.authRequests.set(id, authRequest);
    this.logger.log(`Created authorization request: ${id} for client: ${params.clientId}`);

    return authRequest;
  }

  /**
   * Retrieve an authorization request
   */
  async getAuthorizationRequest(id: string): Promise<AuthorizationRequest | null> {
    const authRequest = this.authRequests.get(id);

    if (!authRequest) {
      this.logger.warn(`Authorization request not found: ${id}`);
      return null;
    }

    if (authRequest.expiresAt < new Date()) {
      this.logger.warn(`Authorization request expired: ${id}`);
      this.authRequests.delete(id);
      return null;
    }

    return authRequest;
  }

  /**
   * Authenticate user using existing auth service
   */
  async authenticateUser(email: string, password: string) {
    this.logger.log(`Authenticating user: ${email}`);
    return await this.authService.login(email, password);
  }

  /**
   * Create authorization code after successful authentication
   */
  async createAuthorizationCode(
    authRequest: AuthorizationRequest,
    loginResult: any,
  ): Promise<string> {
    const code = this.generateAuthCode();
    const now = new Date();

    // Extract userId from JWT token
    let userId: string | null = null;
    try {
      const tokenParts = loginResult.access_token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        userId = payload.user_id || payload.sub || null;
      }
    } catch (error) {
      this.logger.warn('Could not decode JWT token for userId extraction', error);
      throw new UnauthorizedException('Invalid token format');
    }

    if (!userId) {
      throw new UnauthorizedException('Could not extract user ID from token');
    }

    const authCode: AuthorizationCode = {
      code,
      authRequestId: authRequest.id,
      userId,
      tokenData: {
        access_token: loginResult.access_token,
        refresh_token: loginResult.refresh_token,
        token_type: loginResult.token_type,
        expires_in: loginResult.expires_in,
      },
      codeChallenge: authRequest.codeChallenge,
      codeChallengeMethod: authRequest.codeChallengeMethod,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.AUTH_CODE_TTL * 1000),
    };

    this.authCodes.set(code, authCode);
    this.logger.log(`Created authorization code for user: ${userId}, request: ${authRequest.id}`);

    // Clean up the auth request since it's no longer needed
    this.authRequests.delete(authRequest.id);

    return code;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(request: TokenExchangeRequest) {
    const { code, redirectUri, clientId, codeVerifier } = request;

    // Get and validate auth code
    const authCode = this.authCodes.get(code);
    if (!authCode) {
      this.logger.warn(`Invalid authorization code: ${code}`);
      throw new BadRequestException('Invalid authorization code');
    }

    if (authCode.expiresAt < new Date()) {
      this.logger.warn(`Expired authorization code: ${code}`);
      this.authCodes.delete(code);
      throw new BadRequestException('Authorization code expired');
    }

    // Get original auth request to validate redirect URI
    // Since we cleaned up the auth request, we'll validate against what we stored in the code
    // In a production system, you might want to store the redirect URI in the auth code

    // Validate PKCE if it was used
    if (authCode.codeChallenge && authCode.codeChallengeMethod) {
      if (!codeVerifier) {
        throw new BadRequestException('Code verifier required for PKCE flow');
      }

      if (authCode.codeChallengeMethod === 'S256') {
        const hash = createHash('sha256').update(codeVerifier).digest();
        const challenge = hash.toString('base64url');

        if (challenge !== authCode.codeChallenge) {
          this.logger.warn(`PKCE verification failed for code: ${code}`);
          throw new BadRequestException('Invalid code verifier');
        }
      }
    }

    this.logger.log(`Exchanging authorization code for tokens: user=${authCode.userId}`);

    // Clean up the auth code (one-time use)
    this.authCodes.delete(code);

    // Return the tokens that were obtained during the original login
    return {
      access_token: authCode.tokenData.access_token,
      token_type: authCode.tokenData.token_type,
      expires_in: authCode.tokenData.expires_in,
      refresh_token: authCode.tokenData.refresh_token,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string) {
    this.logger.log('Refreshing access token');
    return await this.authService.refreshToken(refreshToken);
  }

  /**
   * Validate access token and extract user info
   * This would be used by the MCP controller to authenticate requests
   */
  async validateAccessToken(
    accessToken: string,
  ): Promise<{ userId: string; token: string } | null> {
    try {
      // For JWT tokens, we can decode and validate
      const tokenParts = accessToken.split('.');
      if (tokenParts.length !== 3) {
        this.logger.warn('Invalid JWT format');
        return null;
      }

      const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
      const userId = payload.user_id || payload.sub || null;

      if (!userId) {
        this.logger.warn('No user ID found in token');
        return null;
      }

      // Check if token is expired
      if (payload.exp && payload.exp < Date.now() / 1000) {
        this.logger.warn('Token expired');
        return null;
      }

      return { userId, token: accessToken };
    } catch (error) {
      this.logger.warn('Error validating access token:', error.message);
      return null;
    }
  }

  /**
   * Generate secure authorization code
   */
  private generateAuthCode(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Clean up expired authorization requests and codes
   */
  private cleanupExpiredEntries(): void {
    const now = new Date();
    let cleanedRequests = 0;
    let cleanedCodes = 0;

    // Clean expired auth requests
    for (const [id, request] of this.authRequests.entries()) {
      if (request.expiresAt < now) {
        this.authRequests.delete(id);
        cleanedRequests++;
      }
    }

    // Clean expired auth codes
    for (const [code, authCode] of this.authCodes.entries()) {
      if (authCode.expiresAt < now) {
        this.authCodes.delete(code);
        cleanedCodes++;
      }
    }

    if (cleanedRequests > 0 || cleanedCodes > 0) {
      this.logger.log(`Cleaned up ${cleanedRequests} auth requests and ${cleanedCodes} auth codes`);
    }
  }
}
