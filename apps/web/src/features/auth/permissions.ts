export interface PermissionUser {
  role?: string;
  legacyRole?: string;
  team?: string;
  legacyTeam?: string;
  specificRole?: string;
  permissions?: string[];
}

type AccessRule = {
  read: string[];
  write?: string[];
};

const MODULE_ACCESS: Record<string, AccessRule> = {
  clients: { read: ["clients:read", "clients:write"], write: ["clients:write"] },
  quotes: { read: ["quotes:read", "quotes:write"], write: ["quotes:write"] },
  "lead-tracking": { read: ["leads:read", "leads:write"], write: ["leads:write"] },
  "active-matters": { read: ["matters:read", "matters:write"], write: ["matters:write"] },
  execution: {
    read: [
      "execution:litigation",
      "execution:corporate-labor",
      "execution:settlements",
      "execution:financial-law",
      "execution:tax-compliance"
    ]
  },
  tasks: { read: ["tasks:read"] },
  finances: { read: ["finances:read", "finances:write"], write: ["finances:write"] },
  "budget-planning": {
    read: ["budget-planning:read", "budget-planning:write"],
    write: ["budget-planning:write"]
  },
  "general-expenses": {
    read: ["general-expenses:read", "general-expenses:write"],
    write: ["general-expenses:write"]
  },
  commissions: {
    read: ["commissions:read", "commissions:write", "commissions:client-relations:write", "commissions:own-section:write"],
    write: ["commissions:write"]
  },
  kpis: { read: ["kpis:read"], write: ["kpis:team-manage"] },
  "general-supervision": { read: ["general-supervision:read"] },
  "matter-catalog": { read: ["catalog:read"] },
  "brief-manager": { read: ["brief-manager:read", "brief-manager:write"], write: ["brief-manager:write"] },
  "internal-contracts": {
    read: ["internal-contracts:read", "internal-contracts:write"],
    write: ["internal-contracts:write"]
  },
  "labor-file": { read: ["labor-file:read", "labor-file:write"], write: ["labor-file:write"] },
  "daily-documents": {
    read: ["daily-documents:read", "daily-documents:write"],
    write: ["daily-documents:write"]
  },
  "third-party-documents": {
    read: ["documents-third-party:read", "documents-third-party:write"],
    write: ["documents-third-party:write"]
  },
  holidays: { read: ["holidays:read", "holidays:write"], write: ["holidays:write"] },
  users: { read: ["users:read", "users:manage"], write: ["users:manage"] }
};

export function hasPermission(user: PermissionUser | null | undefined, permission: string) {
  return Boolean(user?.permissions?.includes("*") || user?.permissions?.includes(permission));
}

function hasAnyPermission(user: PermissionUser | null | undefined, permissions: string[]) {
  return Boolean(user?.permissions?.includes("*") || permissions.some((permission) => user?.permissions?.includes(permission)));
}

export function canReadModule(user: PermissionUser | null | undefined, moduleId: string) {
  const rule = MODULE_ACCESS[moduleId];
  if (!rule) {
    return false;
  }

  return hasAnyPermission(user, rule.read);
}

export function canWriteModule(user: PermissionUser | null | undefined, moduleId: string) {
  const rule = MODULE_ACCESS[moduleId];
  if (!rule?.write) {
    return false;
  }

  return hasAnyPermission(user, rule.write);
}

export function canReadAppHome(user: PermissionUser | null | undefined) {
  return hasPermission(user, "dashboard:read");
}
