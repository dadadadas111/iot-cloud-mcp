import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError, AxiosRequestConfig } from 'axios';

export interface ApiRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  apiKey?: string; // per-session api key
  data?: any;
  params?: any;
}

@Injectable()
export class ApiClientV2Service {
  private readonly logger = new Logger(ApiClientV2Service.name);
  private baseUrl: string;
  private readonly timeout: number;

  constructor(private httpService: HttpService, private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('IOT_API_BASE_URL') || '';
    this.timeout = this.configService.get<number>('IOT_API_TIMEOUT') || 30000;

    if (!this.baseUrl) {
      throw new Error('IOT_API_BASE_URL must be configured for ApiClientV2');
    }
  }

  async request<T = any>(options: ApiRequestOptions): Promise<T> {
    const { method, path, apiKey, data, params } = options;

    const headers: Record<string, any> = {
      'Content-Type': 'application/json',
      accept: 'application/json',
    };

    if (apiKey) {
      headers['x-api-key'] = apiKey;
      headers['x-header-apikey'] = apiKey;
    }

    const config: AxiosRequestConfig = {
      method,
      url: `${this.baseUrl}${path}`,
      headers,
      timeout: this.timeout,
      data,
      params,
    };

    this.logger.debug(`${method} ${path}`);

    try {
      const response = await firstValueFrom(this.httpService.request<T>(config));
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(`API Error [${method} ${path}]:`, axiosError.response?.data || axiosError.message);
      throw axiosError.response?.data || axiosError;
    }
  }

  async get<T = any>(path: string, apiKey?: string, params?: any): Promise<T> {
    return this.request<T>({ method: 'GET', path, apiKey, params });
  }

  async post<T = any>(path: string, apiKey?: string, data?: any): Promise<T> {
    return this.request<T>({ method: 'POST', path, apiKey, data });
  }

  async patch<T = any>(path: string, apiKey?: string, data?: any): Promise<T> {
    return this.request<T>({ method: 'PATCH', path, apiKey, data });
  }

  async delete<T = any>(path: string, apiKey?: string, data?: any): Promise<T> {
    return this.request<T>({ method: 'DELETE', path, apiKey, data });
  }
}
