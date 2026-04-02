const MODE_NAMES: Record<number, string> = {
  0: 'AUTO',
  1: 'COOL',
  2: 'DRY',
  3: 'HEAT',
  4: 'FAN',
};

/**
 * Normalize the raw getDeviceState API response into a flat element→attribute map.
 *
 * The API may return several wrapper shapes:
 *   - Array:  [{ state: { DEVICE_ID: { ELEMENT_ID: { ATTR_ID: [...] } } } }]
 *   - Object: { state: { DEVICE_ID: { ... } }, mac, devId, ... }
 *   - Object: { DEVICE_ID: { ELEMENT_ID: { ATTR_ID: [...] } } }
 *   - Object: { ELEMENT_ID: { ATTR_ID: [...] } }  ← already unwrapped
 *
 * Always returns the element→attribute map: { "1": { "1": [1, 1] }, ... }
 */
export function extractStateMap(rawState: unknown): Record<string, unknown> | null {
  if (!rawState || typeof rawState !== 'object') return null;

  if (Array.isArray(rawState)) {
    const first = rawState[0] as Record<string, unknown> | undefined;
    if (first?.state && typeof first.state === 'object') {
      return extractStateMap(first);
    }
    return null;
  }

  let record = rawState as Record<string, unknown>;

  if (
    'state' in record &&
    record.state &&
    typeof record.state === 'object' &&
    !Array.isArray(record.state)
  ) {
    record = record.state as Record<string, unknown>;
  }

  const keys = Object.keys(record);
  if (keys.length === 0) return null;

  const firstVal = record[keys[0]];
  if (!firstVal || typeof firstVal !== 'object' || Array.isArray(firstVal)) {
    return record;
  }

  const inner = firstVal as Record<string, unknown>;
  const innerKeys = Object.keys(inner);
  if (innerKeys.length > 0 && Array.isArray(inner[innerKeys[0]])) {
    return record;
  }

  return firstVal as Record<string, unknown>;
}

export function translateElementAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [attrId, attrVal] of Object.entries(attrs)) {
    let values: number[];
    if (Array.isArray(attrVal) && attrVal.length > 1) {
      values = attrVal.slice(1);
    } else if (typeof attrVal === 'number') {
      values = [attrVal];
    } else {
      continue;
    }

    switch (attrId) {
      case '1':
        result.power = values[0] === 1 ? 'on' : 'off';
        break;
      case '17':
        result.mode = MODE_NAMES[values[0]] ?? `mode_${values[0]}`;
        break;
      case '20':
        result.temperature = values[0];
        break;
      case '28':
        result.brightness = Math.round(values[0] / 10);
        break;
      case '29':
        result.kelvin = values[0];
        break;
      case '31':
        result.color = { h: values[0] / 10, s: values[1] / 10, v: values[2] / 10 };
        break;
      default:
        result[`attr_${attrId}`] = values.length === 1 ? values[0] : values;
        break;
    }
  }

  return result;
}

export function translateDeviceState(stateMap: Record<string, unknown>): Record<string, unknown> {
  const elements = Object.entries(stateMap).filter(
    ([, val]) => val && typeof val === 'object' && !Array.isArray(val),
  );

  if (elements.length === 0) return {};

  if (elements.length === 1) {
    return translateElementAttrs(elements[0][1] as Record<string, unknown>);
  }

  const translated: Record<string, Record<string, unknown>> = {};
  for (const [elementId, elementVal] of elements) {
    translated[elementId] = translateElementAttrs(elementVal as Record<string, unknown>);
  }
  return { elementCount: elements.length, elements: translated };
}
