import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { McpModule } from '../mcp/mcp.module';
import { OAuthModule } from '../oauth/oauth.module';
import { ApiClientService } from '../mcp/services/api-client.service';
import { McpController } from './controllers/mcp.controller';

@Module({
  imports: [HttpModule, AuthModule, McpModule, OAuthModule],
  controllers: [McpController],
  providers: [ApiClientService],
})
export class ApiModule {}
