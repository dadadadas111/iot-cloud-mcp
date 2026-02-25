import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OAuthService } from './services/oauth.service';
import { DiscoveryService } from './services/discovery.service';
import { ProxyModule } from '../proxy/proxy.module';

/**
 * OAuth 2.1 Authentication Module
 * Implements OAuth 2.1 authorization flow with Old API orchestration
 */
@Module({
  imports: [ProxyModule],
  controllers: [AuthController],
  providers: [OAuthService, DiscoveryService],
  exports: [OAuthService],
})
export class AuthModule {}
