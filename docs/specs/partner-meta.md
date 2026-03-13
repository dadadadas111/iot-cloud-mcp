# Partner Meta — Per-Alias Dynamic Branding

> **Status**: Ready for implementation  
> **Session context**: This spec was written after the alias routing system was already built.  
> Read `AGENTS.md` (root) and `src/alias/` before starting.

---

## Background

The server is multi-tenant via alias routing:  
`{alias}.mcp.dash.id.vn` → nginx → `/mcp/{alias}` → controller resolves alias → actual `projectApiKey`

The alias→apiKey mapping already lives in external Redis (`AliasService`).  
This feature adds a parallel key — **alias-meta** — containing per-partner branding data.

---

## Redis Key

Same external Redis instance, same `ALIAS_REDIS_CLIENT`, same prefix env var — just append `-meta`:

```
{ALIAS_REDIS_KEY_PREFIX}-meta:{alias}  →  JSON string (AliasMeta)
```

**Examples** (with `ALIAS_REDIS_KEY_PREFIX=alias`):

```
alias-meta:acme-corp    →  {"partnerId":"acme-corp","brandName":"Acme Smart Home","domain":"smart home",...}
alias-meta:beta-client  →  {"partnerId":"beta","brandName":"Beta IoT","loginAccentColor":"#2563eb"}
```

---

## AliasMeta Schema

```typescript
interface AliasMeta {
  // Required
  partnerId: string; // Internal identifier, e.g. "acme-corp". Stable, slug-style.
  brandName: string; // Product name shown to users, e.g. "Acme Smart Home"

  // MCP server identity (what AI clients see: Claude, ChatGPT)
  mcpServerName?: string; // Shown in MCP initialize handshake. Default: slugified brandName
  domain?: string; // Interpolated into system prompt template, e.g. "smart home", "office automation", "hospitality". Default: "IoT"

  // OAuth login page (end-user facing)
  loginTitle?: string; // <title> tag + <h1>. Default: brandName
  loginSubtitle?: string; // Subtitle below h1. Default: "Sign in to continue"
  loginLogo?: string; // Emoji string OR absolute https:// URL to an image. Default: "🔐"
  loginAccentColor?: string; // CSS hex color, e.g. "#2563eb". Applied to gradient + focus rings. Default: "#667eea"

  // Widget footer
  widgetFooterText?: string; // Footer label text. Default: brandName
  widgetLogoUrl?: string; // Absolute https:// URL to logo image (max ~24px height). Displayed right side of footer. Default: none (no image shown)
}
```

**Validation rules** (enforce with Zod in the service):

- `partnerId`: required, non-empty string
- `brandName`: required, non-empty string
- `loginAccentColor`: if present, must match `/^#[0-9a-fA-F]{6}$/`
- `widgetLogoUrl` / `loginLogo` (when URL): must start with `https://`
- All other fields: optional strings, no special format

---

## Fallback Chain

**Every field has a safe default.** If meta key doesn't exist in Redis (partner not registered, Redis down, parse error) the server MUST behave exactly as today — zero regression.

```
meta?.field ?? computedDefault(meta?.brandName) ?? HARDCODED_ORIGINAL
```

| Field              | Computed default                               | Hardcoded fallback      |
| ------------------ | ---------------------------------------------- | ----------------------- |
| `mcpServerName`    | `brandName.toLowerCase().replace(/\s+/g, '-')` | `"mcp-gateway"`         |
| `domain`           | —                                              | `"IoT"`                 |
| `loginTitle`       | `brandName`                                    | `"IoT Cloud"`           |
| `loginSubtitle`    | —                                              | `"Sign in to continue"` |
| `loginLogo`        | —                                              | `"🔐"`                  |
| `loginAccentColor` | —                                              | `"#667eea"`             |
| `widgetFooterText` | `brandName`                                    | `"Rogo IoT Cloud"`      |
| `widgetLogoUrl`    | —                                              | _(no logo shown)_       |

---

## New Code to Write

### 1. `src/alias/partner-meta.service.ts` — NEW FILE

```typescript
@Injectable()
export class PartnerMetaService {
  constructor(
    @Inject(ALIAS_REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}

  async getAliasMeta(alias: string): Promise<AliasMeta | null> {
    const prefix = this.configService.get<string>('ALIAS_REDIS_KEY_PREFIX', 'alias');
    const key = `${prefix}-meta:${alias}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AliasMeta;
    } catch {
      this.logger.warn(`Failed to parse alias meta for ${alias}`);
      return null;
    }
  }
}
```

- **Lives in `AliasModule`** — add to `providers` and `exports` alongside `AliasService`
- Reuses `ALIAS_REDIS_CLIENT` — no new Redis connection
- Export `AliasMeta` interface from this file (or a shared `alias-meta.interface.ts`)

---

### 2. `src/alias/alias.module.ts` — MODIFY

Add `PartnerMetaService` to `providers` and `exports`. No other changes — module is already `@Global()`.

---

### 3. `src/mcp/mcp.controller.ts` — MODIFY

The controller already calls `this.aliasService.resolveAlias(alias)` at the top of each handler.

**In `handleMcpPost` only** (session init happens here, not on every request):

```typescript
// After resolving alias → projectApiKey, fetch meta in parallel:
const [projectApiKey, meta] = await Promise.all([
  this.aliasService.resolveAlias(alias, req.body, res),
  this.partnerMetaService.getAliasMeta(alias),
]);
```

Then pass `meta` to `createServer`:

```typescript
const server = this.serverFactory.createServer(projectApiKey, meta ?? undefined);
```

**Inject `PartnerMetaService`** in the constructor. No changes to GET/DELETE handlers — they reuse existing transports, meta was already baked into the server at init time.

> Note: `resolveAlias` currently handles the 404 response internally and returns null. Keep that pattern — if it returns null, return early before the `Promise.all` settles (or handle null check after).

---

### 4. `src/mcp/services/mcp-server.factory.ts` — MODIFY

**Change signature:**

```typescript
createServer(projectApiKey: string, meta?: AliasMeta): McpServer
```

**Server name** (currently `"mcp-gateway-${projectApiKey}"`):

```typescript
const serverName =
  meta?.mcpServerName ??
  (meta?.brandName ? meta.brandName.toLowerCase().replace(/\s+/g, '-') : undefined) ??
  `mcp-gateway-${projectApiKey}`;
```

**System prompt template** (replaces the current hardcoded `instructions` string):

```typescript
function buildInstructions(meta?: AliasMeta): string {
  const brand = meta?.brandName ?? 'IoT Cloud';
  const domain = meta?.domain ?? 'IoT';

  return `${brand} MCP Server — ${domain} device control

Key Concepts:
- Device: ${domain} hardware (light, switch, AC, lock, gate) identified by UUID
- Element: Physical control point (e.g., 4-button switch has 4 elements)
- Attribute: Controllable property (brightness, color, temperature, etc.)
- UUID format: MongoDB _id (24 hex characters, no dashes)

Getting Started:
1. Read device-attributes MCP resource for detailed attribute/command reference
2. Use get_device_state to discover device capabilities and current values
3. For common actions: control_device_simple (turn_on, set_brightness, etc.)
4. For precise control: control_device with specific attribute elementIds

All device control operations require only: uuid, elementIds (or action), and command/value.`;
}
```

---

### 5. `src/mcp/services/mcp-protocol-handler.service.ts` — MODIFY

`handleInitialize()` currently returns hardcoded `name: 'iot-cloud-mcp-gateway'`.

This service doesn't have direct access to meta — the simplest fix is to pass `serverName` as a parameter to `handleRequest()`:

```typescript
// In handleRequest() context param, add:
context: { authorization?: string; projectApiKey: string; mcpServer?: any; serverName?: string }

// In handleInitialize():
serverInfo: {
  name: context.serverName ?? 'mcp-gateway',
  version: '1.0.0',
}
```

The caller (controller or wherever `handleRequest` is invoked) passes `serverName: meta?.mcpServerName ?? ...`.

> Check how `McpProtocolHandlerService.handleRequest` is called — it may or may not be used alongside the SDK transport. The SDK transport path (`McpServerFactory`) is the primary one; `McpProtocolHandlerService` appears to be a fallback/manual path. Update both if both are reachable.

---

### 6. `src/auth/auth.controller.ts` — MODIFY

`authorize()` currently calls `generateLoginPage(projectApiKey, query)`.

**Inject `PartnerMetaService`**, fetch meta, pass to template:

```typescript
const meta = await this.partnerMetaService.getAliasMeta(projectApiKey);
// Note: at this point, projectApiKey in the auth route IS the alias
// (nginx rewrites {alias}.mcp-stag... → /mcp/{alias}, and auth endpoints follow the same alias)
const html = generateLoginPage(projectApiKey, query, meta ?? undefined);
```

---

### 7. `src/auth/templates/login-page.template.ts` — MODIFY

**Change signature:**

```typescript
export function generateLoginPage(
  projectApiKey: string,
  oauthParams: { ... },
  meta?: AliasMeta,
  error?: string,
): string
```

**Apply meta** (all with fallbacks):

```typescript
const title = meta?.loginTitle ?? meta?.brandName ?? 'IoT Cloud';
const logo = meta?.loginLogo ?? '🔐';
const subtitle = meta?.loginSubtitle ?? 'Sign in to continue';
const accent = meta?.loginAccentColor ?? '#667eea';
// Darken accent by ~20% for gradient end stop (simple: use accent for both, or hardcode offset)
const accentDark = meta?.loginAccentColor ?? '#764ba2';
```

**In the HTML template string**, replace:

- `<title>Sign In - IoT Cloud</title>` → `<title>Sign In - ${title}</title>`
- `#667eea` / `#764ba2` gradient → `${accent}` / `${accentDark}` (in both `body` background and `.submit-btn` background)
- `<h1>🔐 IoT Cloud</h1>` → logo is either emoji or `<img>`:

```typescript
const logoHtml = logo.startsWith('https://')
  ? `<img src="${logo}" alt="${title}" style="max-height:48px;margin-bottom:8px;">`
  : `<span style="font-size:36px;">${logo}</span>`;
```

Then: `<div class="logo">${logoHtml}<h1>${title}</h1><p ...>${subtitle}</p></div>`

---

### 8. Widget — `views/widgets/device-app.html` + `WidgetService` — MODIFY

**Approach**: inject `window.__PARTNER__` alongside the existing `window.__I18N__` injection. Override the locale `footer` key so `t('footer')` picks up the custom text automatically — no changes to the widget's render logic.

#### `src/widgets/services/widget.service.ts`

Change `readStaticHtml(widgetName)` signature to `readStaticHtml(widgetName, meta?)`:

```typescript
async readStaticHtml(widgetName: string, meta?: AliasMeta): Promise<string> {
  // ... existing logic ...

  // Build __PARTNER__ injection
  const partner = {
    footerText: meta?.widgetFooterText ?? meta?.brandName ?? null,
    logoUrl: meta?.widgetLogoUrl ?? null,
  };

  // Override locale footer key if footerText is set
  if (partner.footerText && Object.keys(locales).length > 0) {
    for (const lang of Object.keys(locales)) {
      locales[lang] = { ...locales[lang], footer: partner.footerText };
    }
  }

  // Inject __PARTNER__ alongside __I18N__
  const partnerScript = `<script>window.__PARTNER__=${JSON.stringify(partner)}</script>\n`;
  // Insert after the __I18N__ script (or replace the injection block)
  html = html.replace('<script>', partnerScript + '<script>');

  return html;
}
```

#### `views/widgets/device-app.html` — logo in footer

The footer currently renders: `<div class="ddw-footer"><span class="ddw-footer-text">{t('footer')}</span></div>`

There are **3 places** in the JS render logic that build the footer HTML (lines ~1852, ~1986, ~2269 — confirmed by grep). In all 3, change to:

```javascript
var partnerLogo =
  window.__PARTNER__ && window.__PARTNER__.logoUrl
    ? '<img src="' +
      esc(window.__PARTNER__.logoUrl) +
      '" alt="" style="max-height:20px;opacity:0.7;">'
    : '';
html += '<div class="ddw-footer">';
html += '<span class="ddw-footer-text">' + esc(t('footer')) + '</span>';
html += partnerLogo;
html += '</div>';
```

The footer CSS already has `display:flex; justify-content:space-between` — logo naturally goes to the right. No CSS changes needed.

> Find all 3 occurrences with: `grep -n "ddw-footer" views/widgets/device-app.html`  
> The footer text (`t('footer')`) is automatically overridden by the locale injection above — no JS change needed for text.

---

### 9. Callers of `readStaticHtml` — MODIFY

Find all places that call `widgetService.readStaticHtml(...)` and pass `meta` through. The widget is registered as an MCP resource in `src/resources/` — trace from `resource-registry.service.ts` back to the controller to understand where `meta` needs to be threaded through.

---

## Files Changed Summary

| File                                               | Type    | Change                                                   |
| -------------------------------------------------- | ------- | -------------------------------------------------------- |
| `src/alias/partner-meta.service.ts`                | **NEW** | Redis getter + AliasMeta interface                       |
| `src/alias/alias.module.ts`                        | modify  | Add PartnerMetaService to providers+exports              |
| `src/mcp/mcp.controller.ts`                        | modify  | Inject service, fetch meta, pass to factory              |
| `src/mcp/services/mcp-server.factory.ts`           | modify  | Accept meta, dynamic name + instructions                 |
| `src/mcp/services/mcp-protocol-handler.service.ts` | modify  | serverName param in handleInitialize                     |
| `src/auth/auth.controller.ts`                      | modify  | Inject service, fetch meta, pass to template             |
| `src/auth/templates/login-page.template.ts`        | modify  | Accept meta, apply branding fields                       |
| `src/widgets/services/widget.service.ts`           | modify  | Accept meta, inject **PARTNER** + override locale footer |
| `views/widgets/device-app.html`                    | modify  | Add logo img in 3 footer render locations                |

---

## Conventions to Follow

- **No `as any`, no `@ts-ignore`** — AliasMeta must be properly typed everywhere
- **Zod validation** is used for tool schemas in this project — use Zod for AliasMeta too (in `partner-meta.service.ts`, validate parsed JSON before returning)
- **ConfigService** for env vars, never `process.env` directly
- **NestJS DI** — inject `PartnerMetaService` via constructor, never instantiate manually
- **Null safety** — `meta` is always `AliasMeta | null`. Every consumer must handle null with the fallback chain defined above

---

## Testing Checklist

After implementation, verify with a `SET` in Redis then a real MCP request:

```bash
# Set a test meta entry (on external Redis)
redis-cli -h <host> -p <port> -a <password> SET alias-meta:test-partner \
  '{"partnerId":"test","brandName":"Test Corp","domain":"smart office","loginAccentColor":"#2563eb","loginLogo":"🏢","widgetFooterText":"Test Corp Platform","widgetLogoUrl":"https://via.placeholder.com/80x20"}'

# 1. Hit OAuth login page → should show "Test Corp" branding with blue gradient
curl https://test-partner.mcp.dash.id.vn/auth/test-partner/authorize?...

# 2. MCP initialize → serverInfo.name should reflect meta
curl -X POST https://test-partner.mcp.dash.id.vn/ -d '{"jsonrpc":"2.0","method":"initialize","id":1}'

# 3. Widget resource → footer should show "Test Corp Platform" + logo
# (fetch via MCP resources/read)

# 4. Missing meta → should fallback gracefully (no crash, original branding)
redis-cli DEL alias-meta:test-partner
# repeat requests → all should return original hardcoded values
```
