import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { ToolExecutorService } from '../tools/services/tool-executor.service';
import { SCHEDULER_QUEUE } from './scheduler.constants';
import { ScheduledJobData } from './dto/scheduled-job.dto';

@Processor(SCHEDULER_QUEUE)
export class SchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    @Inject(forwardRef(() => ToolExecutorService))
    private readonly toolExecutor: ToolExecutorService,
  ) {
    super();
  }

  async process(job: Job<ScheduledJobData>) {
    const { toolName, params, projectApiKey, userId } = job.data;
    this.logger.log(`Executing scheduled job ${job.id}: ${toolName}`);

    const result = await this.toolExecutor.executeTool(toolName, params, {
      projectApiKey,
      userId,
    });

    this.logger.log(`Scheduled job ${job.id} (${toolName}) completed`);
    return result;
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ScheduledJobData>, error: Error) {
    this.logger.error(`Scheduled job ${job.id} (${job.data.toolName}) failed: ${error.message}`);
  }
}
