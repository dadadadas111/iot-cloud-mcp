import { Module } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { AuthModule } from '../auth/auth.module';
import { McpModule } from '../mcp/mcp.module';

@Module({
  imports: [AuthModule, McpModule],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
