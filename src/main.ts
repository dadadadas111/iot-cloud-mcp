import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  // Enable CORS (always enable for MCP compatibility)
  const origins = configService.get<string>('CORS_ORIGINS')?.split(',') || ['*'];

  app.enableCors({
    origin: origins.length > 0 && origins[0] !== '*' ? origins : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-admin-api-key'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = configService.get<number>('PORT') || 3001;
  const host = configService.get<string>('HOST') || '0.0.0.0';

  await app.listen(port, host);

  console.log(`🚀 IoT Cloud MCP Bridge Server running on http://${host}:${port}`);
  console.log(`📚 API Documentation available at http://${host}:${port}/docs`);
  console.log(`📋 OpenAPI JSON at http://${host}:${port}/docs-json`);
}

bootstrap();
