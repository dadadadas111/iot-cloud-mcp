import { Controller, Get, Param, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

/**
 * RFC 8414 OAuth Discovery Controller
 * Implements path-aware discovery for multi-tenant OAuth endpoints
 * 
 * Supports both:
 * - Root discovery: /.well-known/oauth-authorization-server
 * - Path-aware discovery: /.well-known/oauth-authorization-server/auth/:projectApiKey
 */
@ApiTags('OAuth Discovery')
@Controller('.well-known')
export class DiscoveryController {
  private readonly logger = new Logger(DiscoveryController.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Root-level OAuth Authorization Server Metadata
   * Returns documentation pointing to path-aware discovery
   */
  // @Get('oauth-authorization-server')
  // @ApiOperation({ summary: 'OAuth Authorization Server Discovery (Root)' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Authorization Server Metadata - Use path-aware discovery for multi-tenant',
  // })
  // getRootAuthServerMetadata() {
  //   const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');

  //   this.logger.log('Root authorization server metadata requested');

  //   return {
  //     issuer: baseUrl,
  //     authorization_endpoint: `${baseUrl}/auth/:projectApiKey/authorize`,
  //     token_endpoint: `${baseUrl}/auth/:projectApiKey/token`,
  //     registration_endpoint: `${baseUrl}/auth/:projectApiKey/register`,
  //     code_challenge_methods_supported: ['S256'],
  //     scopes_supported: ['mcp.tools.read', 'mcp.tools.write'],
  //     response_types_supported: ['code'],
  //     grant_types_supported: ['authorization_code', 'refresh_token'],
  //     token_endpoint_auth_methods_supported: ['none'],
  //     documentation: 'Multi-tenant server. Use path-aware discovery: /.well-known/oauth-authorization-server/auth/{projectApiKey}',
  //   };
  // }

  /**
   * RFC 8414 Path-Aware Discovery for Multi-Tenant OAuth
   * This is the PRIMARY discovery endpoint MCP clients should use
   * 
   * Path format: /.well-known/oauth-authorization-server/auth/:projectApiKey
   */
  @Get('oauth-authorization-server/auth/:projectApiKey')
  @ApiOperation({ summary: 'OAuth Authorization Server Metadata (Path-Aware)' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key for tenant isolation' })
  @ApiResponse({
    status: 200,
    description: 'Tenant-specific Authorization Server Discovery Metadata (RFC 8414)',
  })
  getPathAwareAuthServerMetadata(@Param('projectApiKey') projectApiKey: string) {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');
    const issuer = `${baseUrl}/auth/${projectApiKey}`;

    this.logger.log(`Path-aware authorization server metadata requested for project: ${projectApiKey}`);

    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['mcp.tools.read', 'mcp.tools.write'],
    };
  }

  /**
   * Root-level OAuth Protected Resource Metadata
   * Returns documentation pointing to path-aware discovery
   */
  // @Get('oauth-protected-resource')
  // @ApiOperation({ summary: 'OAuth Protected Resource Discovery (Root)' })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Protected Resource Metadata - Use path-aware discovery for multi-tenant',
  // })
  // getRootProtectedResourceMetadata() {
  //   const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');

  //   this.logger.log('Root protected resource metadata requested');

  //   return {
  //     resource: `${baseUrl}/mcp/:projectApiKey`,
  //     authorization_servers: [`${baseUrl}/auth/:projectApiKey`],
  //     scopes_supported: ['mcp.tools.read', 'mcp.tools.write'],
  //     documentation: 'Multi-tenant server. Use path-aware discovery: /.well-known/oauth-protected-resource/mcp/{projectApiKey}',
  //   };
  // }

  /**
   * RFC 8414 Path-Aware Discovery for Protected Resources
   * 
   * Path format: /.well-known/oauth-protected-resource/mcp/:projectApiKey
   */
  @Get('oauth-protected-resource/mcp/:projectApiKey')
  @ApiOperation({ summary: 'OAuth Protected Resource Metadata (Path-Aware)' })
  @ApiParam({ name: 'projectApiKey', description: 'Project API key for tenant isolation' })
  @ApiResponse({
    status: 200,
    description: 'Tenant-specific Protected Resource Discovery Metadata',
  })
  getPathAwareProtectedResourceMetadata(@Param('projectApiKey') projectApiKey: string) {
    const baseUrl = this.configService.get<string>('BASE_URL', 'http://localhost:3001');

    this.logger.log(`Path-aware protected resource metadata requested for project: ${projectApiKey}`);

    return {
      resource: `${baseUrl}/mcp/${projectApiKey}`,
      authorization_servers: [`${baseUrl}/auth/${projectApiKey}`],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp.tools.read', 'mcp.tools.write'],
    };
  }
}
