/**
 * Old API Service
 * Handles HTTP calls to the Old API Server
 * Project API key is provided per-request via URL parameter (:projectApiKey), NOT from environment config
 * This enables multi-tenant isolation where each request specifies its own project API key
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { logProxyCall } from '../../common/utils/logger.utils';
import {
  OldApiLoginResponse,
  OldApiTokenResponse,
  OldApiUserResponse,
  OldApiAuthCodeResponse,
} from '../dto/old-api-response.dto';

/**
 * Service for interacting with the Old API Server
 * Manages authentication flow and user data retrieval
 */
@Injectable()
export class OldApiService {
  private baseUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('IOT_API_BASE_URL') || 'https://api.example.com';
  }

  /**
   * Get authorization headers with project API key
   * @param projectApiKey - Project API key from request URL parameter (:projectApiKey)
   */
  private getHeaders(projectApiKey: string) {
    return {
  'x-header-apikey': projectApiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * User login endpoint (/iot-core/authen/login)
   * Returns Firebase JWT token for authenticated requests
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param email - User email address
   * @param password - User password
   * @returns Login response with JWT token
   */
  async login(
    projectApiKey: string,
    email: string,
    password: string,
  ): Promise<OldApiLoginResponse> {
    try {
      logProxyCall('Initiating login', { email });

      const endpoint = `${this.baseUrl}/iot-core/authen/login`;

      const response = await firstValueFrom(
        this.httpService.post<OldApiLoginResponse>(
          endpoint,
          { email, password },
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Login successful', { email });
      return response.data;
    } catch (error) {
      logProxyCall('Login failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Register authorization code for user (/iot-core/authen/auth_code/{userId})
   * Generates auth code that can be exchanged for tokens
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - Firebase user ID from JWT token
   * @returns Authorization code response
   */
  async registerAuthCode(
    projectApiKey: string,
    userId: string,
  ): Promise<OldApiAuthCodeResponse> {
    try {
      logProxyCall('Registering auth code', { userId });

      const endpoint = `${this.baseUrl}/iot-core/authen/auth_code/${userId}`;

      const response = await firstValueFrom(
        this.httpService.post<OldApiAuthCodeResponse>(
          endpoint,
          {},
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Auth code registered successfully', { userId });
      return response.data;
    } catch (error) {
      logProxyCall('Auth code registration failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens (/iot-core/authen/token/accesstoken)
   * Used in OAuth2 authorization code flow
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param code - Authorization code from registerAuthCode()
   * @returns Token response with access and refresh tokens
   */
  async exchangeAuthCode(
    projectApiKey: string,
    code: string,
  ): Promise<OldApiTokenResponse> {
    try {
      logProxyCall('Exchanging auth code for tokens', { code });

      const endpoint = `${this.baseUrl}/iot-core/authen/token/accesstoken`;

      const response = await firstValueFrom(
        this.httpService.post<OldApiTokenResponse>(
          endpoint,
          { grant_type: 'authorization_code', code },
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Auth code exchange successful');
      return response.data;
    } catch (error) {
      logProxyCall('Auth code exchange failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token (/iot-core/authen/token/accesstoken)
   * Uses refresh_token grant type
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param refreshToken - Refresh token from previous authentication
   * @returns New token response with fresh access token
   */
  async refreshToken(projectApiKey: string, refreshToken: string): Promise<OldApiTokenResponse> {
    try {
      logProxyCall('Refreshing access token');

      const endpoint = `${this.baseUrl}/iot-core/authen/token/accesstoken`;

      const response = await firstValueFrom(
        this.httpService.post<OldApiTokenResponse>(
          endpoint,
          { grant_type: 'refresh_token', refresh_token: refreshToken },
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Token refresh successful');
      return response.data;
    } catch (error) {
      logProxyCall('Token refresh failed', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Fetch authenticated user data (/iot-core/user/{userId})
   * Extracts userId from JWT token
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @returns User data response
   */
  async fetchUser(projectApiKey: string, userId: string): Promise<OldApiUserResponse> {
    try {
      logProxyCall('Fetching user data', { userId });

      const endpoint = `${this.baseUrl}/iot-core/user/${userId}`;

      const response = await firstValueFrom(
        this.httpService.get<OldApiUserResponse>(endpoint, { headers: this.getHeaders(projectApiKey) }),
      );

      logProxyCall('User data fetched successfully', { userId });
      return response.data;
    } catch (error) {
      logProxyCall('User data fetch failed', { error: (error as Error).message });
      throw error;
    }
  }
}
