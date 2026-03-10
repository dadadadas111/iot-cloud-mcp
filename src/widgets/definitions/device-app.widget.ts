/**
 * Device App Widget Resource Definition
 * Unified SPA widget that renders device list, dashboard, and control views
 * in a single HTML file with client-side navigation via callTool.
 *
 * The widget is registered as an MCP resource with mimeType 'text/html;profile=mcp-app'.
 * ChatGPT fetches this resource via the URI referenced in the tool's _meta.
 * The HTML reads the `_view` hint from structuredContent to determine which view to render,
 * and uses window.openai.callTool for in-widget navigation between views.
 */

export const DEVICE_APP_WIDGET = {
  uri: 'ui://widget/device-app.html',
  name: 'Device App Widget',
  description:
    'Unified device management SPA widget with list, dashboard, and control views for ChatGPT display',
  mimeType: 'text/html;profile=mcp-app' as const,
};
