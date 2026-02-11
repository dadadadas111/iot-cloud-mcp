import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { McpModule } from '../mcp/mcp.module';
import { ApiClientService } from '../services/api-client.service';
import { DefinitionsController } from './controllers/definitions.controller';
import { LocationsController } from './controllers/locations.controller';
import { GroupsController } from './controllers/groups.controller';
import { DevicesController } from './controllers/devices.controller';
import { McpController } from './controllers/mcp.controller';

@Module({
  imports: [HttpModule, AuthModule, McpModule],
  controllers: [
    DefinitionsController,
    LocationsController,
    GroupsController,
    DevicesController,
    McpController,
  ],
  providers: [ApiClientService],
})
export class ApiModule {}
