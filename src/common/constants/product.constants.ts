/**
 * IoT Product constants for decoding product/model IDs.
 *
 * These maps are intentionally plain objects so they can be
 * swapped for cloud-fetched values later without changing the
 * decoder interface.
 */

// ── Device Types ────────────────────────────────────────────
// Source: IoTFullDeviceType (static defaults, may be extended from S3)

export const DEVICE_TYPE: Record<number, string> = {
  2: 'LIGHT',
  3: 'SWITCH',
  4: 'PLUG',
  5: 'CURTAINS',
  6: 'DOORLOCK',
  8: 'DOORBELL',
  10: 'MEDIA_BOX',
  11: 'USB_DONGLE',
  12: 'REPEATER',
  13: 'CAMERA',
  14: 'SPEAKER',
  16: 'AC',
  17: 'TV',
  18: 'FAN',
  19: 'MOTOR_CONTROLLER',
  20: 'BUTTON_DASH',
  21: 'SWITCH_SCENE',
  28: 'HEAT_SENSOR',
  30: 'TEMP_SENSOR',
  31: 'DOOR_SENSOR',
  32: 'SMOKE_SENSOR',
  33: 'MOTION_LUX_SENSOR',
  34: 'MOTION_SENSOR',
  35: 'LUX_SENSOR',
  36: 'DUST_SENSOR',
  37: 'DIMMER_SCENE',
  38: 'PRESENCE_SENSOR',
  39: 'SWITCH_LIGHT_DIMMER',
  64: 'DIMMER',
  96: 'AC_CONTROLLER',
  99: 'IR_DEVICE_CONTROLLER',
  100: 'GATE',
  128: 'SIREN',
  192: 'GATEWAY',
  241: 'MACHINE_COFFEE',
  1001: 'SENSOR_DEVICE',
};

// ── Brands ──────────────────────────────────────────────────
// Key = 4-char lowercase hex from the 16-bit brand field

export const BRAND: Record<string, string> = {
  '0001': 'FPT',
  '0002': 'Rạng Đông',
  '0004': 'Điện Quang',
  '0006': 'Heiman',
  '0008': 'Aquara',
  '000a': 'Tuya',
  '000c': 'Yale',
  '000e': 'Hikvision',
  '0010': 'Sunricher',
  '0014': 'SAFEFIRE',
  '7267': 'Rogo',
};

// ── Ownership ───────────────────────────────────────────────

export const OWNERSHIP: Record<number, string> = {
  1: 'OEM',
  2: 'ODM',
  3: 'ODEM',
  4: '3RD',
  15: 'OWNER',
};

// ── Bit layout for the NEW (hex-packed) modelId format ──────
// Total: 64 bits = 16 hex chars
// [brand:16][ownership:4][protocol:9][deviceType:9][element:8][counter:18]

export const PRODUCT_ID_BIT_LAYOUT = [16, 4, 9, 9, 8, 18] as const;

export const PRODUCT_ID_FIELD_NAMES = [
  'brand',
  'ownership',
  'protocol',
  'deviceType',
  'element',
  'counter',
] as const;
