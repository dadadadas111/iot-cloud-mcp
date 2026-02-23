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

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('IoT Cloud MCP Bridge API')
    .setDescription('MCP Bridge Server for IoT Cloud REST API - Compatible with ChatGPT Actions')
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'Authorization',
      description: 'Enter your Firebase JWT token',
      in: 'header',
    })
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-admin-api-key',
        in: 'header',
        description: 'Admin API key for runtime configuration management',
      },
      'x-admin-api-key',
    )
    .addServer('http://localhost:3001', 'Local Development')
    .addServer('https://mcp-stag.dash.id.vn', 'Staging')
    .addServer('https://mcp.dash.id.vn', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('PORT') || 3001;
  const host = configService.get<string>('HOST') || '0.0.0.0';

  await app.listen(port, host);

  console.log(`🚀 IoT Cloud MCP Bridge Server running on http://${host}:${port}`);
  console.log(`📚 API Documentation available at http://${host}:${port}/api/docs`);
  console.log(`📋 OpenAPI JSON at http://${host}:${port}/api/docs-json`);
}

bootstrap();
