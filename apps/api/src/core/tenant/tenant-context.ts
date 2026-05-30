import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_ORGANIZATION_SLUG, findOrganizationBySlug, getDefaultOrganization } from "@sige/contracts";

interface TenantContext {
  organizationId?: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function resolveOrganization(slug?: string | null) {
  const organization = findOrganizationBySlug(slug) ?? findOrganizationBySlug(DEFAULT_ORGANIZATION_SLUG) ?? getDefaultOrganization();
  return organization;
}

export function getCurrentOrganizationId() {
  return tenantStorage.getStore()?.organizationId;
}

export function getCurrentOrganizationIdOrDefault() {
  return getCurrentOrganizationId() ?? getDefaultOrganization().id;
}

export function enterTenantContext(organizationId: string) {
  const currentStore = tenantStorage.getStore();
  if (currentStore) {
    currentStore.organizationId = organizationId;
    return;
  }

  tenantStorage.enterWith({ organizationId });
}

export function runWithTenantContext<T>(organizationId: string, callback: () => T) {
  return tenantStorage.run({ organizationId }, callback);
}

export function runWithEmptyTenantContext<T>(callback: () => T) {
  return tenantStorage.run({}, callback);
}
