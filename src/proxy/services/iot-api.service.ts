/**
 * IoT API Service
 * Handles HTTP calls to the IoT API Server
 * Project API key is provided per-request via URL parameter (:projectApiKey), NOT from environment config
 * This enables multi-tenant isolation where each request specifies its own project API key
 */

import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { logProxyCall } from '../../common/utils/logger.utils';
import {
  IotApiLoginResponse,
  IotApiTokenResponse,
  IotApiUserResponse,
  IotApiAuthCodeResponse,
} from '../dto/iot-api-response.dto';

/**
 * Service for interacting with the IoT API Server
 * Manages authentication flow and user data retrieval
 */
@Injectable()
export class IotApiService {
  private baseUrl: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('IOT_API_BASE_URL') || 'https://staging.openapi.rogo.com.vn/api/v2.0';
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
  ): Promise<IotApiLoginResponse> {
    try {
      logProxyCall('Initiating login', { email });

      const endpoint = `${this.baseUrl}/iot-core/authen/login`;

      const response = await firstValueFrom(
        this.httpService.post<IotApiLoginResponse>(
          endpoint,
          { email, password },
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Login successful', { email });
      return response.data;
    } catch (error) {
      this.logDetailedError('Login', error);
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
  async registerAuthCode(projectApiKey: string, userId: string): Promise<IotApiAuthCodeResponse> {
    try {
      logProxyCall('Registering auth code', { userId });

      const endpoint = `${this.baseUrl}/iot-core/authen/auth_code/${userId}`;

      const response = await firstValueFrom(
        this.httpService.post<IotApiAuthCodeResponse>(
          endpoint,
          {},
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Auth code registered successfully', { userId });
      return response.data;
    } catch (error) {
      this.logDetailedError('Register auth code', error);
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
  async exchangeAuthCode(projectApiKey: string, code: string): Promise<IotApiTokenResponse> {
    try {
      logProxyCall('Exchanging auth code for tokens', { code });

      const endpoint = `${this.baseUrl}/iot-core/authen/token/accesstoken`;

      const response = await firstValueFrom(
        this.httpService.post<IotApiTokenResponse>(
          endpoint,
          { grant_type: 'authorization_code', code },
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Auth code exchange successful');
      return response.data;
    } catch (error) {
      this.logDetailedError('Exchange auth code', error);
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
  async refreshToken(projectApiKey: string, refreshToken: string): Promise<IotApiTokenResponse> {
    try {
      logProxyCall('Refreshing access token');

      const endpoint = `${this.baseUrl}/iot-core/authen/token/accesstoken`;

      const response = await firstValueFrom(
        this.httpService.post<IotApiTokenResponse>(
          endpoint,
          { grant_type: 'refresh_token', refresh_token: refreshToken },
          { headers: this.getHeaders(projectApiKey) },
        ),
      );

      logProxyCall('Token refresh successful');
      return response.data;
    } catch (error) {
      this.logDetailedError('Refresh token', error);
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
  async fetchUser(projectApiKey: string, userId: string): Promise<IotApiUserResponse> {
    try {
      logProxyCall('Fetching user data', { userId });

      const endpoint = `${this.baseUrl}/iot-core/user/${userId}`;

      const response = await firstValueFrom(
        this.httpService.get<IotApiUserResponse>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('User data fetched successfully', { userId });
      return response.data;
    } catch (error) {
      this.logDetailedError('Fetch user data', error);
      throw error;
    }
  }

  /**
   * List all devices (/iot-core/device/{userId})
   * Optional locationId filter via query parameter
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @param locationId - Optional location ID filter
   * @returns Array of devices
   */
  async listDevices(projectApiKey: string, userId: string, locationId?: string): Promise<any[]> {
    try {
      logProxyCall('Listing devices', { userId, locationId });

      const params = locationId ? `?locationId=${locationId}` : '';
      const endpoint = `${this.baseUrl}/iot-core/device/${userId}${params}`;

      const response = await firstValueFrom(
        this.httpService.get<any[]>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Devices listed successfully', { count: response.data?.length || 0 });
      return response.data;
    } catch (error) {
      this.logDetailedError('List devices', error);
      throw error;
    }
  }

  /**
   * List all locations (/iot-core/location/{userId})
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @returns Array of locations
   */
  async listLocations(projectApiKey: string, userId: string): Promise<any[]> {
    try {
      logProxyCall('Listing locations', { userId });

      const endpoint = `${this.baseUrl}/iot-core/location/${userId}`;

      const response = await firstValueFrom(
        this.httpService.get<any[]>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Locations listed successfully', { count: response.data?.length || 0 });
      return response.data;
    } catch (error) {
      this.logDetailedError('List locations', error);
      throw error;
    }
  }

  /**
   * List all groups (/iot-core/group/{userId})
   * Optional locationId filter via query parameter
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @param locationId - Optional location ID filter
   * @returns Array of groups
   */
  async listGroups(projectApiKey: string, userId: string, locationId?: string): Promise<any[]> {
    try {
      logProxyCall('Listing groups', { userId, locationId });

      const params = locationId ? `?locationId=${locationId}` : '';
      const endpoint = `${this.baseUrl}/iot-core/group/${userId}${params}`;

      const response = await firstValueFrom(
        this.httpService.get<any[]>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Groups listed successfully', { count: response.data?.length || 0 });
      return response.data;
    } catch (error) {
      this.logDetailedError('List groups', error);
      throw error;
    }
  }

  /**
   * Get device by UUID (/iot-core/device/{userId}/{uuid})
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @param uuid - Device UUID
   * @returns Device object
   */
  async getDevice(projectApiKey: string, userId: string, uuid: string): Promise<any> {
    try {
      logProxyCall('Getting device', { userId, uuid });

      const endpoint = `${this.baseUrl}/iot-core/device/${userId}/${uuid}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Device fetched successfully', { uuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Get device', error);
      throw error;
    }
  }

  /**
   * Get location by UUID (/iot-core/location/{userId}/{uuid})
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @param uuid - Location UUID
   * @returns Location object
   */
  async getLocation(projectApiKey: string, userId: string, uuid: string): Promise<any> {
    try {
      logProxyCall('Getting location', { userId, uuid });

      const endpoint = `${this.baseUrl}/iot-core/location/${userId}/${uuid}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Location fetched successfully', { uuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Get location', error);
      throw error;
    }
  }

  /**
   * Get group by UUID (/iot-core/group/{userId}/{uuid})
   *
   * @param projectApiKey - Project API key from URL parameter (:projectApiKey)
   * @param userId - User ID extracted from JWT token
   * @param uuid - Group UUID
   * @returns Group object
   */
  async getGroup(projectApiKey: string, userId: string, uuid: string): Promise<any> {
    try {
      logProxyCall('Getting group', { userId, uuid });

      const endpoint = `${this.baseUrl}/iot-core/group/${userId}/${uuid}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Group fetched successfully', { uuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Get group', error);
      throw error;
    }
  }

  /**
   * Update device properties (label, desc, locationId, groupId)
   * @param projectApiKey - Project API key for authentication
   * @param userId - User ID
   * @param uuid - Device UUID
   * @param updates - Fields to update
   */
  async updateDevice(
    projectApiKey: string,
    userId: string,
    uuid: string,
    updates: {
      label?: string;
      desc?: string;
      locationId?: string;
      groupId?: string;
    },
  ): Promise<any> {
    try {
      logProxyCall('Updating device', { userId, uuid, updates });

      const endpoint = `${this.baseUrl}/iot-core/device/${userId}`;

      const response = await firstValueFrom(
        this.httpService.patch<any>(
          endpoint,
          { uuid, ...updates },
          {
            headers: this.getHeaders(projectApiKey),
          },
        ),
      );

      logProxyCall('Device updated successfully', { uuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Update device', error);
      throw error;
    }
  }

  /**
   * Delete device permanently
   * @param projectApiKey - Project API key for authentication
   * @param userId - User ID
   * @param uuid - Device UUID to delete
   */
  async deleteDevice(
    projectApiKey: string,
    userId: string,
    uuid: string,
  ): Promise<any> {
    try {
      logProxyCall('Deleting device', { userId, uuid });

      const endpoint = `${this.baseUrl}/iot-core/device/${userId}`;

      const response = await firstValueFrom(
        this.httpService.delete<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
          data: { uuid },
        }),
      );

      logProxyCall('Device deleted successfully', { uuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Delete device', error);
      throw error;
    }
  }

  /**
   * Get device state by device UUID
   * @param projectApiKey - Project API key for authentication
   * @param deviceUuid - Device UUID
   */
  async getDeviceState(projectApiKey: string, deviceUuid: string): Promise<any> {
    try {
      logProxyCall('Getting device state', { deviceUuid });

      const endpoint = `${this.baseUrl}/iot-core/state/devId/${deviceUuid}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Device state fetched successfully', { deviceUuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Get device state', error);
      throw error;
    }
  }

  /**
   * Get state of all devices in a location
   * @param projectApiKey - Project API key for authentication
   * @param locationUuid - Location UUID
   */
  async getLocationState(projectApiKey: string, locationUuid: string): Promise<any> {
    try {
      logProxyCall('Getting location state', { locationUuid });

      const endpoint = `${this.baseUrl}/iot-core/state/${locationUuid}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Location state fetched successfully', { locationUuid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Get location state', error);
      throw error;
    }
  }

  /**
   * Get device state by MAC address within a location
   * @param projectApiKey - Project API key for authentication
   * @param locationUuid - Location UUID
   * @param macAddress - Device MAC address
   */
  async getDeviceStateByMac(
    projectApiKey: string,
    locationUuid: string,
    macAddress: string,
  ): Promise<any> {
    try {
      logProxyCall('Getting device state by MAC', { locationUuid, macAddress });

      const endpoint = `${this.baseUrl}/iot-core/state/${locationUuid}/${macAddress}`;

      const response = await firstValueFrom(
        this.httpService.get<any>(endpoint, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Device state by MAC fetched successfully', { macAddress });
      return response.data;
    } catch (error) {
      this.logDetailedError('Get device state by MAC', error);
      throw error;
    }
  }

  /**
   * Control device by sending command
   * @param projectApiKey - Project API key for authentication
   * @param controlPayload - Control request body with eid, elementIds, command, endpoint, partnerId, rootUuid, protocolCtl
   */
  async controlDevice(
    projectApiKey: string,
    controlPayload: {
      eid: number;
      elementIds: number[];
      command: number[];
      endpoint: string;
      partnerId: string;
      rootUuid: string;
      protocolCtl: number;
    },
  ): Promise<any> {
    try {
      logProxyCall('Controlling device', { eid: controlPayload.eid, command: controlPayload.command });

      const endpoint = `${this.baseUrl}/iot-core/control/device`;

      const response = await firstValueFrom(
        this.httpService.post<any>(endpoint, controlPayload, {
          headers: this.getHeaders(projectApiKey),
        }),
      );

      logProxyCall('Device control command sent successfully', { eid: controlPayload.eid });
      return response.data;
    } catch (error) {
      this.logDetailedError('Control device', error);
      throw error;
    }
  }

  private logDetailedError(context: string, error: any) {
    const errorDetails = {
      message: error?.message || 'Unknown error',
      status: error?.response?.status || 'N/A',
      data: error?.response?.data || 'No response data',
      stack: error?.stack || 'No stack trace',
    };
    logProxyCall(`${context} failed`, errorDetails);
  }
}
