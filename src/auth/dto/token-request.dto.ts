import { IsString, IsOptional, IsIn, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OAuth 2.1 Token Request DTO
 * Supports authorization_code and refresh_token grant types
 */
export class TokenRequestDto {
  @ApiProperty({
    description: 'OAuth grant type',
    example: 'authorization_code',
    enum: ['authorization_code', 'refresh_token'],
  })
  @IsIn(['authorization_code', 'refresh_token'])
  grant_type: string;

  @ApiPropertyOptional({
    description: 'Authorization code (required for authorization_code grant)',
    example: 'abc123xyz',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    description: 'Refresh token (required for refresh_token grant)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsOptional()
  refresh_token?: string;

  @ApiPropertyOptional({
    description: 'PKCE code verifier (required for authorization_code grant)',
    example: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  })
  @IsString()
  @IsOptional()
  code_verifier?: string;

  @ApiPropertyOptional({
    description: 'Redirect URI used in authorization request',
    example: 'http://localhost:3000/callback',
  })
  @IsUrl()
  @IsOptional()
  redirect_uri?: string;

  @ApiPropertyOptional({
    description: 'Resource indicator (RFC 8707)',
    example: 'https://api.example.com',
  })
  @IsUrl()
  @IsOptional()
  resource?: string;
}
