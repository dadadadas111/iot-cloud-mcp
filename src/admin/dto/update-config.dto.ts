import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateConfigDto {
  @ApiProperty({
    description: 'IoT API base URL (e.g., https://api.iot-cloud.com)',
    required: false,
    example: 'https://api.iot-cloud.com',
  })
  @IsString()
  @IsOptional()
  iotApiBaseUrl?: string;

  @ApiProperty({
    description: 'IoT API key for authentication',
    required: false,
    example: 'sk_live_1234567890abcdef',
  })
  @IsString()
  @IsOptional()
  iotApiKey?: string;
}

export class UpdateConfigResponseDto {
  @ApiProperty({
    description: 'Operation success status',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Success or error message',
    example: 'Configuration updated successfully',
  })
  message: string;

  @ApiProperty({
    description: 'Updated configuration values (without sensitive data)',
    example: {
      iotApiBaseUrl: 'https://api.iot-cloud.com',
      iotApiKeyUpdated: true,
    },
  })
  updatedConfig?: {
    iotApiBaseUrl?: string;
    iotApiKeyUpdated?: boolean;
  };
}
