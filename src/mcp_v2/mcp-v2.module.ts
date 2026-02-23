import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { McpV2Service } from './services/mcp-v2.service';
import { ApiClientV2Service } from './services/api-client-v2.service';
import { SessionStoreService } from './services/session-store.service';
import { McpV2Controller } from './controllers/mcp-v2.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [McpV2Controller],
  providers: [McpV2Service, ApiClientV2Service, SessionStoreService],
  exports: [McpV2Service],
})
export class McpV2Module {}
