import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosRequestConfig } from 'axios';

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  firebaseToken: string;
  data?: any;
  params?: any;
}

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);
  private baseUrl: string;
  private apiKey: string;
  private readonly timeout: number;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('IOT_API_BASE_URL') || '';
    this.apiKey = this.configService.get<string>('IOT_API_KEY') || '';
    this.timeout = this.configService.get<number>('IOT_API_TIMEOUT') || 30000;

    if (!this.baseUrl || !this.apiKey) {
      throw new Error('IOT_API_BASE_URL and IOT_API_KEY must be configured');
    }
  }

  /**
   * Update the IoT API base URL at runtime
   * @param url - New base URL (e.g., https://api.iot-cloud.com)
   */
  updateBaseUrl(url: string): void {
    if (!url || typeof url !== 'string') {
      throw new Error('Base URL must be a non-empty string');
    }
    this.logger.log(`Updating base URL from ${this.baseUrl} to ${url}`);
    this.baseUrl = url;
  }

  /**
   * Update the IoT API key at runtime
   * @param key - New API key
   */
  updateApiKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('API key must be a non-empty string');
    }
    this.logger.log('Updating API key (value hidden for security)');
    this.apiKey = key;
  }

  /**
   * Update multiple configuration values at runtime
   * @param config - Configuration object with baseUrl and/or apiKey
   */
  updateConfig(config: { baseUrl?: string; apiKey?: string }): void {
    if (config.baseUrl) {
      this.updateBaseUrl(config.baseUrl);
    }
    if (config.apiKey) {
      this.updateApiKey(config.apiKey);
    }
  }

  async request<T = any>(options: ApiRequestOptions): Promise<T> {
    const { method, path, firebaseToken, data, params } = options;

    const config: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${path}`,
      headers: {
        Authorization: `Bearer ${firebaseToken}`,
        'x-header-apikey': this.apiKey,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      timeout: this.timeout,
      data,
      params,
    };

    this.logger.debug(`${method} ${path}`);

    try {
      const response = await firstValueFrom(this.httpService.request<T>(config));

      // Log response summary for debugging
      const dataType = typeof response.data;
      const isArray = Array.isArray(response.data);
      const dataLength = isArray ? (response.data as any[]).length : 'N/A';
      this.logger.debug(
        `${method} ${path} -> ${response.status} (type: ${dataType}, isArray: ${isArray}, length: ${dataLength})`,
      );

      return response.data;
    } catch (error) {
      return this.handleError(error, `${method} ${path}`);
    }
  }

  async get<T = any>(path: string, firebaseToken: string, params?: any): Promise<T> {
    return this.request<T>({
      method: 'GET',
      path,
      firebaseToken,
      params,
    });
  }

  async post<T = any>(path: string, firebaseToken: string, data?: any): Promise<T> {
    return this.request<T>({
      method: 'POST',
      path,
      firebaseToken,
      data,
    });
  }

  async patch<T = any>(path: string, firebaseToken: string, data?: any): Promise<T> {
    return this.request<T>({
      method: 'PATCH',
      path,
      firebaseToken,
      data,
    });
  }

  async delete<T = any>(path: string, firebaseToken: string, data?: any): Promise<T> {
    return this.request<T>({
      method: 'DELETE',
      path,
      firebaseToken,
      data,
    });
  }

  private handleError(error: any, context: string): never {
    const axiosError = error as AxiosError;

    this.logger.error(`API Error [${context}]:`, axiosError.response?.data || axiosError.message);

    const status = axiosError.response?.status;
    const message = this.getErrorMessage(axiosError);

    throw {
      status: status || 500,
      message,
      context,
      details: axiosError.response?.data,
    };
  }

  private getErrorMessage(error: AxiosError): string {
    if (error.response) {
      const data = error.response.data as any;

      // Handle IoT API error format
      if (data?.message) {
        return data.message;
      }

      // Handle common HTTP errors
      switch (error.response.status) {
        case 400:
          return 'Invalid request parameters';
        case 401:
          return 'Unauthorized - invalid or expired token';
        case 403:
          return 'Forbidden - insufficient permissions';
        case 404:
          return 'Resource not found';
        case 429:
          return 'Too many requests - rate limit exceeded';
        case 500:
          return 'Internal server error';
        default:
          return `Request failed with status ${error.response.status}`;
      }
    }

    if (error.code === 'ECONNABORTED') {
      return 'Request timeout - IoT API did not respond in time';
    }

    if (error.code === 'ECONNREFUSED') {
      return 'Cannot connect to IoT API';
    }

    return error.message || 'Unknown error occurred';
  }
}
