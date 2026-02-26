# Device State Guide for AI Agents

> **Purpose**: Understand how to read and interpret device state information. This is essential for verifying control commands and understanding device capabilities.

---

## Overview

Device state tells you:

- ✅ **Current values** of all attributes (is the light on? what's the brightness?)
- ✅ **Which attributes are supported** (does this device support brightness? color?)
- ✅ **Which elements exist** (is this a 1-button or 4-button switch?)
- ✅ **Whether control commands worked** (did the light actually turn on?)

---

## State Structure

### Basic Format

```json
{
  "state": {
    "ELEMENT_ID": {
      "ATTRIBUTE_ID": [ATTRIBUTE_ID, VALUE1, VALUE2, ...]
    }
  }
}
```

**Key concepts:**

- **ELEMENT_ID** (string): Which part of the device (e.g., "1", "2", "3", "4" for a 4-button switch)
- **ATTRIBUTE_ID** (string): Which property (e.g., "1" for ON_OFF, "28" for BRIGHTNESS)
- **Value array**: First element repeats the attribute ID, followed by the actual value(s)

---

## Real Examples

### Example 1: Simple On/Off Switch

```json
{
  "uuid": "switch-123",
  "state": {
    "1": {
      "1": [1, 1]
    }
  }
}
```

**What this means:**

- Element 1 exists
- Attribute 1 (ON_OFF) is supported
- Current value: `1` (ON)

**How to read it:**

- `state["1"]["1"][1]` → `1` = Device is ON
- To check if ON: `state["1"]["1"][1] === 1`
- To check if OFF: `state["1"]["1"][1] === 0`

---

### Example 2: Dimmable Light

```json
{
  "uuid": "light-456",
  "state": {
    "1": {
      "1": [1, 1],
      "28": [28, 750]
    }
  }
}
```

**What this means:**

- Element 1 exists
- Supports both ON_OFF (attribute 1) and BRIGHTNESS (attribute 28)
- Currently ON with 75% brightness

**How to read it:**

- `state["1"]["1"][1]` → `1` = Light is ON
- `state["1"]["28"][1]` → `750` = Brightness is 750/1000 (75%)

---

### Example 3: RGB Light

```json
{
  "uuid": "rgb-light-789",
  "state": {
    "1": {
      "1": [1, 1],
      "31": [31, 1800, 800, 600]
    }
  }
}
```

**What this means:**

- Light is ON
- Color set via HSV (attribute 31)
- Hue: 180° (cyan)
- Saturation: 80%
- Value: 60%

**How to read it:**

- `state["1"]["31"][1]` → `1800` = Hue (180°, cyan)
- `state["1"]["31"][2]` → `800` = Saturation (80%)
- `state["1"]["31"][3]` → `600` = Value/Brightness (60%)

---

### Example 4: Multi-Button Switch (4 Buttons)

```json
{
  "uuid": "switch-4btn",
  "state": {
    "1": { "1": [1, 1] },
    "2": { "1": [1, 0] },
    "3": { "1": [1, 1] },
    "4": { "1": [1, 0] }
  }
}
```

**What this means:**

- 4 elements (4 buttons)
- Button 1: ON
- Button 2: OFF
- Button 3: ON
- Button 4: OFF

**How to read it:**

```typescript
const isButton1On = state['1']['1'][1] === 1; // true
const isButton2On = state['2']['1'][1] === 1; // false
const isButton3On = state['3']['1'][1] === 1; // true
const isButton4On = state['4']['1'][1] === 1; // false
```

---

### Example 5: Air Conditioner

```json
{
  "uuid": "ac-101",
  "state": {
    "1": {
      "1": [1, 1],
      "17": [17, 1],
      "19": [19, 2],
      "20": [20, 24]
    }
  }
}
```

**What this means:**

- AC is ON (attribute 1)
- Mode: COOLING (attribute 17, value 1)
- Fan speed: NORMAL (attribute 19, value 2)
- Temperature: 24°C (attribute 20, value 24)

**How to read it:**

```typescript
const isOn = state['1']['1'][1] === 1; // true
const mode = state['1']['17'][1]; // 1 (COOLING)
const fanSpeed = state['1']['19'][1]; // 2 (NORMAL)
const temp = state['1']['20'][1]; // 24
```

---

## How to Use State in Your Code

### Use Case 1: Check Before Controlling

```typescript
// Get current state
const device = await use_mcp_tool('get_device_state', {
  uuid: 'light-123',
});

// Check if already in desired state
if (device.state['1']['1'][1] === 1) {
  console.log('Light is already ON, no need to send command');
} else {
  // Turn it on
  await use_mcp_tool('control_device_simple', {
    uuid: 'light-123',
    elementIds: [1],
    action: 'on',
  });
}
```

---

### Use Case 2: Verify Control Command Worked

```typescript
// Send command
await use_mcp_tool('control_device_simple', {
  uuid: 'light-123',
  elementIds: [1],
  action: 'on',
});

// Wait 2-3 seconds for device to respond
await sleep(2000);

// Verify
const newState = await use_mcp_tool('get_device_state', {
  uuid: 'light-123',
});

if (newState.state['1']['1'][1] === 1) {
  console.log('✅ Successfully turned on');
} else {
  console.log('❌ Command failed or device offline');
}
```

---

### Use Case 3: Determine Device Capabilities

```typescript
const device = await use_mcp_tool('get_device_state', {
  uuid: 'unknown-device',
});

const elementState = device.state['1'];

// Check which attributes are supported
const supportedAttributes = Object.keys(elementState);

if (supportedAttributes.includes('28')) {
  console.log('✅ Device supports BRIGHTNESS');
}

if (supportedAttributes.includes('29')) {
  console.log('✅ Device supports COLOR_TEMPERATURE');
}

if (supportedAttributes.includes('31')) {
  console.log('✅ Device supports RGB COLOR');
}
```

---

### Use Case 4: Read Multi-Element States

```typescript
const device = await use_mcp_tool('get_device_state', {
  uuid: 'switch-4btn',
});

// Get all element IDs
const elementIds = Object.keys(device.state);
console.log(`Device has ${elementIds.length} elements`);

// Check state of each element
elementIds.forEach((elementId) => {
  const isOn = device.state[elementId]['1'][1] === 1;
  console.log(`Element ${elementId}: ${isOn ? 'ON' : 'OFF'}`);
});

// Result:
// Element 1: ON
// Element 2: OFF
// Element 3: ON
// Element 4: OFF
```

---

## State Array Format Details

State values are **always arrays** with the following pattern:

```
[ATTRIBUTE_ID, VALUE1, VALUE2, ...]
```

**Single-value attributes** (most common):

```json
"1": [1, 1]          // ON_OFF: [attr_id, on/off]
"28": [28, 750]      // BRIGHTNESS: [attr_id, brightness_value]
"20": [20, 24]       // TEMP_SET: [attr_id, temperature]
```

**Multi-value attributes**:

```json
"30": [30, 500, 4000]       // BRIGHTNESS_KELVIN: [attr_id, brightness, kelvin]
"31": [31, 1800, 800, 600]  // COLOR_HSV: [attr_id, hue, saturation, value]
"257": [257, 1, 1, 24, 2, 0] // AC: [attr_id, on/off, mode, temp, fan, swing]
```

**Why the first element repeats the attribute ID?**

- It's the format from the IoT protocol
- Always skip it and read from index `[1]` onwards

---

## Common Attribute IDs and Their Value Meanings

| Attribute | Name              | Value Index     | Meaning                                          |
| --------- | ----------------- | --------------- | ------------------------------------------------ |
| `1`       | ON_OFF            | `[1]`           | `0`=Off, `1`=On                                  |
| `2`       | OPEN_CLOSE        | `[1]`           | `0`=Close, `1`=Open                              |
| `3`       | LOCK_UNLOCK       | `[1]`           | `0`=Lock, `1`=Unlock                             |
| `17`      | MODE              | `[1]`           | `0`=Auto, `1`=Cool, `2`=Dry, `3`=Heat, `4`=Fan   |
| `18`      | FAN_SWING         | `[1]`           | `0`=Auto, `255`=Off                              |
| `19`      | FAN_SPEED         | `[1]`           | `0`=Auto, `1`=Low, `2`=Normal, `3`=High, `4`=Max |
| `20`      | TEMP_SET          | `[1]`           | Temperature in Celsius (15-30)                   |
| `28`      | BRIGHTNESS        | `[1]`           | Brightness level (0-1000)                        |
| `29`      | KELVIN            | `[1]`           | Color temperature (0-65000K)                     |
| `30`      | BRIGHTNESS_KELVIN | `[1], [2]`      | Brightness (0-1000), Kelvin (0-65000)            |
| `31`      | COLOR_HSV         | `[1], [2], [3]` | Hue (0-3600), Sat (0-1000), Val (0-1000)         |

---

## Full Device State Example

Here's a complete device object with all fields:

```json
{
  "uuid": "507f1f77bcf86cd799439011",
  "name": "Living Room RGB Light",
  "location": {
    "id": "507f191e810c19729de860ea",
    "name": "Living Room"
  },
  "elements": [{ "id": 1, "name": "Main Light" }],
  "state": {
    "1": {
      "1": [1, 1],
      "28": [28, 800],
      "31": [31, 2400, 900, 700]
    }
  }
}
```

**Reading this:**

- Device UUID: `507f1f77bcf86cd799439011` (MongoDB _id format)
- Located in: Living Room
- Has 1 element (single light)
- **Current state:**
  - ✅ ON (`state["1"]["1"][1]` = 1)
  - ✅ Brightness: 80% (`state["1"]["28"][1]` = 800)
  - ✅ Color: Hue 240° (blue), Sat 90%, Val 70% (`state["1"]["31"]` = [31, 2400, 900, 700])
---

## Key Takeaways for AI Agents

### ✅ Always Do

1. **Check state before controlling** - Avoid unnecessary commands if already in desired state
2. **Verify after controlling** - Wait 2-3 seconds, then check state to confirm
3. **Use state to discover capabilities** - Check which attributes exist to know what commands are valid
4. **Handle multi-element devices** - Iterate through all element IDs when needed

### ❌ Never Do

1. Don't assume all devices have the same attributes - always check state first
2. Don't forget the `[1]` index - values start at index 1, not 0
3. Don't skip verification - state is the only way to confirm control commands worked
4. Don't confuse element IDs with attribute IDs - they're different concepts

### 🔍 Quick Reference

```typescript
// Get device state
const device = await get_device_state({ uuid: 'device-id' });

// Access pattern:
device.state[ELEMENT_ID][ATTRIBUTE_ID][VALUE_INDEX];

// Common checks:
const isOn = device.state['1']['1'][1] === 1;
const brightness = device.state['1']['28'][1];
const temp = device.state['1']['20'][1];

// List all elements:
const elements = Object.keys(device.state);

// Check if attribute supported:
const hasBrightness = '28' in device.state['1'];
```

---

## Summary

**Device state is your source of truth.** Always read it to:

- Know the current values
- Discover capabilities
- Verify commands worked
- Decide what to do next

**The state structure is simple:**

```
state → element ID → attribute ID → [attr_id, value1, value2, ...]
```

**Read values from index `[1]` onwards.**
