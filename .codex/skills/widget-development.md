# Widget Development Skill

Quick-reference for building ChatGPT/Claude interactive widgets for the Rogo IoT Cloud MCP server.

## Overview

Widgets are **self-contained HTML+CSS+JS files** served via MCP resources. They render inside the AI's chat interface as interactive UI components.

```
ChatGPT/Claude iframe
    │
    ▼
┌─────────────────────────────────────┐
│  MCP Resource (text/html)            │
│  → device-dashboard.html            │
│  → WidgetService.readStaticHtml()   │
│  → Injects window.__I18N__          │
└─────────────────────────────────────┘
    │
    ▼ (via iframe bridge)
┌─────────────────────────────────────┐
│  Widget JavaScript                  │
│  → Reads window.openai.toolOutput   │
│  → Listens for postMessage          │
│  → Renders UI from data             │
└─────────────────────────────────────┘
```

## Widget Architecture

### File Structure

```
views/widgets/
├── device-dashboard.html    # Main widget (self-contained HTML+CSS+JS)
├── locations.html          # Future widget example
└── locales/
    ├── en.json             # English translations
    └── vi.json             # Vietnamese translations
```

### Required Components

1. **HTML**: Self-contained, no external dependencies
2. **CSS**: Use CSS custom properties for theming (see Dark Mode section)
3. **JS**: IIFE pattern with data bridge (see Data Bridge section)
4. **MCP Resource**: Register in `src/resources/definitions/`

### Widget Template (Minimal)

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Widget Name</title>
    <style>
      /* Use CSS custom properties for theming */
      :root {
        --ddw-bg-card: #ffffff;
        --ddw-text: #1a1a1a;
        /* ... */
      }
      .ddw-dark {
        --ddw-bg-card: #2d2d2d;
        --ddw-text: #e0e0e0;
        /* ... */
      }
      /* Your widget styles */
    </style>
  </head>
  <body>
    <div id="ddw-root">
      <div class="ddw-loading">
        <div class="ddw-spinner"></div>
        <span>Loading...</span>
      </div>
    </div>

    <script>
            (function () {
              'use strict';

              var root = document.getElementById('ddw-root');

              /* i18n helper */
              var STRINGS = window.__I18N__ || {};
              var _lang = null;
              function t(key) {
                if (!_lang) {
                  _lang = (document.documentElement.lang || 'en').split('-')[0].toLowerCase();
                  if (!STRINGS[_lang]) _lang = 'en';
                }
                return (STRINGS[_lang] && STRINGS[_lang][key]) || (STRINGS.en && STRINGS.en[key]) || key;
              }

              /* Theme detection */
              function applyTheme(theme) {
                var root = document.documentElement;
                if (theme === 'dark') {
                  root.classList.add('ddw-dark');
                } else if (theme === 'light') {
                  root.classList.remove('ddw-dark');
                }
              }
              if (window.openai && window.openai.theme) {
                applyTheme(window.openai.theme);
              }
              window.addEventListener('openai:set_globals', function (event) {
                var globals = event.detail && event.detail.globals;
                if (globals && globals.theme) applyTheme(globals.theme);
              }, { passive: true });

              /* Data bridge */
              function render(data) {
                if (!data) return;
                // Build your widget HTML here
                root.innerHTML = '<div class="ddw-card">...</div>';
              }

              // 1. Try window.openai.toolOutput
              if (window.openai && window.openai.toolOutput) {
                render(window.openai.toolOutput);
              }

              // 2. Listen for postMessage
              window.addEventListener (event) {
      ('message', function          if (event.source !== window.parent) return;
                var msg = event.data;
                if (msg && msg.jsonrpc === '2.0' && msg.method === 'ui/notifications/tool-result') {
                  var sc = msg.params && msg.params.structuredContent;
                  if (sc) render(sc);
                }
              }, { passive: true });

              // 3. Listen for set_globals
              window.addEventListener('openai:set_globals', function (event) {
                var globals = event.detail && event.detail.globals;
                if (globals && globals.toolOutput) render(globals.toolOutput);
              }, { passive: true });
            })();
    </script>
  </body>
</html>
```

## i18n System

### Adding Translations

1. Create `views/widgets/locales/{lang}.json`
2. Add translation key-value pairs
3. Server auto-discovers and injects via `WidgetService.readStaticHtml()`

### Locale File Format

```json
{
  "loading": "Loading...",
  "device_state": "Device State",
  "on": "On",
  "off": "Off",
  "location": "Location",
  "group": "Group",
  "dt_LIGHT": "Light",
  "dt_SWITCH": "Switch",
  "dt_AC": "Air Conditioner"
}
```

### Using Translations in JS

```javascript
// Use the t() helper function
var text = t('device_state');
var onOff = data.power === 1 ? t('on') : t('off');
var deviceType = t('dt_' + deviceTypeEnum); // e.g., "dt_LIGHT"
```

### Adding a New Language

1. Create `views/widgets/locales/{lang}.json`
2. Copy structure from `en.json`
3. Translate all values
4. No code changes needed — WidgetService auto-discovers

## Dark Mode / Theme Support

### CSS Custom Properties Pattern

Define all colors as CSS variables in `:root`, then override in `.ddw-dark`:

```css
:root {
  --ddw-bg-card: #ffffff;
  --ddw-text: #1a1a1a;
  --ddw-text-secondary: rgba(0, 0, 0, 0.5);
  --ddw-border: rgba(0, 0, 0, 0.08);
  /* ... all colors */
}

.ddw-dark {
  --ddw-bg-card: #2d2d2d;
  --ddw-text: #e0e0e0;
  --ddw-text-secondary: rgba(255, 255, 255, 0.6);
  --ddw-border: rgba(255, 255, 255, 0.1);
  /* ... dark values */
}
```

### OS Preference Fallback

```css
@media (prefers-color-scheme: dark) {
  :root:not(.ddw-light) {
    /* Same dark values as .ddw-dark */
  }
}
```

### JS Theme Detection

```javascript
function applyTheme(theme) {
  var root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('ddw-dark');
  } else if (theme === 'light') {
    root.classList.remove('ddw-dark');
  }
}

// Read initial theme
if (window.openai && window.openai.theme) {
  applyTheme(window.openai.theme);
}

// Listen for changes
window.addEventListener(
  'openai:set_globals',
  function (event) {
    var globals = event.detail && event.detail.globals;
    if (globals && globals.theme) applyTheme(globals.theme);
  },
  { passive: true },
);
```

### Preview with Theme

Access preview at: `GET /widgets/preview/{widget-name}?theme=dark`

Example:

```
http://localhost:3001/widgets/preview/device-dashboard?lang=vi&theme=dark
```

## Data Bridge

Widgets receive data through three mechanisms:

### 1. window.openai.toolOutput (Initial Data)

```javascript
if (window.openai && window.openai.toolOutput) {
  render(window.openai.toolOutput);
}
```

### 2. postMessage (MCP Apps Bridge)

```javascript
window.addEventListener(
  'message',
  function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    // Standard MCP Apps bridge
    if (msg.jsonrpc === '2.0' && msg.method === 'ui/notifications/tool-result') {
      var sc = msg.params && msg.params.structuredContent;
      if (sc) render(sc);
    }
    // Direct pass-through
    if (msg.type === 'tool-result' && msg.structuredContent) {
      render(msg.structuredContent);
    }
  },
  { passive: true },
);
```

### 3. openai:set_globals (Theme + Data Updates)

```javascript
window.addEventListener(
  'openai:set_globals',
  function (event) {
    var globals = event.detail && event.detail.globals;
    if (globals && globals.toolOutput) render(globals.toolOutput);
    if (globals && globals.theme) applyTheme(globals.theme);
  },
  { passive: true },
);
```

## Adding a New Widget

### Step 1: Create Widget HTML

1. Create `views/widgets/{widget-name}.html`
2. Follow the Widget Template above
3. Use CSS custom properties for all colors
4. Implement i18n with `t()` helper

### Step 2: Register MCP Resource

Create `src/resources/definitions/{widget-name}.resource.ts`:

```typescript
import { ResourceDefinition } from '@modelcontextprotocol/sdk/types.js';

export const { widgetName }Resource: ResourceDefinition = {
  uri: 'widget://{widget-name}',
  name: '{Widget Name}',
  description: 'Interactive {widget} widget for ChatGPT',
  mimeType: 'text/html;profile=mcp-app',
};
```

### Step 3: Add to ResourceRegistry

In `src/resources/services/resource-registry.service.ts`:

```typescript
import { widgetName }Resource from '../definitions/{widget-name}.resource';

export class ResourceRegistryService {
  private readonly resources: ResourceDefinition[] = [
    // ... existing resources
    widgetNameResource,
  ];
}
```

### Step 4: Add Preview Route (Optional)

In `src/widgets/widget-preview.controller.ts`:

```typescript
@Get('{widget-name}')
async previewWidget(
  @Query('lang') lang: string,
  @Query('theme') theme: string,
  @Res() res: Response,
): Promise<void> {
  const widgetHtml = await this.widgetService.readStaticHtml('{widget-name}');
  // Inject data and theme as needed
  res.type('text/html').send(widgetHtml);
}
```

### Step 5: Test

```bash
npm run start:dev
# Visit: http://localhost:3001/widgets/preview/{widget-name}?lang=vi&theme=dark
```

## File Locations Reference

| Purpose            | Path                                                  |
| ------------------ | ----------------------------------------------------- |
| Widget HTML        | `views/widgets/{name}.html`                           |
| Locales            | `views/widgets/locales/{lang}.json`                   |
| WidgetService      | `src/widgets/services/widget.service.ts`              |
| Preview Controller | `src/widgets/widget-preview.controller.ts`            |
| Widget Module      | `src/widgets/widgets.module.ts`                       |
| MCP Resources      | `src/resources/definitions/*.resource.ts`             |
| Resource Registry  | `src/resources/services/resource-registry.service.ts` |

## Common Patterns

### Device State Parsing

```javascript
function isElementAttrMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  var keys = Object.keys(obj);
  if (keys.length === 0) return false;
  var first = obj[keys[0]];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return false;
  var innerKeys = Object.keys(first);
  if (innerKeys.length === 0) return false;
  return Array.isArray(first[innerKeys[0]]);
}

function parseState(raw) {
  // Unwrap nested state: { state: { deviceId: { elemId: { attrId: [id, val] } } } }
  var stateObj = raw;
  for (var depth = 0; depth < 5; depth++) {
    if (isElementAttrMap(stateObj)) break;
    if (stateObj.state && typeof stateObj.state === 'object') {
      stateObj = stateObj.state;
      continue;
    }
    // Handle device-ID wrapper
    var topKeys = Object.keys(stateObj);
    if (topKeys.length > 0) {
      var candidate = stateObj[topKeys[0]];
      if (candidate && typeof candidate === 'object' && isElementAttrMap(candidate)) {
        stateObj = candidate;
        break;
      }
    }
    break;
  }
  if (!isElementAttrMap(stateObj)) return null;
  // Parse into elements array...
  return elements;
}
```

### Attribute Rendering

```javascript
var ATTR_NAME_KEYS = {
  1: 'attr_power',
  2: 'attr_open_close',
  3: 'attr_lock',
  28: 'attr_brightness',
  // ...
};

function renderAttr(attrId, values) {
  switch (String(attrId)) {
    case '1': // ON_OFF
      return values[0] === 1 ? t('on') : t('off');
    case '28': // BRIGHTNESS
      return Math.round(values[0] / 10) + '%';
    // ...
  }
}
```

## Testing Checklist

- [ ] Light mode renders correctly
- [ ] Dark mode renders correctly
- [ ] OS preference (`prefers-color-scheme`) works
- [ ] English locale displays correctly
- [ ] Vietnamese locale displays correctly
- [ ] New language (e.g., `?lang=zh`) works without code changes
- [ ] Preview endpoint (`?theme=dark`) works
- [ ] Widget renders inside simulated iframe environment

## OpenAI Apps SDK Reference

- **Docs**: https://developers.openai.com/apps-sdk/build/chatgpt-ui
- **Reference**: https://developers.openai.com/apps-sdk/reference
- **Theme API**: `window.openai.theme` ('light' | 'dark')
- **Event**: `openai:set_globals` → `event.detail.globals.theme`
- **Locale**: `document.documentElement.lang` (set by host)

## Anti-Patterns

- ❌ Don't use external CSS/JS (CDN links)
- ❌ Don't use frameworks (React, Vue, etc.)
- ❌ Don't use `process.env` in widgets (not available in browser)
- ❌ Don't hardcode colors — use CSS custom properties
- ❌ Don't skip i18n — always use `t()` helper
- ❌ Don't forget dark mode — use `.ddw-dark` class
