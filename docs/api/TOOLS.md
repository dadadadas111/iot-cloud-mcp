# MCP Tools Reference

Complete list of available tools in the IoT Cloud MCP Server.

## Tool Count: 14

---

## Authentication (1 tool)

### 1. login

**MUST be called first** to authenticate end-users.

**Input:**

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Output:**

```json
{
  "success": true,
  "message": "Login successful...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user_id": "user-uuid"
}
```

Token is automatically stored in session context for subsequent calls.

---

## Search & Discovery (2 tools)

### 2. search

Search across devices, locations, and groups by keyword. Returns ChatGPT-compatible search results.

**Input:**

```json
{
  "query": "living room"
}
```

**Output:**

```json
{
  "total": 5,
  "locations": [
    {
      "uuid": "6694e3a0093cf477c3122bfd",
      "label": "Living Room",
      "desc": "Main living area",
      "userId": "user-id",
      "extraInfo": {...},
      "createdAt": "2024-07-15T08:53:52.285Z",
      "updatedAt": "2024-07-15T09:55:05.965Z"
    }
  ]
}
```

### 3. fetch

Retrieve complete details by ID (ChatGPT-compatible).

**Input:**

```json
{
  "id": "device:abc-123" // Format: "type:uuid"
}
```

**Output:**

```json
{
  "id": "device:abc-123",
  "title": "Device: Living Room Light",
  "text": "{...full JSON...}",
  "metadata": {...}
}
```

---

## List All Resources (3 tools)

### 4. list_devices

Get ALL devices without filtering.

**Input:**

```json
{}
```

**Output:**

```json
{
  "total": 10,
  "devices": [
    {
      "uuid": "abc-123",
      "label": "Living Room Light",
      "mac": "AA:BB:CC:DD:EE:FF",
      ...
    }
  ]
}
```

### 5. list_locations

Get ALL locations.

**Input:**

```json
{}
```

**Output:**

```json
{
  "total": 5,
  "locations": [
    {
      "_id": "loc-123",
      "label": "Living Room",
      ...
    }
  ]
}
```

### 6. list_groups

Get ALL groups.

**Input:**

```json
{}
```

**Output:**

```json
{
  "total": 3,
  "groups": [
    {
      "uuid": "6694e3a0093cf477c3122c03",
      "label": "Smart Lights",
      "desc": "Office",
      "userId": "user-id",
      "locationId": "location-uuid",
      "type": 0,
      "elementId": 49500,
      "extraInfo": {},
      "createdAt": "2024-07-15T08:53:52.710Z",
      "updatedAt": "2024-07-15T08:53:52.710Z"
    }
  ]
}
```

---

## Device Management (3 tools)

### 7. get_device

Get detailed information about a specific device by UUID.

**Input:**

```json
{
  "uuid": "abc-123"
}
```

**Output:**

```json
{
  "uuid": "abc-123",
  "label": "Living Room Light",
  "mac": "AA:BB:CC:DD:EE:FF",
  "eid": 12345,
  "elementIds": [123, 456],
  "endpoint": "example",
  "partnerId": "rogo",
  "rootUuid": "root-uuid",
  "protocolCtl": 1,
  ...
}
```

### 8. update_device

Update device properties (label, description, location, group).

**Input:**

```json
{
  "uuid": "abc-123",
  "updates": {
    "label": "New Name",
    "desc": "New description"
  }
}
```

**Output:**

```json
{
  "success": true,
  "uuid": "abc-123",
  "updated_fields": ["label", "desc"]
}
```

### 9. delete_device

Delete a device permanently. **Cannot be undone.**

**Input:**

```json
{
  "uuid": "abc-123"
}
```

**Output:**

```json
{
  "success": true,
  "uuid": "abc-123",
  "message": "Device deleted successfully"
}
```

---

## Device State (3 tools)

### 10. get_device_state

Get current state of a specific device by UUID.

**Input:**

```json
{
  "uuid": "abc-123"
}
```

**Output:**

```json
{
  "uuid": "abc-123",
  "mac": "AA:BB:CC:DD:EE:FF",
  "loc": "location-id",
  "devId": "device-id",
  "state": {
    "deviceId": {
      "1": {
        "1": [1, 1], // Element 1: ON_OFF: ON
        "31": [31, 0, 0, 0] // Element 1: COLOR_HSV
      },
      "2": {
        "1": [1, 1], // Element 2: ON_OFF: ON
        "28": [28, 700] // Element 2: BRIGHTNESS: 700
      }
    }
  },
  "updatedAt": "2026-02-12T10:00:00Z"
}
```

**State Structure:**

- `state[deviceId][elementId][attributeId] = [attributeId, ...values]`
- See attribute reference below

### 11. get_location_state

Get states of all devices in a specific location.

**Input:**

```json
{
  "locationUuid": "loc-123" // Use uuid from list_locations
}
```

**Output:** Array of device state objects (same structure as `get_device_state`).

```json
[
  {
    "uuid": "abc-123",
    "mac": "AA:BB:CC:DD:EE:FF",
    "loc": "location-id",
    "state": {...}
  },
  {
    "uuid": "def-456",
    "mac": "11:22:33:44:55:66",
    "loc": "location-id",
    "state": {...}
  }
]
```

### 12. get_device_state_by_mac

Get state of a specific device by MAC address within a location.

**Input:**

```json
{
  "locationUuid": "loc-123",
  "macAddress": "AA:BB:CC:DD:EE:FF"
}
```

**Output:** Single device state object.

---

## Device Control (2 tools)

### 13. control_device

Send raw control commands to a device.

**Input:**

```json
{
  "uuid": "abc-123",
  "elementIds": [123, 456],
  "command": [1, 1] // [attributeId, value, ...]
}
```

**Command Examples:**

- `[1, 1]` - Turn ON (ON_OFF=1, value=1)
- `[1, 0]` - Turn OFF (ON_OFF=1, value=0)
- `[28, 700]` - Set brightness to 700 (BRIGHTNESS=28)
- `[29, 45000]` - Set kelvin to 45000 (KELVIN=29)
- `[20, 22]` - Set AC temperature to 22°C (TEMP_SET=20)
- `[17, 1]` - Set AC to COOLING mode (MODE=17, value=1)

**Output:**

```json
{
  "success": true,
  "device": {
    "uuid": "abc-123",
    "label": "Living Room Light",
    "mac": "AA:BB:CC:DD:EE:FF"
  },
  "command_sent": {
    "elementIds": [123, 456],
    "command": [1, 1]
  },
  "note": "Control command published to MQTT. Device state change is not guaranteed - check device state after a few seconds.",
  "response": {...}
}
```

**Important Notes:**

- Must get device details first to retrieve control parameters
- Command format: `[attributeId, value, attributeId2, value2, ...]`
- API only publishes MQTT message - doesn't validate or guarantee device state change
- Check device state after 2-3 seconds to verify

### 14. control_device_simple

Simplified control for common operations. Easier than `control_device`.

**Input:**

```json
{
  "uuid": "abc-123",
  "action": "turn_on", // or: turn_off, set_brightness, set_kelvin, set_temperature, set_mode
  "value": 700, // Optional: for set_* actions
  "elementId": 123 // Optional: controls all elements if not specified
}
```

**Available Actions:**

| Action            | Description           | Value Range                        |
| ----------------- | --------------------- | ---------------------------------- |
| `turn_on`         | Turn device ON        | N/A                                |
| `turn_off`        | Turn device OFF       | N/A                                |
| `set_brightness`  | Set brightness level  | 0-1000                             |
| `set_kelvin`      | Set color temperature | 0-65000                            |
| `set_temperature` | Set AC temperature    | 15-30 (°C)                         |
| `set_mode`        | Set AC mode           | 0-4 (AUTO/COOLING/DRY/HEATING/FAN) |

**Examples:**

```json
// Turn on all elements
{"uuid": "abc-123", "action": "turn_on"}

// Set brightness of specific element
{"uuid": "abc-123", "action": "set_brightness", "value": 700, "elementId": 123}

// Set AC temperature
{"uuid": "abc-123", "action": "set_temperature", "value": 22}

// Set AC to COOLING mode
{"uuid": "abc-123", "action": "set_mode", "value": 1}
```

**Output:** Same structure as `control_device`.

---

## Attribute Reference

Common device attributes (from `device-attr-and-control.csv`):

### Lights

| Attribute         | ID  | Values                               | Example                |
| ----------------- | --- | ------------------------------------ | ---------------------- |
| ON_OFF            | 1   | 0 (Off), 1 (On)                      | `[1, 1]`               |
| BRIGHTNESS        | 28  | 0-1000                               | `[28, 700]`            |
| KELVIN            | 29  | 0-65000                              | `[29, 45000]`          |
| BRIGHTNESS-KELVIN | 30  | [brightness, kelvin]                 | `[30, 500, 40000]`     |
| COLOR_HSV         | 31  | [hue 0-3600, sat 0-1000, val 0-1000] | `[31, 1800, 800, 600]` |

### Switches

| Attribute | ID  | Values          | Example  |
| --------- | --- | --------------- | -------- |
| ON_OFF    | 1   | 0 (Off), 1 (On) | `[1, 1]` |

### Door/Gate

| Attribute  | ID  | Values              | Example  |
| ---------- | --- | ------------------- | -------- |
| OPEN_CLOSE | 2   | 0 (Close), 1 (Open) | `[2, 1]` |

### Door Lock

| Attribute   | ID  | Values               | Example  |
| ----------- | --- | -------------------- | -------- |
| LOCK_UNLOCK | 3   | 0 (Lock), 1 (Unlock) | `[3, 1]` |

### Air Conditioner

| Attribute     | ID  | Values                                                         | Example                 |
| ------------- | --- | -------------------------------------------------------------- | ----------------------- |
| MODE          | 17  | 0 (AUTO), 1 (COOLING), 2 (DRY), 3 (HEATING), 4 (FAN)           | `[17, 1]`               |
| FAN_SWING     | 18  | 0 (Auto), 255 (Off)                                            | `[18, 0]`               |
| FAN_SPEED     | 19  | 0 (Auto), 1 (Low), 2 (Normal), 3 (High), 4 (Max), 255 (Custom) | `[19, 3]`               |
| TEMP_SET      | 20  | 15-30 (°C)                                                     | `[20, 22]`              |
| AC (Combined) | 257 | [on/off, mode, temp, fan, swing]                               | `[257, 1, 1, 24, 2, 0]` |

### IR Remote

| Attribute | ID  | Values        | Description                                     |
| --------- | --- | ------------- | ----------------------------------------------- |
| IR_SE     | 82  | 0-68, 256-258 | IR button codes (0-9, POWER, VOL_UP/DOWN, etc.) |

---

## Usage Examples

### Example 1: Login and List Devices

```json
// Step 1: Login
{"tool": "login", "email": "user@example.com", "password": "pass123"}

// Step 2: List all devices
{"tool": "list_devices"}
```

### Example 2: Control a Light

```json
// Step 1: Login (already done)

// Step 2: Turn on light
{"tool": "control_device_simple", "uuid": "abc-123", "action": "turn_on"}

// Step 3: Set brightness
{"tool": "control_device_simple", "uuid": "abc-123", "action": "set_brightness", "value": 700}

// Step 4: Check state (wait 2-3 seconds)
{"tool": "get_device_state", "uuid": "abc-123"}
```

### Example 3: Control Air Conditioner

```json
// Turn on AC and set to 22°C cooling
{
  "tool": "control_device",
  "uuid": "ac-uuid",
  "elementIds": [123],
  "command": [257, 1, 1, 22, 2, 0]
}
// Command breakdown: [257=AC, 1=ON, 1=COOLING, 22=temp, 2=normal fan, 0=auto swing]

// Or use simple command:
{"tool": "control_device_simple", "uuid": "ac-uuid", "action": "set_temperature", "value": 22}
{"tool": "control_device_simple", "uuid": "ac-uuid", "action": "set_mode", "value": 1}
```

### Example 4: Search and Fetch

```json
// Search for devices
{"tool": "search", "query": "living room"}

// Fetch specific device details
{"tool": "fetch", "id": "device:abc-123"}
```

---

## Error Handling

All tools return error information in this format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Failed to control device: Device not found"
    }
  ],
  "isError": true
}
```

Common errors:

- **"Authentication required"** - Must call `login` tool first
- **"Device not found"** - Invalid UUID or device doesn't exist
- **"Missing required control fields"** - Device lacks eid/endpoint/partnerId/protocolCtl
- **"Value must be between X and Y"** - Invalid parameter value for control command

---

## Best Practices

### 1. Always Login First

```json
{"tool": "login", ...}
```

### 2. Get Device Details Before Control

```json
// Good: Get device first
{"tool": "get_device", "uuid": "abc-123"}
{"tool": "control_device", ...}

// Also works: control_device fetches details automatically
{"tool": "control_device", ...}
```

### 3. Wait Before Checking State

Control commands are asynchronous (MQTT). Wait 2-3 seconds before checking state.

### 4. Use Simple Commands When Possible

```json
// Easier
{"tool": "control_device_simple", "uuid": "abc-123", "action": "turn_on"}

// vs Manual
{"tool": "control_device", "uuid": "abc-123", "elementIds": [123], "command": [1, 1]}
```

### 5. Handle Control Uncertainty

The control API only publishes MQTT messages - it doesn't guarantee device state changes. Always verify state after control commands.

---

## Endpoints Reference

### State Endpoints

- `GET /iot-core/state/devId/{deviceUuid}` - Single device state by UUID
- `GET /iot-core/state/{locationUuid}` - All device states in a location
- `GET /iot-core/state/{locationUuid}/{macAddress}` - Single device state by MAC address

### Control Endpoint

- `POST /iot-core/control/device` - Send control command

**Control Payload:**

```json
{
  "eid": 12345,
  "elementIds": [123, 456],
  "command": [1, 1],
  "endpoint": "example",
  "partnerId": "rogo",
  "rootUuid": "device-root-uuid",
  "protocolCtl": 123
}
```

All control fields are retrieved automatically from device details.
