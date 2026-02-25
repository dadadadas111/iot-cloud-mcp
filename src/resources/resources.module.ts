import { Module } from '@nestjs/common';
import { ResourceRegistryService } from './services/resource-registry.service';

/**
 * ResourcesModule
 * Provides MCP resources (documentation, reference materials) for AI consumption
 */
@Module({
  providers: [ResourceRegistryService],
  exports: [ResourceRegistryService],
})
export class ResourcesModule {}
