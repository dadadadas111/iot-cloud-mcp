import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { CommonModule } from './common/common.module';
import { ProxyModule } from './proxy/proxy.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { AuthModule } from './auth/auth.module';
import { ToolsModule } from './tools/tools.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
    ]),

    // HTTP client
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // Shared utilities
    CommonModule,

    // Proxy to Old API
    ProxyModule,

    // OAuth Discovery
    DiscoveryModule,

    // OAuth Authentication
    AuthModule,

    // MCP Tools
    ToolsModule,

    // MCP Protocol
    McpModule,
  ],
  controllers: [HealthController],
})
export class AppModule { }
