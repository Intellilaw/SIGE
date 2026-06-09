const MODULE_ACCESS = {
    clients: { read: ["clients:read", "clients:write"], write: ["clients:write"] },
    quotes: { read: ["quotes:read", "quotes:write"], write: ["quotes:write"] },
    "lead-tracking": { read: ["leads:read", "leads:write"], write: ["leads:write"] },
    "active-matters": { read: ["matters:read", "matters:write"], write: ["matters:write"] },
    sales: { read: ["sales:read", "sales:write"], write: ["sales:write"] },
    execution: {
        read: [
            "execution:all",
            "execution:litigation",
            "execution:corporate-labor",
            "execution:settlements",
            "execution:financial-law",
            "execution:tax-compliance"
        ]
    },
    tasks: { read: ["tasks:read"] },
    finances: { read: ["finances:read", "finances:write", "finances:monthly:read"], write: ["finances:write"] },
    "budget-planning": {
        read: ["budget-planning:read", "budget-planning:write"],
        write: ["budget-planning:write"]
    },
    "general-expenses": {
        read: ["general-expenses:read", "general-expenses:write"],
        write: ["general-expenses:write"]
    },
    commissions: {
        read: [
            "commissions:read",
            "commissions:all:read",
            "commissions:write",
            "commissions:client-relations:write",
            "commissions:own-section:write"
        ],
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
    "external-contracts": {
        read: ["external-contracts:read", "external-contracts:write"],
        write: ["external-contracts:write"]
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
    "guidelines-manuals": { read: "all" },
    holidays: { read: ["holidays:read", "holidays:write"], write: ["holidays:write"] },
    users: { read: ["users:read", "users:manage"], write: ["users:manage"] }
};
export function hasPermission(user, permission) {
    return Boolean(user?.permissions?.includes("*") || user?.permissions?.includes(permission));
}
function hasAnyPermission(user, permissions) {
    if (permissions === "all") {
        return Boolean(user);
    }
    return Boolean(user?.permissions?.includes("*") || permissions.some((permission) => user?.permissions?.includes(permission)));
}
function normalizeAccessText(value) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}
function isSettlementsTeamUser(user) {
    if (!user) {
        return false;
    }
    const normalizedTeams = [
        normalizeAccessText(user.legacyTeam),
        normalizeAccessText(user.secondaryLegacyTeam)
    ];
    const normalizedRoles = [
        normalizeAccessText(user.specificRole),
        normalizeAccessText(user.secondarySpecificRole)
    ];
    const hasAdministrativeAccess = user.role === "SUPERADMIN"
        || user.legacyRole === "SUPERADMIN"
        || normalizedRoles.includes("direccion general")
        || Boolean(user.permissions?.includes("*"));
    return hasAdministrativeAccess
        || user.team === "SETTLEMENTS"
        || user.secondaryTeam === "SETTLEMENTS"
        || normalizedTeams.includes("convenios")
        || normalizedRoles.some((role) => role.includes("convenios"));
}
export function canReadModule(user, moduleId) {
    const rule = MODULE_ACCESS[moduleId];
    if (!rule) {
        return false;
    }
    if (moduleId === "external-contracts" && !isSettlementsTeamUser(user)) {
        return false;
    }
    return hasAnyPermission(user, rule.read);
}
export function canWriteModule(user, moduleId) {
    const rule = MODULE_ACCESS[moduleId];
    if (!rule?.write) {
        return false;
    }
    if (moduleId === "external-contracts" && !isSettlementsTeamUser(user)) {
        return false;
    }
    return hasAnyPermission(user, rule.write);
}
export function canReadAppHome(user) {
    return hasPermission(user, "dashboard:read");
}
