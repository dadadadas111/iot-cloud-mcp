/**
 * Error sanitization utilities
 * Prevents internal error details from leaking to MCP clients
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('ErrorSanitizer');

/**
 * Sanitize an error for client-facing MCP tool responses.
 * Logs the full error server-side, returns a safe message for the client.
 *
 * @param error - The caught error (any type)
 * @param context - Optional context string for server-side logging (e.g. tool name)
 * @returns A user-safe error message string
 */
export function sanitizeErrorForClient(error: unknown, context?: string): string {
  // Log full error details server-side for debugging
  if (context) {
    logger.error(`[${context}] ${error instanceof Error ? error.message : String(error)}`);
  }

  // Axios errors (from IoT API proxy)
  if (isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401 || status === 403) {
      return 'Authentication failed. Please check your credentials or re-authenticate.';
    }
    if (status === 404) {
      return 'The requested resource was not found.';
    }
    if (status === 429) {
      return 'Rate limit exceeded. Please try again later.';
    }
    if (status && status >= 500) {
      return 'IoT API service error. Please try again later.';
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return 'Could not connect to IoT API service. Please try again later.';
    }
    return 'Request to IoT API failed. Please try again later.';
  }

  // NestJS HTTP exceptions (BadRequest, Unauthorized, etc.)
  if (isHttpException(error)) {
    // These messages are intentionally set by our code, safe to expose
    return error.message;
  }

  // Generic fallback — never expose raw error messages
  return 'An unexpected error occurred. Please try again later.';
}

/** Type guard for Axios errors */
function isAxiosError(
  error: unknown,
): error is { response?: { status: number; data?: unknown }; code?: string; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'isAxiosError' in error &&
    (error as any).isAxiosError === true
  );
}

/** Type guard for NestJS HttpException */
function isHttpException(error: unknown): error is { message: string; getStatus: () => number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'getStatus' in error &&
    typeof (error as any).getStatus === 'function'
  );
}
