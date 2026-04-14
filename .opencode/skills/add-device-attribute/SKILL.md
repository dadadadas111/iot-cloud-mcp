---
name: add-device-attribute
description: Step-by-step guide for adding a new IoT device attribute to this project — covering state decoding (get_device_state output) and control encoding (control_device_simple property-bag), including the two utils files, Zod schema, inputSchema, value scaling, and the symmetric naming rule between state and control.
license: MIT
compatibility: opencode
---

## What I do

- Add a `case 'N'` to `translateElementAttrs()` in `src/tools/utils/device-state.utils.ts` to decode raw protocol values into a human-readable state key
- Add an `if` block to `buildControlCommands()` in `src/tools/utils/device-control.utils.ts` to encode the human value back into a protocol command
- Add one optional field to the Zod schema + `inputSchema` in `src/tools/definitions/control-device-simple.tool.ts`
- Update the tool description to mention the new attribute
- Verify with `npx tsc --noEmit` and `npm test`

## When to use me

- "add support for attribute N" / "add new attribute" / "expose attr X in state and control"
- User provides an attrId with its protocol encoding (e.g., "attr 18 is fan swing, 0=auto, 255=off")
- Fixing an `attr_N` fallback in state that should become a named key
- Adding a new controllable property to `control_device_simple`

## How I work

### Step 1 — Understand the attribute spec

From the user or `docs/new-tools/device-attr-and-control.csv`:

- `attrId` (e.g., `18`)
- Value count and meaning (e.g., single value: `0`=auto, `255`=off)
- Raw protocol scale if decimal precision is needed (×10 encoding; divide when reading, multiply when writing)
- Human range (e.g., `"auto" | "off"` for fan swing, `0–100` for brightness)
- **Choose the human-readable key name** — this SAME name is used for both the state output key and the control input field

### Step 2 — State decoding in `translateElementAttrs()`

File: `src/tools/utils/device-state.utils.ts`

Inside the `switch (attrId)` block, **before** `default`:

```typescript
// Single-value → scalar
case 'N':
  result.keyName = values[0];          // pass-through (e.g., temperature)
  // or: result.keyName = values[0] / 10;  // ÷10 for scaled attrs (e.g., brightness)
  break;

// Single-value → enum string
case 'N': {
  const MAP: Record<number, string> = { 0: 'LABEL_A', 255: 'LABEL_B' };
  result.keyName = MAP[values[0]] ?? `keyName_${values[0]}`;
  break;
}

// Multi-value → nested object (e.g., HSV color)
case 'N':
  result.keyName = { field1: values[0] / 10, field2: values[1] / 10, field3: values[2] / 10 };
  break;
```

`values` is already `attrVal.slice(1)` (attrId prefix stripped). `values[0]` is the first actual value.

### Step 3 — Control encoding in `buildControlCommands()`

File: `src/tools/utils/device-control.utils.ts`

**3a.** Add the field to `ControlAttrs` interface:

```typescript
export interface ControlAttrs {
  // ... existing fields ...
  keyName?: string | number | { field1: number; field2: number }; // use the exact type
}
```

**3b.** Add an `if` block inside `buildControlCommands()`, keeping the order by attrId:

```typescript
// Single scalar
if (attrs.keyName !== undefined) {
  commands.push([attrId, Math.round(attrs.keyName * scale)]); // or just Math.round(attrs.keyName)
}

// Enum string → raw integer
const KEY_TO_RAW: Record<string, number> = { LABEL_A: 0, LABEL_B: 255 };
if (attrs.keyName !== undefined) {
  commands.push([attrId, KEY_TO_RAW[attrs.keyName]]);
}

// Multi-value nested object
if (attrs.keyName !== undefined) {
  commands.push([
    attrId,
    Math.round(attrs.keyName.field1 * scale),
    Math.round(attrs.keyName.field2 * scale),
  ]);
}
```

### Step 4 — Update `control-device-simple.tool.ts`

File: `src/tools/definitions/control-device-simple.tool.ts`

**4a. Zod schema** — add one optional field:

```typescript
keyName: z.string().optional().describe('Description. Values: "LABEL_A", "LABEL_B"'),
// or:
keyName: z.number().min(MIN).max(MAX).optional().describe('Description MIN-MAX (unit)'),
// or nested:
keyName: z.object({ field1: z.number().min(0).max(360), ... }).optional().describe('...'),
```

**4b. `inputSchema.properties`** — mirror exactly:

```typescript
keyName: { type: 'string', enum: ['LABEL_A', 'LABEL_B'], description: '...' },
// or:
keyName: { type: 'number', minimum: MIN, maximum: MAX, description: '...' },
// or nested:
keyName: { type: 'object', properties: { field1: { type: 'number', ... } }, required: [...] },
```

**4c. Description** — append the new attribute to the DESCRIPTION string:

```typescript
const DESCRIPTION = '... color ({h 0-360, s 0-100, v 0-100}), keyName (LABEL_A/LABEL_B). ...';
```

### Step 5 — Verify

```bash
npx tsc --noEmit   # must be clean (no output)
npm test           # all 22 tests must pass
```

Quick round-trip QA:

```bash
node -e "
// Encode
const cmd = [attrId, Math.round(inputVal * scale)];
// Decode (same as translateElementAttrs)
const decoded = cmd[1] / scale;
console.log(cmd, '->', decoded);  // must recover inputVal
"
```

## Rules & Constraints

- **Symmetric naming**: the key name used in `translateElementAttrs` result MUST match the field name in `ControlAttrs` and in the Zod schema. State output key = control input field = same string.
- **Symmetric values**: the value format in state output MUST match what the control field accepts. If state returns `"on"/"off"`, the control field takes `"on"/"off"`. If state returns `{ h, s, v }`, control takes `{ h, s, v }`.
- **Never** update Zod schema without updating `inputSchema` (and vice versa) — dual-schema pattern, both must always match
- **Never** update `description` without updating `metadata.description` — they are rendered identically
- **State decoding**: `values` is already `attrVal.slice(1)` — never call `.slice(1)` again; index directly with `values[0]`, `values[1]`
- **Protocol scale**: raw protocol uses ×10 integer encoding for decimal precision. Decode = ÷10; encode = ×10. Pass-through if no scaling needed.
- **Unknown attrs** fall through to `default: result['attr_N'] = values.length === 1 ? values[0] : values`. Only add a named case when the attribute has a well-defined human meaning.
- **No action enum** — `control_device_simple` uses a property-bag (optional named fields). Adding a new attribute = adding one optional field. Never add an action string.
- **No `requireValue`/`validateRange`** — those helpers were removed. Validation is handled by Zod `.min()`/`.max()`/`.enum()` in the schema.
- **Do not touch** `control_device` (raw protocol tool) or any widget tools.
- The pre-existing LSP error "Decorators are not valid here" in `tool-executor.service.ts` is a known NestJS/TS-server artifact — ignore it.

## Reference: Existing attribute map

| attrId | State key     | State value         | Control field | Control value          | Raw encoding    |
| ------ | ------------- | ------------------- | ------------- | ---------------------- | --------------- |
| `1`    | `power`       | `"on"` / `"off"`    | `power`       | `"on"` / `"off"`       | `1`=on, `0`=off |
| `17`   | `mode`        | `"AUTO"…"FAN"`      | `mode`        | `"AUTO"…"FAN"`         | enum lookup     |
| `20`   | `temperature` | number (°C)         | `temperature` | 15–30                  | pass-through    |
| `28`   | `brightness`  | number 0–100 (%)    | `brightness`  | 0–100                  | ÷10 / ×10       |
| `29`   | `kelvin`      | number (K)          | `kelvin`      | 0–65000                | pass-through    |
| `31`   | `color`       | `{h, s, v}` decimal | `color`       | `{h 0-360, s/v 0-100}` | ÷10 / ×10       |

## Key files

| File                                                  | Role                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/tools/utils/device-state.utils.ts`               | State decoding — `translateElementAttrs()` switch, `translateDeviceState()`, `extractStateMap()` |
| `src/tools/utils/device-control.utils.ts`             | Control encoding — `ControlAttrs` interface, `buildControlCommands()`                            |
| `src/tools/definitions/control-device-simple.tool.ts` | Zod schema, inputSchema, descriptions                                                            |
| `src/tools/services/tool-executor.service.ts`         | Wires it together — imports utils, calls `buildControlCommands`, sends commands                  |
