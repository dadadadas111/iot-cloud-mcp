import { IsString, IsOptional, IsIn, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OAuth 2.1 Authorization Request DTO
 * Based on RFC 6749 with PKCE (RFC 7636) extensions
 */
export class AuthorizeQueryDto {
  @ApiProperty({
    description: 'Client identifier',
    example: 'web-client-static',
  })
  @IsString()
  client_id: string;

  @ApiProperty({
    description: 'Redirection URI where authorization code will be sent',
    example: 'http://localhost:3000/callback',
  })
  @IsUrl()
  redirect_uri: string;

  @ApiProperty({
    description: 'OAuth 2.0 state parameter for CSRF protection',
    example: 'random-state-string',
  })
  @IsString()
  state: string;

  @ApiProperty({
    description: 'PKCE code challenge (base64url-encoded)',
    example: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  })
  @IsString()
  code_challenge: string;

  @ApiProperty({
    description: 'PKCE code challenge method',
    example: 'S256',
    enum: ['S256', 'plain'],
  })
  @IsIn(['S256', 'plain'])
  code_challenge_method: string;

  @ApiPropertyOptional({
    description: 'OAuth scope (space-separated)',
    example: 'read write',
  })
  @IsString()
  @IsOptional()
  scope?: string;

  @ApiProperty({
    description: 'OAuth response type',
    example: 'code',
    default: 'code',
  })
  @IsIn(['code'])
  @IsOptional()
  response_type?: string = 'code';

  @ApiPropertyOptional({
    description: 'Resource indicator (RFC 8707)',
    example: 'https://api.example.com',
  })
  @IsUrl()
  @IsOptional()
  resource?: string;
}
