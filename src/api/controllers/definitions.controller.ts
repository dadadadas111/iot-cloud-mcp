import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ENTITY_DEFINITIONS, COMMON_WORKFLOWS } from '../../types/definitions';

@ApiTags('Definitions')
@Controller('definitions')
export class DefinitionsController {
  @Get()
  @ApiOperation({
    summary: 'Get all entity definitions',
    description:
      'Returns comprehensive documentation of all IoT entities (Partner, Project, Location, Group, Device, State) including field descriptions, relationships, and common use cases.',
  })
  @ApiResponse({
    status: 200,
    description: 'Entity definitions retrieved successfully',
  })
  getDefinitions() {
    return {
      entities: ENTITY_DEFINITIONS,
      commonWorkflows: COMMON_WORKFLOWS,
      apiVersion: '1.0.0',
    };
  }

  @Get('entities')
  @ApiOperation({
    summary: 'Get entity definitions only',
    description: 'Returns just the entity definitions without workflows',
  })
  @ApiResponse({
    status: 200,
    description: 'Entity definitions retrieved successfully',
  })
  getEntities() {
    return ENTITY_DEFINITIONS;
  }

  @Get('workflows')
  @ApiOperation({
    summary: 'Get common workflow examples',
    description: 'Returns examples of common API usage patterns',
  })
  @ApiResponse({
    status: 200,
    description: 'Workflow examples retrieved successfully',
  })
  getWorkflows() {
    return COMMON_WORKFLOWS;
  }
}
