import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminAuthGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const adminKey = request.headers['x-admin-api-key'];
    const expectedKey = this.configService.get<string>('ADMIN_API_KEY');

    if (!expectedKey) {
      this.logger.error('ADMIN_API_KEY is not configured in environment');
      throw new UnauthorizedException('Admin API is not configured');
    }

    if (!adminKey) {
      this.logger.warn('Admin request without x-admin-api-key header');
      throw new UnauthorizedException('Missing admin API key');
    }

    if (adminKey !== expectedKey) {
      this.logger.warn('Admin request with invalid API key');
      throw new UnauthorizedException('Invalid admin API key');
    }

    this.logger.debug('Admin authentication successful');
    return true;
  }
}
