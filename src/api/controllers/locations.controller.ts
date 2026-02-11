import { Controller, Get, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { User } from '../../shared/decorators/user.decorator';
import { UserContext } from '../../auth/firebase.strategy';
import { ApiClientService } from '../../services/api-client.service';
import { LocationDto } from '../../types/entities.dto';

@ApiTags('Locations')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('locations')
export class LocationsController {
  constructor(private apiClient: ApiClientService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user locations',
    description: 'Returns all locations owned by the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Locations retrieved successfully',
    type: [LocationDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing token',
  })
  async getLocations(@User() user: UserContext) {
    try {
      // Correct API format: GET /iot-core/location/{userId}
      const locations = await this.apiClient.get(`/location/${user.userId}`, user.token);

      return {
        success: true,
        data: locations,
        userId: user.userId,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch locations',
          error: error.details,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
