import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { McpService } from './services/mcp.service';
import { ApiClientService } from '@/mcp/services/api-client.service';
import { RedisService } from '@/mcp/services/redis.service';

@Module({
  imports: [HttpModule],
  providers: [McpService, ApiClientService, RedisService],
  exports: [McpService, ApiClientService, RedisService],
})
export class McpModule {}
