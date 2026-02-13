# Agent Guidelines for IoT Cloud MCP Server

This document contains essential information for AI coding agents working in this repository.

## Project Overview

**Stack**: NestJS + TypeScript + Model Context Protocol (MCP) SDK  
**Purpose**: MCP Bridge Server connecting AI assistants with IoT Cloud REST API  
**Architecture**: Modular NestJS application with MCP protocol implementation

## Build, Lint, Test Commands

```bash
# Install dependencies
npm install

# Development
npm run start:dev          # Start with watch mode
npm run start:debug        # Start with debug mode

# Build
npm run build              # Compile TypeScript to dist/
npm run prebuild           # Clean dist/ (runs automatically before build)

# Production
npm run start:prod         # Run built application from dist/

# Code Quality
npm run lint               # ESLint with auto-fix
npm run format             # Prettier formatting

# Testing
npm run test               # Run all unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage report
npm run test:e2e           # Run end-to-end tests

# Run single test file
npm run test -- path/to/file.spec.ts
npm run test -- --testNamePattern="test name pattern"
```

## Code Style Guidelines

### Import Organization

**Order** (grouped with blank lines between):

1. Node.js built-in modules
2. Third-party packages (@nestjs, external libraries)
3. Internal modules (relative imports)

**Example**:

```typescript
import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';

import { ApiClientService } from '../../services/api-client.service';
import { AuthService } from '../../auth/auth.service';
```

### Formatting

- **Quotes**: Single quotes (`'`) for strings
- **Semicolons**: Always required
- **Trailing Commas**: Always use (arrays, objects, parameters)
- **Line Length**: 100 characters max
- **Indentation**: 2 spaces (no tabs)
- **Object/Array**: Trailing comma on multi-line

**Example**:

```typescript
const config = {
  name: 'IoT Cloud MCP Bridge',
  version: '1.0.0',
  capabilities: {
    tools: {},
    logging: {},
  },
};
```

### TypeScript

- **Types**: Explicit return types optional (ESLint rule disabled)
- **any**: Allowed when necessary (ESLint rule disabled)
- **Strict Null Checks**: Enabled (`strictNullChecks: true`)
- **No Implicit Any**: Disabled (`noImplicitAny: false`)
- **Decorators**: Enabled (`experimentalDecorators: true`)
- **Path Aliases**: Use `@/*` for src imports when needed

**Module Resolution**:

```typescript
// Path alias configured in tsconfig.json
import { SomeService } from '@/services/some.service';

// Relative imports are preferred for nearby files
import { McpService } from '../../mcp/services/mcp.service';
```

### NestJS Patterns

#### Module Structure

Standard NestJS module pattern with clear imports organization:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from './auth/auth.module';
import { ApiModule } from './api/api.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Global configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Feature modules
    AuthModule,
    ApiModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

#### Service Pattern

- Use `@Injectable()` decorator
- Inject dependencies via constructor
- Use `Logger` for logging with service name
- Return typed responses

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {}

  async getData(): Promise<DataType> {
    this.logger.debug('Fetching data');
    // Implementation
  }
}
```

#### Controller Pattern

- Use appropriate decorators (`@Controller`, `@Get`, `@Post`, etc.)
- Add Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
- Inject services via constructor
- Handle Express Request/Response when needed

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() credentials: LoginDto) {
    return this.authService.login(credentials.email, credentials.password);
  }
}
```

### Error Handling

#### Throw NestJS HTTP Exceptions

```typescript
import { UnauthorizedException } from '@nestjs/common';

if (axiosError.response?.status === 401) {
  throw new UnauthorizedException('Invalid credentials');
}
```

#### Custom Error Objects

For API client errors, throw structured error objects:

```typescript
throw {
  status: status || 500,
  message: 'Error description',
  context: 'Operation name',
  details: additionalData,
};
```

#### Error Handling Pattern

```typescript
try {
  const result = await this.apiCall();
  return result;
} catch (error) {
  this.logger.error('Operation failed:', error);
  // Transform and re-throw
  throw new UnauthorizedException('Friendly error message');
}
```

#### MCP Tool Error Responses

For MCP tools, return error in content format:

```typescript
try {
  // Tool logic
} catch (error) {
  this.logger.error('[tool_name] Failed:', error);
  return {
    content: [
      {
        type: 'text' as const,
        text: `Operation failed: ${error.message}`,
      },
    ],
    isError: true,
  };
}
```

### Logging

- Use NestJS `Logger` class
- Create logger with service/controller name: `new Logger(ClassName.name)`
- Log levels: `debug`, `log`, `warn`, `error`
- Include context in log messages

```typescript
private readonly logger = new Logger(McpService.name);

this.logger.debug(`[operation] Detailed debug info`);
this.logger.log(`Operation completed successfully`);
this.logger.warn(`Warning condition detected`);
this.logger.error(`Error occurred:`, error);
```

### Naming Conventions

- **Classes**: PascalCase with suffix (`UserService`, `AuthController`, `DeviceDto`)
- **Interfaces**: PascalCase (`LoginResponse`, `ConnectionState`)
- **Variables/Functions**: camelCase (`userId`, `createServer`, `handleRequest`)
- **Constants**: UPPER_SNAKE_CASE or camelCase for config
- **Private Properties**: Use `private readonly` when possible

### DTOs and Validation

Use `class-validator` decorators on DTO classes:

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class DeviceDto {
  @ApiProperty({ description: 'Unique device identifier' })
  _id: string;

  @ApiProperty({ description: 'Device label/name' })
  label: string;

  @ApiProperty({ description: 'Owner user ID' })
  userId: string;

  @ApiProperty({ description: 'Group ID', required: false })
  groupId?: string;
}
```

Enable global validation pipe in main.ts:

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }),
);
```

## Project Structure

```
src/
├── main.ts                    # Application entry, bootstrap
├── app.module.ts              # Root module
├── auth/                      # Authentication module
│   ├── auth.module.ts
│   ├── auth.service.ts
│   └── auth.controller.ts
├── api/                       # API endpoints
│   ├── api.module.ts
│   └── controllers/
│       └── mcp.controller.ts  # MCP protocol endpoint
├── mcp/                       # MCP protocol implementation
│   ├── mcp.module.ts
│   ├── services/
│   │   └── mcp.service.ts     # MCP tools registration
│   └── types/
│       └── mcp.types.ts
├── services/                  # Shared services
│   └── api-client.service.ts  # HTTP client for IoT API
├── types/                     # Type definitions
│   ├── entities.dto.ts        # API entity DTOs
│   └── definitions.ts
└── health.controller.ts       # Health check endpoint
```

## Testing Conventions

**File Naming**: `*.spec.ts` for unit tests, `jest-e2e.json` for e2e config

**Test Structure**:

```typescript
describe('ServiceName', () => {
  let service: ServiceName;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [ServiceName, MockDependency],
    }).compile();

    service = module.get<ServiceName>(ServiceName);
  });

  it('should do something', () => {
    expect(service.method()).toBe(expectedValue);
  });
});
```

## Key Dependencies

- **NestJS**: Framework (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`)
- **MCP SDK**: `@modelcontextprotocol/sdk` for protocol implementation
- **HTTP**: `@nestjs/axios` + `axios` for external API calls
- **Config**: `@nestjs/config` for environment variables
- **Swagger**: `@nestjs/swagger` for API documentation
- **Validation**: `class-validator` + `class-transformer`
- **RxJS**: `rxjs` for reactive programming (used with axios)

## Environment Configuration

Use `ConfigService` to access environment variables:

```typescript
constructor(private configService: ConfigService) {
  this.baseUrl = this.configService.get<string>('IOT_API_BASE_URL');
  this.apiKey = this.configService.get<string>('IOT_API_KEY');
}
```

Required variables: `IOT_API_BASE_URL`, `IOT_API_KEY`

## Common Patterns

### Async/Await with RxJS Observable

Convert observables to promises using `firstValueFrom`:

```typescript
import { firstValueFrom } from 'rxjs';

const response = await firstValueFrom(this.httpService.post(url, data, config));
```

### Typed HTTP Responses

Use generic types for API responses:

```typescript
async get<T = any>(path: string, token: string): Promise<T> {
  return this.request<T>({ method: 'GET', path, token });
}
```

### Constructor Initialization

Initialize configuration in constructor, validate required values:

```typescript
constructor(
  private httpService: HttpService,
  private configService: ConfigService,
) {
  this.baseUrl = this.configService.get<string>('IOT_API_BASE_URL') || '';

  if (!this.baseUrl) {
    throw new Error('IOT_API_BASE_URL must be configured');
  }
}
```

### Session Management

Store stateful data in Maps with session IDs:

```typescript
private readonly connectionStates = new Map<string, ConnectionState>();

const sessionKey = extra?.sessionId || 'default';
const state = this.connectionStates.get(sessionKey);
```

## Important Notes

- **No authentication on MCP endpoint**: Users authenticate via `login` tool after connecting
- **Each MCP transport needs its own server instance**: Call `createServer()` per connection
- **Debug logging**: Use `this.logger.debug()` extensively for troubleshooting
- **Error responses**: Always include context and user-friendly messages
- **Type safety**: Leverage TypeScript types, but `any` is acceptable when needed
