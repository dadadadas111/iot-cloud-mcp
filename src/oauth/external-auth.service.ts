import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface ExternalAuthCodeResponse {
  code: string;
}

export interface ExternalTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: string | number;
  id_token?: string;
}

@Injectable()
export class ExternalAuthService {
  private readonly logger = new Logger(ExternalAuthService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async generateAuthCode(userId: string, apiKey: string): Promise<string> {
    const apiUrl = this.configService.get<string>('IOT_API_BASE_URL');

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${apiUrl}/authen/auth_code/${userId}`, '', {
          headers: {
            'x-header-apikey': apiKey,
            accept: '*/*',
          },
        }),
      );

      const data: ExternalAuthCodeResponse = response.data;
      this.logger.log(`Generated auth code for user: ${userId}`);
      return data.code;
    } catch (error) {
      this.handleError(error, 'Auth code generation');
    }
  }

  async exchangeCodeForToken(code: string, apiKey: string): Promise<ExternalTokenResponse> {
    const apiUrl = this.configService.get<string>('IOT_API_BASE_URL');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${apiUrl}/authen/token/accesstoken`,
          {
            grant_type: 'authorization_code',
            code,
          },
          {
            headers: {
              'x-header-apikey': apiKey,
              accept: '*/*',
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log(`Exchanged code for token: ${code.substring(0, 8)}...`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'Token exchange');
    }
  }

  async refreshToken(refreshToken: string, apiKey: string): Promise<ExternalTokenResponse> {
    const apiUrl = this.configService.get<string>('IOT_API_BASE_URL');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${apiUrl}/authen/token/accesstoken`,
          {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          },
          {
            headers: {
              'x-header-apikey': apiKey,
              accept: '*/*',
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.logger.log('Token refreshed successfully');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Token refresh');
    }
  }

  private handleError(error: any, operation: string): never {
    const axiosError = error as AxiosError;
    this.logger.error(`${operation} failed:`, axiosError.response?.data || axiosError.message);

    if (axiosError.response?.status === 401) {
      throw new BadRequestException('Invalid credentials or API key');
    }

    if (axiosError.response?.status === 400) {
      throw new BadRequestException('Invalid request format');
    }

    throw new BadRequestException(`${operation} failed`);
  }
}
