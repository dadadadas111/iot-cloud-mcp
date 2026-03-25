/**
 * Redis injection token for NestJS DI
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * Redis key prefixes for MCP session storage
 */
export const MCP_SESSION_PREFIX = 'mcp:session:';
export const MCP_PROJECT_SESSIONS_PREFIX = 'mcp:project-sessions:';

/**
 * Redis key prefixes for OAuth client registration
 * oauth:client:{alias}:{clientId} → JSON | oauth:alias-clients:{alias} → SET
 */
export const OAUTH_CLIENT_PREFIX = 'oauth:client:';
export const OAUTH_ALIAS_CLIENTS_PREFIX = 'oauth:alias-clients:';
