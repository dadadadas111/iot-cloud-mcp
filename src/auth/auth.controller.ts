import { Controller, Post, Body, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Throttle } from '@nestjs/throttler';

class LoginDto {
  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password', example: '123456', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}

class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token from previous login' })
  @IsString()
  refresh_token: string;
}

class LoginResponseDto {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @ApiOperation({
    summary: 'Login with email and password',
    description:
      'Authenticates user with IoT Cloud API and returns Firebase JWT token. Use this token in Authorization header for subsequent requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many login attempts',
  })
  async login(@Body() loginDto: LoginDto): Promise<LoginResponseDto> {
    try {
      return await this.authService.login(loginDto.email, loginDto.password);
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.UNAUTHORIZED);
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Obtains a new access token using a valid refresh token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  async refresh(@Body() refreshDto: RefreshTokenDto): Promise<LoginResponseDto> {
    try {
      return await this.authService.refreshToken(refreshDto.refresh_token);
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.UNAUTHORIZED);
    }
  }
}
