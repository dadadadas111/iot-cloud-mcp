import { Controller, Post, Body, UseGuards, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger';

import { AdminAuthGuard } from './guards/admin-auth.guard';
import { UpdateConfigDto, UpdateConfigResponseDto } from './dto/update-config.dto';
import { ApiClientService } from '../mcp/services/api-client.service';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AdminAuthGuard)
@ApiSecurity('x-admin-api-key')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly apiClientService: ApiClientService) {}

  @Post('config')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Update runtime configuration',
    description:
      'Update IOT_API_BASE_URL and IOT_API_KEY without restarting the service. ' +
      'Requires x-admin-api-key header for authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Configuration updated successfully',
    type: UpdateConfigResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - at least one field must be provided',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid admin API key',
  })
  updateConfig(@Body() dto: UpdateConfigDto): UpdateConfigResponseDto {
    const { iotApiBaseUrl, iotApiKey } = dto;

    // Validate that at least one field is provided
    if (!iotApiBaseUrl && !iotApiKey) {
      this.logger.warn('Config update attempted with no fields');
      return {
        success: false,
        message: 'At least one configuration field must be provided',
      };
    }

    // Update configuration
    const updatedFields: string[] = [];

    if (iotApiBaseUrl) {
      this.apiClientService.updateBaseUrl(iotApiBaseUrl);
      updatedFields.push('iotApiBaseUrl');
      this.logger.log(`Updated IOT_API_BASE_URL to: ${iotApiBaseUrl}`);
    }

    if (iotApiKey) {
      this.apiClientService.updateApiKey(iotApiKey);
      updatedFields.push('iotApiKey');
      this.logger.log('Updated IOT_API_KEY (value hidden for security)');
    }

    // Build response
    const response: UpdateConfigResponseDto = {
      success: true,
      message: `Configuration updated successfully: ${updatedFields.join(', ')}`,
      updatedConfig: {
        ...(iotApiBaseUrl && { iotApiBaseUrl }),
        ...(iotApiKey && { iotApiKeyUpdated: true }),
      },
    };

    return response;
  }
}
