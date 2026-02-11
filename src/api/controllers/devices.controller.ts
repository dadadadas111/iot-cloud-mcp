import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { User } from '../../shared/decorators/user.decorator';
import { UserContext } from '../../auth/firebase.strategy';
import { ApiClientService } from '../../services/api-client.service';
import { DeviceDto, DeviceStateDto } from '../../types/entities.dto';

@ApiTags('Devices')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('devices')
export class DevicesController {
  constructor(private apiClient: ApiClientService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user devices',
    description: 'Returns all devices owned by the authenticated user, with optional filters',
  })
  @ApiQuery({ name: 'locationId', required: false, description: 'Filter by location ID' })
  @ApiQuery({ name: 'groupId', required: false, description: 'Filter by group ID' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number for pagination' })
  @ApiResponse({
    status: 200,
    description: 'Devices retrieved successfully',
    type: [DeviceDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing token',
  })
  async getDevices(
    @User() user: UserContext,
    @Query('locationId') locationId?: string,
    @Query('groupId') groupId?: string,
    @Query('page') page?: number,
  ) {
    try {
      const params: any = {
        userId: user.userId,
        page: page || 1,
      };

      if (locationId) {
        params.locationId = locationId;
      }

      if (groupId) {
        params.groupId = groupId;
      }

      const devices = await this.apiClient.get('/device', user.token, params);

      return {
        success: true,
        data: devices,
        userId: user.userId,
        filters: {
          ...(locationId && { locationId }),
          ...(groupId && { groupId }),
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch devices',
          error: error.details,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get device by ID',
    description: 'Returns details of a specific device',
  })
  @ApiResponse({
    status: 200,
    description: 'Device retrieved successfully',
    type: DeviceDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  async getDevice(@User() user: UserContext, @Param('id') deviceId: string) {
    try {
      const device = await this.apiClient.get(`/device/${deviceId}`, user.token);

      return {
        success: true,
        data: device,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch device',
          error: error.details,
        },
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get(':id/state')
  @ApiOperation({
    summary: 'Get device state',
    description: 'Returns the current state of a specific device (e.g., on/off, temperature, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Device state retrieved successfully',
    type: DeviceStateDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Device not found',
  })
  async getDeviceState(@User() user: UserContext, @Param('id') deviceId: string) {
    try {
      const state = await this.apiClient.get(`/state/${deviceId}`, user.token);

      return {
        success: true,
        data: {
          deviceId,
          state: state.state || state,
          updatedAt: state.updatedAt || new Date().toISOString(),
          online: state.online !== undefined ? state.online : true,
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch device state',
          error: error.details,
        },
        error.status || HttpStatus.NOT_FOUND,
      );
    }
  }
}
