import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

export interface LoginResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private httpService: HttpService, private configService: ConfigService) {}

  async login(email: string, password: string): Promise<LoginResponse> {
    const apiUrl = this.configService.get<string>('IOT_API_BASE_URL');
    const apiKey = this.configService.get<string>('IOT_API_KEY');

    this.logger.log(`Attempting login for user: ${email}`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${apiUrl}/authen/login`,
          { email, password },
          {
            headers: {
              'x-header-apikey': apiKey,
              'Content-Type': 'application/json',
              accept: 'application/json',
            },
          },
        ),
      );

      this.logger.log(`Login successful for user: ${email}`);
      return response.data;
    } catch (error) {
      this.handleAuthError(error, 'Login');
    }
  }

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    const apiUrl = this.configService.get<string>('IOT_API_BASE_URL');
    const apiKey = this.configService.get<string>('IOT_API_KEY');

    this.logger.log('Attempting token refresh');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${apiUrl}/authen/refresh`,
          { refresh_token: refreshToken },
          {
            headers: {
              'x-header-apikey': apiKey,
              'Content-Type': 'application/json',
              accept: 'application/json',
            },
          },
        ),
      );

      this.logger.log('Token refresh successful');
      return response.data;
    } catch (error) {
      this.handleAuthError(error, 'Token refresh');
    }
  }

  private handleAuthError(error: any, operation: string): never {
    const axiosError = error as AxiosError;

    this.logger.error(`${operation} failed:`, axiosError.response?.data || axiosError.message);

    if (axiosError.response?.status === 401) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (axiosError.response?.status === 400) {
      throw new UnauthorizedException('Invalid request format');
    }

    throw new UnauthorizedException(`${operation} failed. Please try again.`);
  }
}
