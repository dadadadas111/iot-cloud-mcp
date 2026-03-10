import { Module } from '@nestjs/common';
import { ResourceRegistryService } from './services/resource-registry.service';
import { WidgetsModule } from '../widgets/widgets.module';

/**
 * ResourcesModule
 * Provides MCP resources (documentation, reference materials) for AI consumption
 */
@Module({
  imports: [WidgetsModule],
  providers: [ResourceRegistryService],
  exports: [ResourceRegistryService],
})
export class ResourcesModule {}
