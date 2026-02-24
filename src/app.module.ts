import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';

import { AuthModule } from './auth/auth.module';
import { ApiModule } from './api/api.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';
import { OAuthModule } from './oauth/oauth.module';

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

    // Feature modules
    AuthModule,
    ApiModule,
    AdminModule,
    OAuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
