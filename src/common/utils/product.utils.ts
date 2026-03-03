/**
 * Product ID (modelId) decoder utility.
 *
 * Rogo IoT devices use two modelId formats:
 *
 * OLD format (prefix-based):
 *   {6-char prefix}{deviceType:2}{subType:2}{powerType:2}{extra:2}{counter:2}
 *   e.g. "RALTBM0206010001" — Rạng Đông Light, subType 6
 *   Detected by: contains non-hex characters
 *
 * NEW format (bit-packed hex):
 *   16 hex chars encoding 64 bits with layout [16,4,9,9,8,18]:
 *   [brand:16][ownership:4][protocol:9][deviceType:9][element:8][counter:18]
 *   e.g. "0002F800100400CF" — Rạng Đông Plug
 *   Detected by: all characters are valid hex [0-9A-Fa-f]
 */

import {
  DEVICE_TYPE,
  BRAND,
  OWNERSHIP,
  PRODUCT_ID_BIT_LAYOUT,
} from '../constants/product.constants';

// ── Types ───────────────────────────────────────────────────

export interface DecodedProduct {
  /** Resolved device type name (e.g. "LIGHT", "SWITCH", "GATEWAY") */
  deviceType: string;
  /** Numeric device type ID */
  deviceTypeId: number;
  /** Brand name if resolved, otherwise hex code */
  brand?: string;
  /** Ownership label (OEM / ODM / OWNER / …) */
  ownership?: string;
  /** Protocol numeric ID */
  protocolId?: number;
  /** Element (channel) count */
  elementCount?: number;
  /** Sub-type ID (old format only) */
  subTypeId?: number;
  /** Power type (old format only) */
  powerType?: number;
  /** Which encoding format was detected */
  format: 'old' | 'new';
}

// ── Format detection ────────────────────────────────────────

const HEX_16_RE = /^[0-9A-Fa-f]{16}$/;

function isNewFormat(modelId: string): boolean {
  return HEX_16_RE.test(modelId);
}

// ── Decoders ────────────────────────────────────────────────

function decodeNewFormat(modelId: string): DecodedProduct {
  // Convert 16 hex chars → 64-bit binary string
  let bits = '';
  for (let i = 0; i < modelId.length; i += 2) {
    bits += parseInt(modelId.substring(i, i + 2), 16)
      .toString(2)
      .padStart(8, '0');
  }

  // Slice according to bit layout
  const values: number[] = [];
  let pos = 0;
  for (const width of PRODUCT_ID_BIT_LAYOUT) {
    values.push(parseInt(bits.substring(pos, pos + width), 2));
    pos += width;
  }

  const [brandVal, ownershipVal, protocolId, deviceTypeId, elementCount] = values;
  const brandHex = brandVal.toString(16).padStart(4, '0');

  return {
    format: 'new',
    deviceTypeId,
    deviceType: DEVICE_TYPE[deviceTypeId] ?? 'UNKNOWN',
    brand: BRAND[brandHex] ?? `0x${brandHex}`,
    ownership: OWNERSHIP[ownershipVal] ?? `${ownershipVal}`,
    protocolId,
    elementCount,
  };
}

function decodeOldFormat(modelId: string): DecodedProduct {
  // Suffix positions: [6:8]=deviceType, [8:10]=subType, [10:12]=powerType
  const deviceTypeId = parseInt(modelId.substring(6, 8), 10);
  const subTypeId = parseInt(modelId.substring(8, 10), 10);
  const powerType = parseInt(modelId.substring(10, 12), 10);

  return {
    format: 'old',
    deviceTypeId,
    deviceType: DEVICE_TYPE[deviceTypeId] ?? 'UNKNOWN',
    subTypeId,
    powerType,
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Decode a product/model ID into structured device info.
 * Automatically detects old vs new format.
 *
 * @param modelId - 16-character product model ID
 * @returns Decoded product info, or null for invalid input
 */
export function decodeProductId(modelId: string): DecodedProduct | null {
  if (!modelId || modelId.length !== 16) {
    return null;
  }

  return isNewFormat(modelId) ? decodeNewFormat(modelId) : decodeOldFormat(modelId);
}

/**
 * Quick helper — resolve just the device type name from a model ID.
 * Returns "UNKNOWN" for unrecognised types, null for invalid input.
 */
export function getDeviceType(modelId: string): string | null {
  const decoded = decodeProductId(modelId);
  return decoded?.deviceType ?? null;
}

/**
 * Resolve device type from raw API device data.
 * Uses productInfos[1] as the primary deviceTypeId source (always available from API),
 * which is more reliable than decoding the productId string (variable formats).
 *
 * @param device - Raw device object from IoT API
 * @returns { deviceType, deviceTypeId } or null if not resolvable
 */
export function resolveDeviceType(
  device: Record<string, unknown>,
): { deviceType: string; deviceTypeId: number } | null {
  const productInfos = device.productInfos as number[] | undefined;
  if (!Array.isArray(productInfos) || productInfos.length < 2) {
    return null;
  }

  const deviceTypeId = productInfos[1];
  if (deviceTypeId == null || deviceTypeId < 0) {
    return null;
  }

  const deviceType = DEVICE_TYPE[deviceTypeId] ?? 'UNKNOWN';
  return { deviceType, deviceTypeId };
}
