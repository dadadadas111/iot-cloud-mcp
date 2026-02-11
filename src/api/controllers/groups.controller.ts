import { Controller, Get, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { User } from '../../shared/decorators/user.decorator';
import { UserContext } from '../../auth/firebase.strategy';
import { ApiClientService } from '../../services/api-client.service';
import { GroupDto } from '../../types/entities.dto';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private apiClient: ApiClientService) {}

  @Get()
  @ApiOperation({
    summary: 'Get user groups',
    description: 'Returns all groups owned by the authenticated user',
  })
  @ApiQuery({ name: 'locationId', required: false, description: 'Filter by location ID' })
  @ApiResponse({
    status: 200,
    description: 'Groups retrieved successfully',
    type: [GroupDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing token',
  })
  async getGroups(
    @User() user: UserContext,
    @Query('locationId') locationId?: string,
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

      const groups = await this.apiClient.get('/group', user.token, params);

      return {
        success: true,
        data: groups,
        userId: user.userId,
        filters: locationId ? { locationId } : {},
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: error.message || 'Failed to fetch groups',
          error: error.details,
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
