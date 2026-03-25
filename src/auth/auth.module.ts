import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OAuthService } from './services/oauth.service';
import { DiscoveryService } from './services/discovery.service';
import { ClientRepository } from './services/client.repository';
import { ClientRegistrationService } from './services/client-registration.service';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [AuthController],
  providers: [OAuthService, DiscoveryService, ClientRepository, ClientRegistrationService],
  exports: [OAuthService, DiscoveryService, ClientRegistrationService],
})
export class AuthModule {}
