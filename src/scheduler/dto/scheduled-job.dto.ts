export interface ScheduledJobData {
  toolName: string;
  params: Record<string, unknown>;
  projectApiKey: string;
  userId: string;
  scheduledAt: string;
  executeAt: string;
}

export interface ScheduledJobResponse {
  jobId: string;
  toolName: string;
  params: Record<string, unknown>;
  scheduledAt: string;
  executeAt: string;
  status: string;
}
