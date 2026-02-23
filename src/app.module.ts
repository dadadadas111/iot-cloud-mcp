import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller';
import { McpV2Module } from '@/mcp_v2/mcp-v2.module';

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
    McpV2Module
  ],
  controllers: [HealthController],
})
export class AppModule {}
