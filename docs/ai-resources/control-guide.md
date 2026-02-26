# Device Control Guide

> **Quick Start**: To control a device, you need: `uuid` (device ID), `elementIds` (which parts), and `command` (what to do).

---

## 2 Ways to Control Devices

### Option 1: Simple Actions (Recommended)

**Tool**: `control_device_simple`

**Use when**: You want common actions like turn on/off, set brightness, etc.

```typescript
// Turn on a light
control_device_simple({
  uuid: '507f1f77bcf86cd799439011',
  action: 'turn_on',
});

// Set brightness to 70%
control_device_simple({
  uuid: '507f1f77bcf86cd799439011',
  action: 'set_brightness',
  value: 700, // 0-1000 scale
});

// Control specific element (for multi-button switches)
control_device_simple({
  uuid: '507f1f77bcf86cd799439011',
  action: 'turn_off',
  elementId: 2, // Only control button 2
});
```

**Available Actions**:

- `turn_on` / `turn_off` - No value needed
- `set_brightness` - Value: 0-1000
- `set_kelvin` - Value: 0-65000 (color temperature)
- `set_temperature` - Value: 15-30 (AC temperature in °C)
- `set_mode` - Value: 0=AUTO, 1=COOLING, 2=DRY, 3=HEATING, 4=FAN

---

### Option 2: Direct Commands (Advanced)

**Tool**: `control_device`

**Use when**: You need precise control with specific attribute IDs.

```typescript
// Turn on elements 1 and 2
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1, 2],
  command: [1, 1], // [attributeId, value]
});

// Set brightness to 80%
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1],
  command: [28, 800], // Attribute 28 = BRIGHTNESS
});

// Control AC (turn on, cooling mode, 24°C, normal fan, auto swing)
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1],
  command: [257, 1, 1, 24, 2, 0], // Attribute 257 = AC combined control
});
```

**Command Format**: `[attributeId, value1, value2, ...]`

See `device-attributes` resource for all attribute IDs.

---

## Step-by-Step Workflow

### Step 1: Get Device Info (Optional but Recommended)

**Why**: Find out which elements exist and what the device supports.

```typescript
const device = await get_device_state({
  uuid: '507f1f77bcf86cd799439011',
});

// Check elements
console.log(device.elements);
// Output: [
//   { id: 1, name: "Button 1" },
//   { id: 2, name: "Button 2" }
// ]

// Check current state
console.log(device.state);
// Output: {
//   "1": { "1": [1, 1] },  // Element 1 is ON
//   "2": { "1": [1, 0] }   // Element 2 is OFF
// }
```

---

### Step 2: Choose Your Tool

**Use `control_device_simple`** if:

- Common action (on/off, brightness, temperature)
- You want simple syntax
- You're not sure about attribute IDs

**Use `control_device`** if:

- Need specific attribute control
- Combining multiple attributes
- Complex device control (AC, RGB lights)

---

### Step 3: Send Command

```typescript
// Simple way
await control_device_simple({
  uuid: '507f1f77bcf86cd799439011',
  action: 'turn_on',
});

// OR advanced way
await control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1],
  command: [1, 1],
});
```

---

### Step 4: Verify (Optional)

**Wait 2-3 seconds** for MQTT to propagate, then check state:

```typescript
await wait(2000);

const newState = await get_device_state({
  uuid: '507f1f77bcf86cd799439011',
});

// Check if command worked
console.log(newState.state['1']['1'][1]); // 1 = ON, 0 = OFF
```

---

## Multi-Element Devices

### What Are Elements?

**Elements** are physical parts of a device:

- **4-button switch** = 4 elements (one per button)
- **Single light** = 1 element
- **Dual-light fixture** = 2 elements

### Controlling All Elements

```typescript
// Turn on ALL buttons in a 4-button switch
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1, 2, 3, 4],
  command: [1, 1],
});
```

### Controlling Specific Elements

```typescript
// Turn on ONLY button 2
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [2],
  command: [1, 1],
});

// Turn on buttons 1 and 3, leave 2 and 4 unchanged
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1, 3],
  command: [1, 1],
});
```

---

## Common Patterns

### Turn Light On/Off

```typescript
// Simple way
control_device_simple({ uuid: 'xxx', action: 'turn_on' });
control_device_simple({ uuid: 'xxx', action: 'turn_off' });

// Direct way
control_device({ uuid: 'xxx', elementIds: [1], command: [1, 1] }); // ON
control_device({ uuid: 'xxx', elementIds: [1], command: [1, 0] }); // OFF
```

---

### Adjust Light Brightness

```typescript
// Simple way
control_device_simple({
  uuid: 'xxx',
  action: 'set_brightness',
  value: 500, // 50% brightness
});

// Direct way
control_device({
  uuid: 'xxx',
  elementIds: [1],
  command: [28, 500], // Attribute 28 = BRIGHTNESS
});
```

---

### Control Air Conditioner

```typescript
// Turn on, set cooling mode, 24°C
control_device_simple({ uuid: 'xxx', action: 'turn_on' });
control_device_simple({ uuid: 'xxx', action: 'set_mode', value: 1 }); // COOLING
control_device_simple({ uuid: 'xxx', action: 'set_temperature', value: 24 });

// OR use combined AC control (attribute 257)
control_device({
  uuid: 'xxx',
  elementIds: [1],
  command: [257, 1, 1, 24, 2, 0],
  // [on/off, mode, temp, fan_speed, swing]
  // 1 = ON, 1 = COOLING, 24°C, 2 = NORMAL fan, 0 = AUTO swing
});
```

---

### Control RGB Light

```typescript
// Set color: Hue 180° (cyan), Saturation 80%, Value 60%
control_device({
  uuid: 'xxx',
  elementIds: [1],
  command: [31, 1800, 800, 600], // Attribute 31 = COLOR_HSV
});
```

---

### Open/Close Gate

```typescript
control_device({ uuid: 'xxx', elementIds: [1], command: [2, 1] }); // OPEN
control_device({ uuid: 'xxx', elementIds: [1], command: [2, 0] }); // CLOSE
```

---

### Control IR Remote

```typescript
// Send IR button code (e.g., power button = code 1)
control_device({
  uuid: 'xxx',
  elementIds: [1],
  command: [82, 1], // Attribute 82 = IR_SE, button code 1
});
```

See `device-attributes` resource for all IR button codes.

---

## Important Rules

### ✅ DO

- **Always provide `uuid`** - Device identifier (MongoDB \_id format)
- **Provide `elementIds`** for `control_device` - Which parts to control
- **Wait 2-3 seconds** after command before checking state (MQTT is async)
- **Check device state first** if unsure about elements or capabilities
- **Use `control_device_simple`** for common actions

### ❌ DON'T

- **Don't check state immediately** - MQTT takes 2-3 seconds to propagate
- **Don't assume element IDs** - Check `get_device_state` first for multi-element devices
- **Don't use wrong attribute IDs** - Refer to `device-attributes` resource
- **Don't confuse element ID with attribute ID** - Element = physical part, Attribute = property

---

## Timing Notes

**Commands are asynchronous** via MQTT:

1. You send command → MCP server receives it
2. MCP server → Cloud → Gateway → Device (takes 1-3 seconds)
3. Device executes → Reports back → Cloud updates state

**Best practice**: Wait 2-3 seconds before calling `get_device_state` to verify.

---

## Troubleshooting

### Command Doesn't Work

1. **Check UUID format** - Should be MongoDB \_id (24 hex chars)
2. **Check elementIds** - Use `get_device_state` to see available elements
3. **Check command format** - See `device-attributes` resource
4. **Wait longer** - MQTT can take 2-3 seconds

### Wrong Element Controlled

- **Double-check elementIds array** - `[1]` controls element 1, `[1,2]` controls both
- **Check device.elements** from `get_device_state` to see element names

### State Not Updated

- **Wait 2-3 seconds** after command
- **MQTT delays** can vary based on network conditions

---

## Quick Reference

### Tool Comparison

| Feature        | control_device_simple            | control_device                    |
| -------------- | -------------------------------- | --------------------------------- |
| **Syntax**     | Simple action names              | Attribute IDs + values            |
| **Parameters** | uuid, action, value?, elementId? | uuid, elementIds, command         |
| **Best for**   | Common actions                   | Precise control, complex commands |
| **Examples**   | `turn_on`, `set_brightness`      | `[1, 1]`, `[28, 700]`             |

### Common Attribute IDs

| ID  | Name          | Values                               |
| --- | ------------- | ------------------------------------ |
| 1   | ON_OFF        | 0=OFF, 1=ON                          |
| 2   | OPEN_CLOSE    | 0=CLOSE, 1=OPEN                      |
| 3   | LOCK_UNLOCK   | 0=LOCK, 1=UNLOCK                     |
| 17  | MODE (AC)     | 0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN |
| 20  | TEMP_SET (AC) | 15-30 °C                             |
| 28  | BRIGHTNESS    | 0-1000                               |
| 29  | KELVIN        | 0-65000                              |
| 31  | COLOR_HSV     | [hue, sat, val]                      |
| 82  | IR_SE         | Button codes                         |
| 257 | AC (combined) | [on, mode, temp, fan, swing]         |

See `device-attributes` resource for complete list.

---

## Related Resources

- **device-attributes** - All attribute IDs, commands, and device types
- **state-guide** - How to read and interpret device state
- **overview** - System concepts and field definitions
