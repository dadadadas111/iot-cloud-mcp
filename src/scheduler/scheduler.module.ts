import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SchedulerService } from './scheduler.service';
import { SchedulerProcessor } from './scheduler.processor';
import { ToolsModule } from '../tools/tools.module';
import { SCHEDULER_QUEUE } from './scheduler.constants';

@Module({
  imports: [BullModule.registerQueue({ name: SCHEDULER_QUEUE }), forwardRef(() => ToolsModule)],
  providers: [SchedulerService, SchedulerProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
