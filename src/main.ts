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
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-admin-api-key', 'x-project-api-key', 'mcp-protocol-version'],
    credentials: true,
  });

  // Global request logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Origin: ${req.headers.origin || 'none'} - Content-Type: ${req.headers['content-type'] || 'none'}`);
    
    // Log response
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
      if (res.statusCode >= 400) {
        console.log(`  Error body: ${typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200)}`);
      }
      return originalSend.call(this, data);
    };
    next();
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
