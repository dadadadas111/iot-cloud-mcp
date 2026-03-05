/**
 * JWT utility functions for Firebase token handling
 *
 * TODO(security/P0): Replace decodeJwt() with Firebase Admin SDK verifyIdToken().
 * Currently tokens are only base64-decoded, NOT cryptographically verified.
 * Blocked: waiting for Firebase service account key from company.
 * When unblocked:
 *   1. npm install firebase-admin
 *   2. Initialize admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
 *   3. Replace decodeJwt() body with admin.auth().verifyIdToken(token)
 *   4. Remove the manual base64 decode fallback
 */

import { BadRequestException } from '@nestjs/common';
import { MCP_CONSTANTS } from '../constants/mcp.constants';

/**
 * Decode JWT token (Firebase tokens)
 * Note: This is a simple decode without verification for PoC
 * @param token - JWT token with or without Bearer prefix
 * @returns Decoded token payload
 */
export function decodeJwt(token: string): Record<string, unknown> {
  try {
    const cleanToken = token.replace(MCP_CONSTANTS.FIREBASE_ID_TOKEN_PREFIX, '').trim();
    const parts = cleanToken.split('.');

    if (parts.length !== 3) {
      throw new BadRequestException('Invalid JWT format');
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return payload;
  } catch (error) {
    throw new BadRequestException('Failed to decode JWT token');
  }
}

/**
 * Extract bearer token from authorization header
 * @param authHeader - Authorization header value
 * @returns Extracted token
 */
export function extractBearerToken(authHeader: string): string {
  if (!authHeader) {
    throw new BadRequestException('Authorization header missing');
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new BadRequestException('Invalid Bearer token format');
  }

  return token;
}

/**
 * Get user ID from decoded JWT
 * @param decoded - Decoded JWT payload
 * @returns User ID (UID)
 */
export function getUserIdFromToken(decoded: Record<string, unknown>): string {
  const uid = decoded.uid || decoded.sub;

  if (!uid) {
    throw new BadRequestException('User ID not found in token');
  }

  return String(uid);
}
