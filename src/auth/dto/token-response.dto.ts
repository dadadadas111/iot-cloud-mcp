import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * OAuth 2.1 Token Response DTO
 * Based on RFC 6749 token endpoint response
 */
export class TokenResponseDto {
  @ApiProperty({
    description: 'Access token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  access_token: string;

  @ApiProperty({
    description: 'Token type',
    example: 'Bearer',
    default: 'Bearer',
  })
  token_type: string;

  @ApiProperty({
    description: 'Token expiration time in seconds',
    example: 3600,
  })
  expires_in: number;

  @ApiPropertyOptional({
    description: 'Refresh token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refresh_token?: string;

  @ApiPropertyOptional({
    description: 'Granted scope (space-separated)',
    example: 'read write',
  })
  scope?: string;

  /**
   * Creates a TokenResponseDto from Old API JWT response
   * @param jwt - JWT string from Old API
   * @param expiresIn - Token expiration in seconds (default: 3600)
   * @param refreshToken - Optional refresh token
   * @param scope - Optional scope string
   * @returns TokenResponseDto instance
   */
  static fromJwt(
    jwt: string,
    expiresIn = 3600,
    refreshToken?: string,
    scope?: string,
  ): TokenResponseDto {
    return {
      access_token: jwt,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope,
    };
  }
}
