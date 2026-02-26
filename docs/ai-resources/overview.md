# IoT Cloud MCP Bridge - Overview

> **For AI Agents**: This explains what you need to know to use the MCP tools for controlling IoT devices.

---

## What Can You Do?

1. **Control devices** - Turn lights on/off, adjust brightness, control AC, etc.
2. **Read device state** - Check if lights are on, get current temperature, etc.
3. **Query device info** - See which devices exist, what they can do

---

## Core Concepts

### Device

A **device** is any IoT hardware you can control.

**Examples**: Light bulb, wall switch, AC unit, smart lock, gate controller

**Each device has**:

- `uuid` - Unique ID (MongoDB \_id format: 24 hex characters)
- `name` - Human-readable name like "Living Room Light"
- `elements` - Physical parts you can control
- `state` - Current status of all attributes

---

### Element

An **element** is a physical part of a device you can control separately.

**Examples**:

- Single light bulb = **1 element**
- 4-button wall switch = **4 elements** (one per button)
- Dual-light fixture = **2 elements** (one per bulb)

**Each element has**:

- `id` - Number like 1, 2, 3, 4
- `name` - Human-readable name like "Button 1"

**Example device**:

```json
{
  "uuid": "507f1f77bcf86cd799439011",
  "name": "Living Room Switch",
  "elements": [
    { "id": 1, "name": "Button 1" },
    { "id": 2, "name": "Button 2" },
    { "id": 3, "name": "Button 3" },
    { "id": 4, "name": "Button 4" }
  ]
}
```

---

### Attribute

An **attribute** is a property you can control or read.

**Common attributes**:

| ID  | Name        | What It Does      | Values                               |
| --- | ----------- | ----------------- | ------------------------------------ |
| 1   | ON_OFF      | Turn on/off       | 0=OFF, 1=ON                          |
| 28  | BRIGHTNESS  | Light brightness  | 0-1000 (0=off, 1000=max)             |
| 29  | KELVIN      | Color temperature | 0-65000 Kelvin                       |
| 20  | TEMP_SET    | AC temperature    | 15-30 °C                             |
| 17  | MODE        | AC mode           | 0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN |
| 2   | OPEN_CLOSE  | Gate/door         | 0=CLOSE, 1=OPEN                      |
| 3   | LOCK_UNLOCK | Lock              | 0=LOCK, 1=UNLOCK                     |

**Not all devices have all attributes.** Check the device's state to see what it supports.

---

### State

**State** shows the current value of all attributes for all elements.

**Format**:

```json
{
  "state": {
    "ELEMENT_ID": {
      "ATTRIBUTE_ID": [ATTRIBUTE_ID, VALUE1, VALUE2, ...]
    }
  }
}
```

**Example - Simple light (ON with 70% brightness)**:

```json
{
  "state": {
    "1": {
      "1": [1, 1], // Element 1, Attribute 1 (ON_OFF) = ON
      "28": [28, 700] // Element 1, Attribute 28 (BRIGHTNESS) = 700
    }
  }
}
```

**What this tells you**:

- Element 1 exists
- It supports ON_OFF and BRIGHTNESS
- Currently: ON, brightness = 700/1000 (70%)

---

### Command

A **command** tells a device what to do.

**Format**: `[ATTRIBUTE_ID, VALUE1, VALUE2, ...]`

**Examples**:

```json
[1, 1]                    // Turn ON (attribute 1, value 1)
[1, 0]                    // Turn OFF (attribute 1, value 0)
[28, 700]                 // Set brightness to 700 (attribute 28)
[257, 1, 1, 24, 2, 0]     // AC: ON, COOLING, 24°C, NORMAL fan, AUTO swing
```

---

## Available Tools

### 1. get_device_state

**What it does**: Get device info and current state

**Parameters**:

- `uuid` (required) - Device ID

**Returns**:

- Device metadata (name, type)
- `elements` array - Physical parts
- `state` object - Current values

**Example**:

```typescript
const device = await get_device_state({
  uuid: '507f1f77bcf86cd799439011',
});

// device.elements → [{ id: 1, name: "Light" }]
// device.state → { "1": { "1": [1, 1] } }
```

---

### 2. control_device_simple

**What it does**: Control devices with simple action names

**Parameters**:

- `uuid` (required) - Device ID
- `action` (required) - What to do: `turn_on`, `turn_off`, `set_brightness`, `set_kelvin`, `set_temperature`, `set_mode`
- `value` (optional) - For `set_*` actions
- `elementId` (optional) - Control specific element

**Examples**:

```typescript
// Turn on
control_device_simple({ uuid: 'xxx', action: 'turn_on' });

// Set brightness to 70%
control_device_simple({ uuid: 'xxx', action: 'set_brightness', value: 700 });

// Control only button 2 of a switch
control_device_simple({ uuid: 'xxx', action: 'turn_off', elementId: 2 });
```

---

### 3. control_device

**What it does**: Control devices with precise commands

**Parameters**:

- `uuid` (required) - Device ID
- `elementIds` (required) - Array of element IDs to control
- `command` (required) - Command array

**Examples**:

```typescript
// Turn on elements 1 and 2
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1, 2],
  command: [1, 1],
});

// Set brightness
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1],
  command: [28, 800],
});
```

---

## Field Definitions

### uuid

**Type**: String (24 hex characters)

**Format**: MongoDB \_id like `507f1f77bcf86cd799439011`

**NOT**: Standard UUID format with dashes

**What it is**: Unique identifier for a device

**Used in**: All tools

---

### elementIds

**Type**: Array of numbers

**What it is**: Which physical parts to control

**Examples**:

- `[1]` - Control only element 1
- `[1, 2, 3, 4]` - Control all 4 buttons of a switch
- `[2]` - Control only button 2

**Used in**: `control_device` tool

---

### command

**Type**: Array of numbers

**Format**: `[attributeId, value1, value2, ...]`

**What it is**: The action to perform

**Used in**: `control_device` tool

**Examples**:

- `[1, 1]` - Turn ON
- `[28, 500]` - Set brightness to 500
- `[257, 1, 1, 24, 2, 0]` - AC control

---

## Quick Workflows

### Control a Device (Simple)

```typescript
// 1. Turn on a light
control_device_simple({
  uuid: '507f1f77bcf86cd799439011',
  action: 'turn_on',
});

// 2. Set brightness
control_device_simple({
  uuid: '507f1f77bcf86cd799439011',
  action: 'set_brightness',
  value: 700,
});
```

---

### Control a Device (Advanced)

```typescript
// 1. Get device info (find elements)
const device = await get_device_state({
  uuid: '507f1f77bcf86cd799439011',
});

// 2. Control specific elements
control_device({
  uuid: '507f1f77bcf86cd799439011',
  elementIds: [1, 2], // From device.elements
  command: [1, 1], // Turn ON
});

// 3. Verify (wait 2-3 seconds for MQTT)
await wait(2000);
const newState = await get_device_state({
  uuid: '507f1f77bcf86cd799439011',
});
```

---

### Discover Device Capabilities

```typescript
// Get state to see what device supports
const device = await get_device_state({
  uuid: '507f1f77bcf86cd799439011',
});

// Check state object
console.log(device.state);
// Output:
// {
//   "1": {
//     "1": [1, 1],      // Supports ON_OFF
//     "28": [28, 500],  // Supports BRIGHTNESS
//     "29": [29, 4000]  // Supports KELVIN (color temp)
//   }
// }

// Now you know: This device supports ON_OFF, BRIGHTNESS, and KELVIN
```

---

## Important Notes

### MQTT Timing

**Commands are asynchronous** - they take 1-3 seconds to execute.

**Best practice**: Wait 2-3 seconds after sending a command before checking state.

```typescript
// Send command
await control_device({ uuid: 'xxx', elementIds: [1], command: [1, 1] });

// Wait for MQTT
await wait(2000);

// Now check state
const state = await get_device_state({ uuid: 'xxx' });
```

---

### Multi-Element Devices

**Always check `device.elements`** before controlling multi-element devices.

```typescript
const device = await get_device_state({ uuid: 'xxx' });

// See how many elements
console.log(device.elements);
// [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]

// Control all 4
control_device({ uuid: 'xxx', elementIds: [1, 2, 3, 4], command: [1, 1] });

// Or control just button 2
control_device({ uuid: 'xxx', elementIds: [2], command: [1, 1] });
```

---

## Glossary

| Term            | Meaning                                                  |
| --------------- | -------------------------------------------------------- |
| **uuid**        | Device unique identifier (MongoDB \_id format)           |
| **element**     | Physical part of a device (button, bulb, etc.)           |
| **elementIds**  | Array specifying which elements to control               |
| **attribute**   | Controllable property (ON_OFF, BRIGHTNESS, etc.)         |
| **attributeId** | Number identifying an attribute (1, 28, 29, etc.)        |
| **command**     | Array specifying what action to perform                  |
| **state**       | Current values of all attributes for all elements        |
| **MQTT**        | Message protocol used by IoT devices (async, 1-3s delay) |

---

## Available Resources

Read these for detailed information:

1. **rogo://docs/overview** (this doc) - Core concepts and definitions
2. **rogo://docs/device-attributes** - All attribute IDs and device types
3. **rogo://docs/control-guide** - Step-by-step control workflows
4. **rogo://docs/state-guide** - How to read and interpret state

---

## Quick Reference Card

### Tool Selection

| Need                              | Use This Tool           |
| --------------------------------- | ----------------------- |
| Simple on/off, brightness         | `control_device_simple` |
| Precise control, complex commands | `control_device`        |
| Check current state               | `get_device_state`      |

### Common Attribute IDs

| ID  | Name       | Values                               |
| --- | ---------- | ------------------------------------ |
| 1   | ON_OFF     | 0=OFF, 1=ON                          |
| 28  | BRIGHTNESS | 0-1000                               |
| 29  | KELVIN     | 0-65000                              |
| 20  | TEMP_SET   | 15-30 °C                             |
| 17  | MODE       | 0=AUTO, 1=COOL, 2=DRY, 3=HEAT, 4=FAN |

### UUID Format

✅ Correct: `507f1f77bcf86cd799439011` (24 hex chars, no dashes)

❌ Wrong: `507f1f77-bcf8-6cd7-9943-9011` (UUID with dashes)
