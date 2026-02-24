import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OAuthController } from './oauth.controller';
import { RootOAuthController } from './root-oauth.controller';
import { OAuthService } from './oauth.service';
import { ExternalAuthService } from './external-auth.service';
import { AuthModule } from '../auth/auth.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [AuthModule, McpModule, HttpModule],
  controllers: [OAuthController, RootOAuthController],
  providers: [OAuthService, ExternalAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
