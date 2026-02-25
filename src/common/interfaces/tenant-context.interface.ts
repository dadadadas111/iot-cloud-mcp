/**
 * Tenant context interface for multi-tenant support
 */

export interface TenantContext {
  tenantId: string;
  projectId: string;
  projectApiKey: string;
  userId?: string;
  email?: string;
  permissions?: string[];
}

export interface TenantRequest {
  tenantContext?: TenantContext;
  user?: {
    uid: string;
    email: string;
  };
}
