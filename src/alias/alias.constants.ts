/**
 * Injection token for the external alias Redis client.
 * Separate from REDIS_CLIENT (session store) to keep concerns isolated.
 */
export const ALIAS_REDIS_CLIENT = 'ALIAS_REDIS_CLIENT';
