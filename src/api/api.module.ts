import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthModule } from '../auth/auth.module';
import { ApiClientService } from '../services/api-client.service';
import { DefinitionsController } from './controllers/definitions.controller';
import { LocationsController } from './controllers/locations.controller';
import { GroupsController } from './controllers/groups.controller';
import { DevicesController } from './controllers/devices.controller';

@Module({
  imports: [HttpModule, AuthModule],
  controllers: [DefinitionsController, LocationsController, GroupsController, DevicesController],
  providers: [ApiClientService],
})
export class ApiModule {}
