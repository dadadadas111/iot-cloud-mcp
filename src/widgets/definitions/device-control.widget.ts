/**
 * Device Control Widget Resource Definition
 * Renders an interactive device control panel when interact_device is called in ChatGPT.
 *
 * The widget is registered as an MCP resource with mimeType 'text/html;profile=mcp-app'.
 * ChatGPT fetches this resource via the URI referenced in the tool's _meta.
 * The HTML contains embedded JavaScript that reads device data from
 * window.openai.toolOutput (the tool's structuredContent) at runtime,
 * and uses window.openai.callTool to send control commands back to the server.
 */

export const DEVICE_CONTROL_WIDGET = {
  uri: 'ui://widget/device-control.html',
  name: 'Device Control Widget',
  description: 'Interactive device control panel widget markup for ChatGPT display',
  mimeType: 'text/html;profile=mcp-app' as const,
};
