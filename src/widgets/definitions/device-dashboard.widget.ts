/**
 * Device Dashboard Widget Resource Definition
 * Renders an interactive device dashboard when get_device is called in ChatGPT.
 *
 * The widget is registered as an MCP resource with mimeType 'text/html;profile=mcp-app'.
 * ChatGPT fetches this resource via the URI referenced in the tool's _meta.
 * The HTML contains embedded JavaScript that reads device data from
 * window.openai.toolOutput (the tool's structuredContent) at runtime.
 */

export const DEVICE_DASHBOARD_WIDGET = {
  uri: 'ui://widget/device-dashboard.html',
  name: 'Device Dashboard Widget',
  description: 'Interactive device dashboard widget markup for ChatGPT display',
  mimeType: 'text/html;profile=mcp-app' as const,
};
