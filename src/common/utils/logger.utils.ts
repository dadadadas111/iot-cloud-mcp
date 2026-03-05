/**
 * Logging utilities for MCP bridge
 * Simple PoC using console.log with context prefixes
 */

import { MCP_CONSTANTS } from '../constants/mcp.constants';

/**
 * Log MCP event with context
 * @param message - Message to log
 * @param data - Optional data to include
 */
export function logMcpEvent(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${MCP_CONSTANTS.LOG_CONTEXT_MCP}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Log authentication flow event
 * @param message - Message to log
 * @param data - Optional data to include
 */
export function logAuthFlow(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${MCP_CONSTANTS.LOG_CONTEXT_AUTH}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Log proxy call event
 * @param message - Message to log
 * @param data - Optional data to include
 */
export function logProxyCall(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${MCP_CONSTANTS.LOG_CONTEXT_PROXY}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

/**
 * Log common event
 * @param message - Message to log
 * @param context - Context name
 * @param data - Optional data to include
 */
export function logEvent(
  message: string,
  context: string = MCP_CONSTANTS.LOG_CONTEXT_COMMON,
  data?: unknown,
): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${context}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}
