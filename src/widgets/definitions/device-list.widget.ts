/**
 * Device List Widget Resource Definition
 * Renders an interactive device list when list_devices is called in ChatGPT.
 *
 * The widget is registered as an MCP resource with mimeType 'text/html;profile=mcp-app'.
 * ChatGPT fetches this resource via the URI referenced in the tool's _meta.
 * The HTML contains embedded JavaScript that reads device list data from
 * window.openai.toolOutput (the tool's structuredContent) at runtime.
 */

export const DEVICE_LIST_WIDGET = {
  uri: 'ui://widget/device-list.html',
  name: 'Device List Widget',
  description: 'Interactive device list widget markup for ChatGPT display',
  mimeType: 'text/html;profile=mcp-app' as const,
};
