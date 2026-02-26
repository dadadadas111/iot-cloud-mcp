# Device Attributes Reference

> **For AI Agents**: This document provides the complete reference for controlling IoT devices. Use this to understand what commands are available for each device type.

---

## Quick Reference: Common Attributes

| Attribute ID | Name              | Description              | Common Values                                    |
| ------------ | ----------------- | ------------------------ | ------------------------------------------------ |
| `1`          | ON_OFF            | Turn device on/off       | `0` = Off, `1` = On                              |
| `2`          | OPEN_CLOSE        | Open/close action        | `0` = Close, `1` = Open                          |
| `3`          | LOCK_UNLOCK       | Lock/unlock              | `0` = Lock, `1` = Unlock                         |
| `17`         | MODE              | AC mode                  | `0`=Auto, `1`=Cool, `2`=Dry, `3`=Heat, `4`=Fan   |
| `18`         | FAN_SWING         | Fan swing mode           | `0` = Auto, `255` = Off                          |
| `19`         | FAN_SPEED         | Fan speed                | `0`=Auto, `1`=Low, `2`=Normal, `3`=High, `4`=Max |
| `20`         | TEMP_SET          | Temperature setting      | `15-30` (Celsius)                                |
| `28`         | BRIGHTNESS        | Light brightness         | `0-1000` (0=off, 1000=max)                       |
| `29`         | KELVIN            | Color temperature        | `0-65000` (Kelvin)                               |
| `30`         | BRIGHTNESS_KELVIN | Combined brightness+temp | `[brightness, kelvin]`                           |
| `31`         | COLOR_HSV         | RGB color control        | `[hue, saturation, value]`                       |
| `82`         | IR_SE             | IR remote button         | See IR codes below                               |
| `257`        | AC                | Combined AC control      | `[on/off, mode, temp, fan, swing]`               |

---

## Device Types and Their Attributes

### 1. Light

**Basic Light**

```json
{"command": [1, 1]}  // Turn ON
{"command": [1, 0]}  // Turn OFF
```

**Dimmable Light**

```json
{ "command": [28, 700] } // Set brightness to 70%
```

**Color Temperature Light**

```json
{ "command": [29, 4500] } // Set to 4500K (warm white)
```

**Combined Brightness + Temperature**

```json
{ "command": [30, 500, 40000] } // 50% brightness, 4000K
```

**RGB Light**

```json
{ "command": [31, 1800, 800, 600] }
// Hue: 180° (cyan), Saturation: 80%, Value: 60%
```

---

### 2. Switch

```json
{"command": [1, 1]}  // Turn ON
{"command": [1, 0]}  // Turn OFF
```

---

### 3. Gate/Door

```json
{"command": [2, 1]}  // Open
{"command": [2, 0]}  // Close
```

**Gate/Curtain Switch with Lock Button**

```json
{"command": [61952, 1]}         // Enable lock
{"command": [61952, 0]}         // Disable lock
{"command": [61952, 65532, 30]} // Enable lock after 30 seconds
```

---

### 4. Door Lock

```json
{"command": [3, 1]}  // Unlock
{"command": [3, 0]}  // Lock
```

---

### 5. Socket

```json
{"command": [1, 1]}  // Turn ON
{"command": [1, 0]}  // Turn OFF
```

---

### 6. Presence Sensor

```json
{"command": [1, 1]}  // Enable
{"command": [1, 0]}  // Disable
```

---

### 7. Air Conditioner

**Individual Controls**

```json
{"command": [17, 2]}   // Set mode to DRY
{"command": [18, 0]}   // Set swing to Auto
{"command": [19, 3]}   // Set fan speed to High
{"command": [20, 22]}  // Set temperature to 22°C
```

**Combined AC Control (Recommended)**

```json
{ "command": [257, 1, 1, 24, 2, 0] }
// Turn ON, COOLING mode, 24°C, Normal fan, Auto swing
```

**AC Modes:**

- `0` = AUTO
- `1` = COOLING
- `2` = DRY
- `3` = HEATING
- `4` = FAN only

**Fan Speed:**

- `0` = Auto
- `1` = Low
- `2` = Normal
- `3` = High
- `4` = Max
- `255` = Custom

**Swing:**

- `0` = Auto (enabled)
- `255` = Off

---

### 8. IR Remote (IR Remote Control)

Use attribute `82` with button codes:

```json
{"command": [82, 10]}  // POWER button
{"command": [82, 19]}  // OK button
{"command": [82, 16]}  // VOL_UP
```

**IR Button Codes:**

- `0-9` = Number buttons 0-9
- `10` = POWER
- `11` = POWER_ON
- `12` = POWER_OFF
- `13` = CHANNEL_UP
- `14` = CHANNEL_DOWN
- `15` = CHANNEL_LIST
- `16` = VOL_UP
- `17` = VOL_DOWN
- `18` = MUTE
- `19` = OK
- `20` = UP
- `21` = DOWN
- `22` = LEFT
- `23` = RIGHT
- `24` = MENU
- `25` = BACK
- `26` = HOME
- `27` = EXIT
- `28` = INPUT
- `29` = PLAY
- `30` = STOP
- `31` = PAUSE
- `32` = MODE
- `60` = SLEEP
- `61` = SWING
- `62` = SWING_MODE
- `63` = FAN_SPEED
- `64` = FAN_SPEED_UP
- `65` = FAN_SPEED_DOWN
- `66` = TIMING
- `67` = ANION_AC
- `68` = INSECT_REPELLENT
- `256` = LOW
- `257` = MEDIUM
- `258` = HIGH

---

## Important Notes for AI Agents

### ✅ Do's

- Always validate attribute IDs against this reference
- Use the correct value ranges for each attribute
- For AC control, prefer the combined command (257) for efficiency
- For lights, use the specific attribute that matches the capability (don't send KELVIN to a basic on/off light)

### ❌ Don'ts

- Don't mix incompatible attributes (e.g., BRIGHTNESS on a switch)
- Don't exceed value ranges (e.g., brightness > 1000)
- Don't use arbitrary attribute IDs not listed here

### 🔍 When Unsure

1. Check the device's `state` response to see which attributes it reports
2. Match the device type to the appropriate section above
3. Start with basic commands (ON_OFF) before trying advanced features

---

## Command Format

All control commands follow this structure:

```json
{
  "command": [ATTRIBUTE_ID, VALUE1, VALUE2, ...]
}
```

- First element: Attribute ID (from this reference)
- Following elements: Values (number and meaning depend on the attribute)

**Examples:**

- `[1, 1]` = Turn on (single value)
- `[30, 500, 4000]` = Brightness + Kelvin (two values)
- `[31, 1800, 800, 600]` = HSV color (three values)
- `[257, 1, 1, 24, 2, 0]` = AC combined (five values)
