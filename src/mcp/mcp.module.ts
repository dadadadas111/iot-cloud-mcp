import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { McpService } from './services/mcp.service';
import { AuthModule } from '@/auth/auth.module';
import { ApiClientService } from '@/services/api-client.service';

@Module({
  imports: [HttpModule, AuthModule],
  providers: [McpService, ApiClientService],
  exports: [McpService],
})
export class McpModule {}
