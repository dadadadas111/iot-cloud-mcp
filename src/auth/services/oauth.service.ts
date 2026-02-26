import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IotApiService } from '../../proxy/services/iot-api.service';
import { TokenResponseDto } from '../dto/token-response.dto';
import { decodeJwt } from '../../common/utils/jwt.utils';

/**
 * OAuth 2.1 Service
 * Orchestrates OAuth flow with IoT API
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly iotApiService: IotApiService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Handle user login via IoT API
   * Forwards credentials to IoT API, registers auth code, returns code
   *
   * @param projectApiKey - Project API key
   * @param email - User email
   * @param password - User password
   * @param codeChallenge - PKCE code challenge
   * @param codeChallengeMethod - PKCE code challenge method
   * @param redirectUri - OAuth redirect URI
   * @param state - OAuth state parameter
   * @param scope - Optional scope
   * @param resource - Optional resource indicator
   * @returns Authorization code from IoT API
   */
  async handleLogin(
    projectApiKey: string,
    email: string,
    password: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    redirectUri: string,
    state: string,
    scope?: string,
    resource?: string,
  ): Promise<string> {
    this.logger.log(`Processing login for ${email} in project ${projectApiKey}`);

    try {
      // Step 1: Login to get JWT token
      const loginResult = await this.iotApiService.login(projectApiKey, email, password);
      
      // Step 2: Decode JWT to get userId (Firebase uses 'user_id' in their custom tokens)
      const decoded = decodeJwt(loginResult.access_token);
      const userId = String(decoded.user_id || decoded.sub || '');
      
      if (!userId) {
        throw new Error('JWT token does not contain user_id or sub claim');
      }

      // Step 3: Register auth code with IoT API
      const authCodeResult = await this.iotApiService.registerAuthCode(projectApiKey, userId);

      this.logger.log(`Login successful for ${email}, auth code generated`);
      return authCodeResult.code;
    } catch (error) {
      this.logger.error(`Login failed for ${email}: ${error.message}`);
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  /**
   * Exchange authorization code for access token
   * Calls IoT API exchangeAuthCode endpoint
   *
   * @param projectApiKey - Project API key
   * @param code - Authorization code from handleLogin
   * @param codeVerifier - PKCE code verifier
   * @param redirectUri - Redirect URI (must match authorize request)
   * @param resource - Optional resource indicator
   * @returns OAuth token response with JWT
   */
  async exchangeCode(
    projectApiKey: string,
    code: string,
    codeVerifier?: string | undefined,
    redirectUri?: string | undefined,
    resource?: string,
  ): Promise<TokenResponseDto> {
    this.logger.log(`Exchanging code for project ${projectApiKey}`);

    try {
      // Exchange code with IoT API (no redirect_uri needed)
      const result = await this.iotApiService.exchangeAuthCode(projectApiKey, code);

      this.logger.log('Code exchange successful, returning tokens');

      // Convert expires_in to number if it's a string
      const expiresIn = typeof result.expires_in === 'string' ? parseInt(result.expires_in, 10) : result.expires_in;

      // Wrap JWT in OAuth token response
      return TokenResponseDto.fromJwt(
        result.access_token,
        expiresIn || 3600,
        result.refresh_token,
      );
    } catch (error) {
      this.logger.error(`Code exchange failed: ${error.message}`);
      throw new UnauthorizedException('Invalid authorization code');
    }
  }

  /**
   * Refresh access token using refresh token
   * Calls IoT API refreshToken endpoint
   *
   * @param projectApiKey - Project API key
   * @param refreshToken - Refresh token JWT
   * @param resource - Optional resource indicator
   * @returns OAuth token response with new JWT
   */
  async refreshToken(
    projectApiKey: string,
    refreshToken: string,
    resource?: string,
  ): Promise<TokenResponseDto> {
    this.logger.log(`Refreshing token for project ${projectApiKey}`);

    try {
      // Refresh token with IoT API
      const result = await this.iotApiService.refreshToken(projectApiKey, refreshToken);

      this.logger.log('Token refresh successful');

      // Convert expires_in to number if it's a string
      const expiresIn = typeof result.expires_in === 'string' ? parseInt(result.expires_in, 10) : result.expires_in;

      // Wrap new JWT in OAuth token response
      return TokenResponseDto.fromJwt(
        result.access_token,
        expiresIn || 3600,
        result.refresh_token,
      );
    } catch (error) {
      this.logger.error(`Token refresh failed: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Generate authorization server base URL
   * @param projectApiKey - Project API key
   * @returns Base URL for authorization endpoints
   */
  getAuthServerUrl(projectApiKey: string): string {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    return `${baseUrl}/auth/${projectApiKey}`;
  }
}
