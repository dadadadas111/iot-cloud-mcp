import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { CommonModule } from './common/common.module';
import { ProxyModule } from './proxy/proxy.module';
import { DiscoveryModule } from './discovery/discovery.module';
import { AuthModule } from './auth/auth.module';
import { ToolsModule } from './tools/tools.module';
import { McpModule } from './mcp/mcp.module';
import { RedisModule } from './redis/redis.module';
import { WidgetsModule } from './widgets/widgets.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting (configurable via env vars)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.get<string>('ENABLE_RATE_LIMIT', 'true') !== 'false';
        return [
          {
            ttl: enabled ? config.get<number>('RATE_LIMIT_WINDOW', 60000) : 60000,
            limit: enabled ? config.get<number>('RATE_LIMIT_MAX', 100) : 0,
          },
        ];
      },
    }),

    // HTTP client
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),

    // Shared utilities
    CommonModule,

    // Redis (global)
    RedisModule,

    // Proxy to Old API
    ProxyModule,

    // OAuth Discovery
    DiscoveryModule,

    // OAuth Authentication
    AuthModule,

    // MCP Tools
    ToolsModule,

    // MCP Widgets (ChatGPT interactive UI)
    WidgetsModule,

    // MCP Protocol
    McpModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
