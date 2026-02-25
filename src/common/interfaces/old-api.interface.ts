/**
 * Legacy API compatibility interfaces
 */

export interface OldApiRequest {
  method: string;
  endpoint: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface OldApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  timestamp: number;
}

export interface ApiProxyConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
  allowedMethods: string[];
}
