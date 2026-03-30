/**
 * @example
 *   buildSubdomainUrl('https://mcp-stag.dash.id.vn', 'rogo-64770705')
 *   // → 'https://rogo-64770705.mcp-stag.dash.id.vn'
 *
 *   buildSubdomainUrl('http://localhost:3001', 'rogo-64770705')
 *   // → 'http://localhost:3001'  (localhost/IP — no subdomain)
 */
export function buildSubdomainUrl(baseUrl: string, alias: string): string {
  const url = new URL(baseUrl);

  if (url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
    return baseUrl.replace(/\/+$/, '');
  }

  url.hostname = `${alias}.${url.hostname}`;
  return url.origin;
}
