## 2.1 State

### 2.1.1 Message Structure

```json
{
  "states": {
    "$DEVICE_ID": {
      "$ELM": {
        "$ATTR": [
          $ATTR,
          $VALUE
        ],
        "eid": "$EID"
      }
    }
  },
}
```

### 2.1.2 Field Definitions

- **DEVICE_ID**  
    Unique identifier (UUID) of the device.
    
- **ELM (Element)**  
    Logical component of a device.  
    A single device may contain multiple elements.  
    _Example_: A 4-button switch has 4 corresponding elements.
    
- **ATTR (Attribute)**  
    Identifies the property that changes.  
    _Example_: `1` may represent **On / Off**.
    
- **VALUE**  
    The value of the attribute.  
    Can be a single number or an array, depending on the attribute definition.
    
- **states**  
    Represents the full current state of devices after the update.
    

---

### 2.1.3 Example (get list of devices with their states)

```json
[
  {
    "mac": "10003bb6717c",
    "loc": "69549269a3c7b88722fa589e",
    "devId": "6986dc6069db0d32f5c72f0d",
    "from": "6986dc6069db0d32f5c72f0d",
    "state": {
      "6986dc6069db0d32f5c72f0d": {
        "1": {
          "1": [
            1,
            1
          ],
          "31": [
            31,
            0,
            0,
            0
          ]
        },
        "2": {
          "1": [
            1,
            1
          ],
          "31": [
            31,
            20,
            480,
            1000
          ]
        },
        "3": {
          "1": [
            1,
            1
          ],
          "31": [
            31,
            0,
            0,
            0
          ]
        },
        "4": {
          "1": [
            1,
            1
          ],
          "31": [
            31,
            0,
            0,
            0
          ]
        }
      }
    },
    "updatedAt": "2026-02-07T06:32:24.194Z",
    "uuid": "6986dc68ac090e7b342da04f"
  },
  {
    "loc": "69549269a3c7b88722fa589e",
    "mac": "1051dba8b4a8",
    "devId": "69846b7469db0d32f5c71bd0",
    "from": "69846b7469db0d32f5c71bd0",
    "state": {
      "69846b7469db0d32f5c71bd0": {
        "1": {
          "1": [
            1,
            1
          ]
        }
      }
    },
    "updatedAt": "2026-02-07T06:23:54.542Z",
    "uuid": "698539e77d74d1e3405cf670"
  },
  {
    "mac": "ccba975fb854",
    "loc": "69549269a3c7b88722fa589e",
    "devId": "698541ac69db0d32f5c72137",
    "from": "698541ac69db0d32f5c72137",
    "state": {
      "698541ac69db0d32f5c72137": {
        "1": {
          "1": [
            1,
            1
          ]
        }
      }
    },
    "updatedAt": "2026-02-12T07:45:17.368Z",
    "uuid": "698541b77d74d1e3405cf67a"
  },
  {
    "loc": "69549269a3c7b88722fa589e",
    "mac": "ccba9762ae80",
    "devId": "6985986069db0d32f5c72b67",
    "from": "6985986069db0d32f5c72b67",
    "state": {
      "6985986069db0d32f5c72b67": {
        "1": {
          "1": [
            1,
            1
          ],
          "17": [
            17,
            0
          ],
          "18": [
            18,
            0
          ],
          "19": [
            19,
            2
          ]
        },
        "2": {
          "1": [
            1,
            0
          ],
          "28": [
            28,
            1000
          ],
          "29": [
            29,
            4600
          ]
        }
      }
    },
    "updatedAt": "2026-02-12T07:28:44.323Z",
    "uuid": "698598817d74d1e3405cf74a"
  }
]
```

### 2.1.4 Attribute Reference

Detailed definitions of all attributes and their corresponding values can be found here:

docs\device-attr-and-control.csv    