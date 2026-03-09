/**
 * Device Dashboard Widget Resource Definition
 * Renders an interactive device dashboard when get_device is called in ChatGPT
 *
 * The widget is registered as an MCP resource with mimeType 'text/html+skybridge'.
 * ChatGPT fetches this resource via the URI referenced in the tool's _meta.openai/outputTemplate.
 */

export const DEVICE_DASHBOARD_WIDGET = {
  uri: 'ui://widget/device-dashboard.html',
  name: 'Device Dashboard Widget',
  description: 'Interactive device dashboard widget markup for ChatGPT display',
  mimeType: 'text/html+skybridge' as const,
};
