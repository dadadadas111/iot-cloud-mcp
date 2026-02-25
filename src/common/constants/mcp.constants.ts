/**
 * MCP and application-wide constants
 */

export const MCP_CONSTANTS = {
  // API Routes
  API_PREFIX: '/api/v1',
  MCP_ROUTE: '/mcp',
  HEALTH_ROUTE: '/health',

  // Headers
  PROJECT_API_KEY_HEADER: 'x-project-api-key',
  AUTHORIZATION_HEADER: 'Authorization',
  CONTENT_TYPE: 'application/json',

  // Firebase
  FIREBASE_ID_TOKEN_PREFIX: 'Bearer ',
  JWT_ALGORITHM: 'HS256',

  // Defaults
  DEFAULT_TIMEOUT_MS: 30000,
  DEFAULT_PAGE_SIZE: 50,

  // Log contexts
  LOG_CONTEXT_AUTH: 'AUTH',
  LOG_CONTEXT_MCP: 'MCP',
  LOG_CONTEXT_PROXY: 'PROXY',
  LOG_CONTEXT_COMMON: 'COMMON',
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;
