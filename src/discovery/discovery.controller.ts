import { Controller, Get, Param, Logger, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('OAuth Discovery')
@Controller('.well-known')
export class DiscoveryController {
  private readonly logger = new Logger(DiscoveryController.name);

  constructor(private readonly configService: ConfigService) {}

  @Get('oauth-protected-resource')
  @ApiOperation({ summary: 'OAuth Protected Resource Metadata' })
  @ApiResponse({
    status: 200,
    description: 'Protected Resource Discovery Metadata (RFC8414)',
  })
  getProtectedResourceMetadata(@Query('projectApiKey') projectApiKey?: string) {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');

    this.logger.log(
      `Protected Resource metadata requested${projectApiKey ? ` for project ${projectApiKey}` : ''}`,
    );

    return {
      resource: `${baseUrl}/api`,
      authorization_servers: [
        {
          issuer: `${baseUrl}`,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
        },
      ],
      scopes_supported: ['mcp.tools.read', 'mcp.tools.write'],
    };
  }

  @Get('oauth-authorization-server')
  @ApiOperation({ summary: 'OAuth Authorization Server Metadata' })
  @ApiResponse({
    status: 200,
    description: 'Authorization Server Discovery Metadata (RFC8414)',
  })
  getAuthorizationServerMetadata(@Query('projectApiKey') projectApiKey?: string) {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3000');

    this.logger.log(
      `Authorization Server metadata requested${projectApiKey ? ` for project ${projectApiKey}` : ''}`,
    );

    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp.tools.read', 'mcp.tools.write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    };
  }
}
