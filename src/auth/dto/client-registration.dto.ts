import { IsString, IsOptional, IsArray, IsIn, IsUrl, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SUPPORTED_AUTH_METHODS = ['none', 'client_secret_basic', 'client_secret_post'] as const;
type TokenEndpointAuthMethod = (typeof SUPPORTED_AUTH_METHODS)[number];

export class ClientRegistrationRequestDto {
  @ApiProperty({
    description: 'Array of redirect URIs for the client',
    example: ['http://localhost:3000/callback'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({}, { each: true })
  redirect_uris: string[];

  @ApiPropertyOptional({ description: 'Human-readable client name', example: 'My MCP Client' })
  @IsString()
  @IsOptional()
  client_name?: string;

  @ApiPropertyOptional({
    description: 'Token endpoint authentication method',
    example: 'none',
    enum: SUPPORTED_AUTH_METHODS,
  })
  @IsIn(SUPPORTED_AUTH_METHODS)
  @IsOptional()
  token_endpoint_auth_method?: TokenEndpointAuthMethod;

  @ApiPropertyOptional({
    description: 'Grant types the client will use',
    example: ['authorization_code', 'refresh_token'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  grant_types?: string[];

  @ApiPropertyOptional({
    description: 'Response types the client will use',
    example: ['code'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  response_types?: string[];

  @ApiPropertyOptional({ description: 'Space-separated scope string', example: 'read write' })
  @IsString()
  @IsOptional()
  scope?: string;
}

export interface OAuthClientRecord {
  client_id: string;
  client_secret_hash?: string;
  client_id_issued_at: number;
  client_secret_expires_at?: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_name?: string;
  scope?: string;
  alias: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_secret?: string;
  client_id_issued_at: number;
  client_secret_expires_at?: number;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  client_name?: string;
  scope?: string;
}
