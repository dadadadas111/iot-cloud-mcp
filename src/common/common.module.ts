/**
 * Common module with shared utilities, decorators, and constants
 * Provides globally available features for the entire application
 */

import { Module, Global } from '@nestjs/common';

/**
 * CommonModule provides:
 * - Constants: MCP_CONSTANTS, HTTP_STATUS
 * - Decorators: @ApiKey()
 * - Utils: JWT utilities, Logger utilities
 * - Interfaces: TenantContext, OldApiRequest, OldApiResponse
 *
 * This module is marked as @Global() to make all exports
 * available throughout the application without explicit imports
 */
@Global()
@Module({})
export class CommonModule {}
