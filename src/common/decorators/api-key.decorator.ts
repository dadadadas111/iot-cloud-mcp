/**
 * API Key decorator for extracting project API key from headers
 */

import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { MCP_CONSTANTS } from '../constants/mcp.constants';

/**
 * Decorator to extract projectApiKey from request headers
 * Usage: @ApiKey() in controller method parameters
 */
export const ApiKey = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const apiKey = request.headers[MCP_CONSTANTS.PROJECT_API_KEY_HEADER];

  if (!apiKey) {
    throw new BadRequestException(
      `API key missing. Use '${MCP_CONSTANTS.PROJECT_API_KEY_HEADER}' header`,
    );
  }

  return apiKey as string;
});
