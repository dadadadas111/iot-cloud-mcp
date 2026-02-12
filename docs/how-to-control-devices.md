
# Device Control API Guide

This document describes how to control IoT devices using the **Device Control API**, including request structure, required fields, and how to determine valid control commands.

---

## 1. API Endpoint

**Method:** `POST`  
**URL:**
### Staging: 
```
https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/control/device
```

### Production:
```
https://openapi.rogo.com.vn/api/v2.0/iot-core/control/device
```
---

## 2. Example Request

```bash
curl -X POST \
  'https://staging.openapi.rogo.com.vn/api/v2.0/iot-core/control/device' \
  -H 'accept: */*' \
  -H 'x-header-apikey: xxx' \
  -H 'Content-Type: application/json' \
  -d '{
    "eid": 12345,
    "elementIds": [1, 2],
    "command": [1, 0, 1, 2],
    "endpoint": "example",
    "partnerId": "rogo",
    "rootUuid": "66d92670359ed4c531244b61",
    "protocolCtl": 123
  }'
```

---

## 3. Request Payload Structure

```json
{
  "eid": number,
  "elementIds": number[],
  "command": number[],
  "endpoint": string,
  "partnerId": string,
  "rootUuid": string,
  "protocolCtl": number
}
```

---

## 4. Field Definitions

### 4.1 `eid` (Required)

- Identifies **which device** is being controlled.
    
- Each _root device_ defines its own internal addressing mechanism, and `eid` is the identifier used by that root.
    
- The value of `eid` **must be retrieved from the Get Device API response**.
    

> The API determines the target device **based on `eid`, not `deviceUuid`**.

---

### 4.2 `rootUuid` (Required)

- UUID of the **root device**.
    
- If the target device is **not** the root, you **must** use the `rootUuid` provided by the Get Device API.
    
- If `rootUuid` is **not present** in the Get Device API response, then the device **is its own root** and its UUID should be used.
    

⚠️ **Important Note**  
To control device **A**, you do **not** always use device A’s UUID directly.  
You must use the `rootUuid` associated with device A from the Get Device API response.

---

### 4.3 `elementIds`

- List of **element IDs (ELM)** to be controlled.
    
- A single device may contain multiple elements.
    
- Example:
    
    - A multi-button switch
        
    - A device with multiple channels or endpoints
        

---

### 4.4 `command`

- Defines the control command sent to the device.
    
- Format:
    
    ```text
    [attr, value, value, ...]
    ```
    

Where:

- `attr` — Attribute identifier
    
- `value` — One or more values associated with that attribute
    

---

### 4.5 `endpoint`
    

---

### 4.6 `partnerId`
    

---

### 4.7 `protocolCtl`
    

---

## 5. How to Determine Valid Attributes and Values

The API does **not** validate attribute semantics automatically.  
To build a valid `command`, you must reference the attribute definitions for the specific device type.

All supported attributes and value formats are documented here:

docs\device-attr-and-control.csv

---

## 6. Key Notes & Best Practices

- Always retrieve **`eid`, `rootUuid`, and element information** from the **Get Device API** before sending control commands.
    
- Do **not** assume:
    
    - Device UUID = root UUID
        
    - Attribute IDs are shared across device types
        
- Incorrect `rootUuid` or `eid` will result in the command being routed incorrectly or rejected.
    
## 7. Command Execution Semantics and Limitations

### 7.1 Command Validation Behavior

* This API **does not perform validation** to verify whether:

	* The specified device exists

	* The `eid` is valid

	* The `elementIds` are valid

	* The `command` is semantically correct for the device

* The API **only builds a command message** based on the provided request payload and forwards it to the messaging layer.

---

### 7.2 Meaning of a Successful API Response

* A successful API response **only indicates that the command message was successfully published via MQTT**.

* It **does NOT guarantee** that:

	* Any device received the message

	* The target device was online

	* The command was executed successfully

	* The device state actually changed

---

### 7.3 How to Verify Command Effectiveness

To determine whether a control command actually affected a device, you must verify it **indirectly** using one of the following methods:

1. **Monitor State Changes via Data Streaming Service**

* Subscribe to state messages from the Data Streaming Agent.

* Confirm that the expected state change event is received after issuing the command.

2. **Query Device State via Get State API**

* Call the Get State API for the target device.

* Compare the device state before and after issuing the command.
