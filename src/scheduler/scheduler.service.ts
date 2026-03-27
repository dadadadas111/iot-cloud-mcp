import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { extractBearerToken, decodeJwt, getUserIdFromToken } from '../common/utils/jwt.utils';
import { SCHEDULER_QUEUE, SCHEDULER_DEFAULTS } from './scheduler.constants';
import { ScheduledJobData, ScheduledJobResponse } from './dto/scheduled-job.dto';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly maxDelaySeconds: number;
  private readonly jobRetentionSeconds: number;

  constructor(
    @InjectQueue(SCHEDULER_QUEUE) private readonly queue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.maxDelaySeconds = this.configService.get<number>(
      'SCHEDULER_MAX_DELAY_SECONDS',
      SCHEDULER_DEFAULTS.maxDelaySeconds,
    );
    this.jobRetentionSeconds = this.configService.get<number>(
      'SCHEDULER_JOB_RETENTION_SECONDS',
      SCHEDULER_DEFAULTS.jobRetentionSeconds,
    );
  }

  async schedule(opts: {
    toolName: string;
    params: Record<string, unknown>;
    delay?: number;
    executeAt?: string;
    authorization: string;
    projectApiKey: string;
  }): Promise<CallToolResult> {
    if (opts.delay != null && opts.executeAt != null) {
      throw new BadRequestException('Cannot specify both delay and executeAt. Pick one.');
    }
    if (opts.delay == null && opts.executeAt == null) {
      throw new BadRequestException('Must specify either delay (seconds) or executeAt (ISO 8601).');
    }

    const token = extractBearerToken(opts.authorization);
    const decoded = decodeJwt(token);
    const userId = getUserIdFromToken(decoded);

    const delayMs = this.computeDelayMs(opts.delay, opts.executeAt);
    const now = new Date();
    const executeAt = new Date(now.getTime() + delayMs).toISOString();

    const jobData: ScheduledJobData = {
      toolName: opts.toolName,
      params: opts.params,
      projectApiKey: opts.projectApiKey,
      userId,
      scheduledAt: now.toISOString(),
      executeAt,
    };

    const job = await this.queue.add('execute-tool', jobData, {
      delay: delayMs,
      attempts: 1,
      removeOnComplete: { age: this.jobRetentionSeconds },
      removeOnFail: { age: this.jobRetentionSeconds },
    });

    this.logger.log(`Scheduled ${opts.toolName} → job ${job.id} in ${delayMs}ms`);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            scheduled: true,
            jobId: job.id,
            tool: opts.toolName,
            executeAt,
          }),
        },
      ],
    };
  }

  async listJobs(userId: string, projectApiKey: string): Promise<ScheduledJobResponse[]> {
    const [delayed, completed, failed] = await Promise.all([
      this.queue.getJobs(['delayed', 'waiting'], 0, 50),
      this.queue.getJobs(['completed'], 0, 20),
      this.queue.getJobs(['failed'], 0, 10),
    ]);

    const allJobs = [...delayed, ...completed, ...failed];

    const userJobs = allJobs.filter(
      (job) => job.data.userId === userId && job.data.projectApiKey === projectApiKey,
    );

    const results: ScheduledJobResponse[] = [];
    for (const job of userJobs) {
      const state = await job.getState();
      results.push({
        jobId: job.id ?? 'unknown',
        toolName: job.data.toolName,
        params: job.data.params,
        scheduledAt: job.data.scheduledAt,
        executeAt: job.data.executeAt,
        status: state,
      });
    }

    return results;
  }

  async cancelJob(
    jobId: string,
    userId: string,
    projectApiKey: string,
  ): Promise<{ cancelled: boolean; jobId: string }> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new BadRequestException(`Job ${jobId} not found.`);
    }
    if (job.data.userId !== userId || job.data.projectApiKey !== projectApiKey) {
      throw new BadRequestException(`Job ${jobId} not found.`);
    }

    const state = await job.getState();
    if (state !== 'delayed' && state !== 'waiting') {
      throw new BadRequestException(`Job ${jobId} cannot be cancelled — status is "${state}".`);
    }

    await job.remove();
    this.logger.log(`Cancelled job ${jobId} (${job.data.toolName})`);

    return { cancelled: true, jobId };
  }

  private computeDelayMs(delaySec?: number, executeAt?: string): number {
    let delayMs: number;

    if (delaySec != null) {
      delayMs = delaySec * 1000;
    } else {
      const target = new Date(executeAt!);
      if (isNaN(target.getTime())) {
        throw new BadRequestException(
          `Invalid executeAt format: "${executeAt}". Use ISO 8601 (e.g. 2026-03-28T10:00:00+07:00).`,
        );
      }
      delayMs = target.getTime() - Date.now();
    }

    if (delayMs <= 0) {
      throw new BadRequestException('Scheduled time must be in the future.');
    }
    if (delayMs > this.maxDelaySeconds * 1000) {
      throw new BadRequestException(
        `Delay cannot exceed ${this.maxDelaySeconds} seconds (${Math.round(this.maxDelaySeconds / 86400)} days).`,
      );
    }

    return Math.round(delayMs);
  }
}
