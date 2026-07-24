const MODULE_ACCESS = {
    clients: { read: ["clients:read", "clients:write"], write: ["clients:write"] },
    quotes: { read: ["quotes:read", "quotes:write"], write: ["quotes:write"] },
    "lead-tracking": { read: ["leads:read", "leads:write"], write: ["leads:write"] },
    "active-matters": { read: ["matters:read", "matters:write", "external-matters:read"], write: ["matters:write"] },
    sales: { read: ["sales:read", "sales:write"], write: ["sales:write"] },
    execution: {
        read: [
            "execution:all",
            "execution:litigation",
            "execution:corporate-labor",
            "execution:settlements",
            "execution:financial-law",
            "execution:tax-compliance",
            "external-execution:read"
        ]
    },
    tasks: { read: ["tasks:read", "external-tasks:read", "external-tasks:write"] },
    finances: { read: ["finances:read", "finances:write", "finances:monthly:read", "external-finances:read"], write: ["finances:write"] },
    accounting: { read: ["accounting:read", "accounting:write", "finances:read", "finances:write"], write: ["accounting:write", "finances:write"] },
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
    bulletins: { read: "internal", write: "internal" },
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
    if (permissions === "internal") {
        return Boolean(user && !user.isExternal);
    }
    return Boolean(user?.permissions?.includes("*") || permissions.some((permission) => user?.permissions?.includes(permission)));
}
export function canReadModule(user, moduleId) {
    const rule = MODULE_ACCESS[moduleId];
    if (!rule) {
        return false;
    }
    return hasAnyPermission(user, rule.read);
}
export function canWriteModule(user, moduleId) {
    const rule = MODULE_ACCESS[moduleId];
    if (!rule?.write) {
        return false;
    }
    return hasAnyPermission(user, rule.write);
}
export function canReadAppHome(user) {
    return hasPermission(user, "dashboard:read");
}
