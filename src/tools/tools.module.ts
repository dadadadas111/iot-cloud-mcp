import { Module, forwardRef } from '@nestjs/common';
import { ProxyModule } from '../proxy/proxy.module';
import { CommonModule } from '../common/common.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { ToolRegistryService } from './services/tool-registry.service';
import { ToolExecutorService } from './services/tool-executor.service';

@Module({
  imports: [ProxyModule, CommonModule, forwardRef(() => SchedulerModule)],
  providers: [ToolRegistryService, ToolExecutorService],
  exports: [ToolRegistryService, ToolExecutorService],
})
export class ToolsModule {}
