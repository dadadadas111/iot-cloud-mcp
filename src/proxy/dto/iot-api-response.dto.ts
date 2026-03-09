/**
 * IoT API Response DTOs
 * Type definitions for responses from the IoT API Server
 * Matches actual API structure from docs/EXTERNAL-API.md
 */

/**
 * Login response from IoT API (/iot-core/authen/login)
 * Returns Firebase JWT token and refresh token
 */
export interface IotApiLoginResponse {
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
 * Token response from IoT API (/iot-core/authen/token/accesstoken)
 * Used for both authorization_code and refresh_token grant types
 */
export interface IotApiTokenResponse {
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
 * Auth code response from IoT API (/iot-core/authen/auth_code/{userId})
 * Returns authorization code for OAuth flow
 */
export interface IotApiAuthCodeResponse {
  /** Authorization code to exchange for tokens */
  code: string;
}

/**
 * User profile response from IoT API (/iot-core/user/{userId})
 * Contains IoT user information
 */
export interface IotApiUserResponse {
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
 * Generic error response from the IoT API
 * Used for error handling and debugging
 */
export interface IotApiErrorResponse {
  /** Error code identifier */
  code?: string | number;
  /** Human-readable error message */
  message: string;
  /** Detailed error description */
  details?: string;
  /** Additional error context */
  [key: string]: unknown;
}

// ─── IoT Resource Types ───────────────────────────────────────────────────────

/**
 * Device from IoT API (/iot-core/device/{userId})
 * Index signature allows additional fields from the API that we don't explicitly type
 */
export interface IotDevice {
  uuid: string;
  label: string;
  desc: string;
  mac: string;
  locationId: string;
  groupId: string;
  features: unknown;
  productId: string;
  productInfos: number[];
  eid: number;
  endpoint: string;
  partnerId: string;
  rootUuid: string;
  protocolCtl: number;
  elementIds: number[];
  [key: string]: unknown;
}

/**
 * Location from IoT API (/iot-core/location/{userId})
 */
export interface IotLocation {
  uuid: string;
  label: string;
  desc: string;
  [key: string]: unknown;
}

/**
 * Group from IoT API (/iot-core/group/{userId})
 */
export interface IotGroup {
  uuid: string;
  label: string;
  desc: string;
  locationId: string;
  [key: string]: unknown;
}

/**
 * Device state entry from location state endpoint
 * (/iot-core/state/{locationUuid})
 */
export interface IotLocationStateEntry {
  mac: string;
  devId: string;
  state: unknown;
  updatedAt: string;
  [key: string]: unknown;
}

/** Control device request payload */
export interface IotControlPayload {
  eid: number;
  elementIds: number[];
  command: number[];
  endpoint: string;
  partnerId: string;
  rootUuid: string;
  protocolCtl: number;
}
