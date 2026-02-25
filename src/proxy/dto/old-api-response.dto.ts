/**
 * Old API Response DTOs
 * Type definitions for responses from the Old API Server
 * Matches actual API structure from docs/EXTERNAL-API.md
 */

/**
 * Login response from Old API (/iot-core/authen/login)
 * Returns Firebase JWT token and refresh token
 */
export interface OldApiLoginResponse {
  /** Firebase JWT access token */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: string;
  /** Refresh token for getting new access tokens */
  refresh_token: string;
  /** Token expiration time in seconds */
  expires_in: number;
  /** ID token (empty string in current API) */
  id_token: string;
}

/**
 * Token response from Old API (/iot-core/authen/token/accesstoken)
 * Used for both authorization_code and refresh_token grant types
 */
export interface OldApiTokenResponse {
  /** Firebase JWT access token */
  access_token: string;
  /** Token type (always 'Bearer') */
  token_type: string;
  /** Refresh token for getting new access tokens */
  refresh_token: string;
  /** Token expiration time in seconds (can be string or number) */
  expires_in: number | string;
  /** ID token (empty string in current API) */
  id_token: string;
}

/**
 * Auth code response from Old API (/iot-core/authen/auth_code/{userId})
 * Returns authorization code for OAuth flow
 */
export interface OldApiAuthCodeResponse {
  /** Authorization code to exchange for tokens */
  code: string;
}

/**
 * User profile response from Old API (/iot-core/user/{userId})
 * Contains IoT user information
 */
export interface OldApiUserResponse {
  /** User unique identifier */
  userId: string;
  /** User code */
  code: string;
  /** User mode (0 = normal) */
  userMode: number;
  /** MQTT endpoint */
  endpoint: string;
  /** UTC timezone offset */
  utc: number;
  /** Extra information object */
  extraInfo: Record<string, unknown>;
  /** Account creation timestamp */
  createdAt: string;
  /** Account last update timestamp */
  updatedAt: string;
  /** Internal UUID */
  uuid: string;
}

/**
 * Generic error response from the Old API
 * Used for error handling and debugging
 */
export interface OldApiErrorResponse {
  /** Error code identifier */
  code?: string | number;
  /** Human-readable error message */
  message: string;
  /** Detailed error description */
  details?: string;
  /** Additional error context */
  [key: string]: unknown;
}
