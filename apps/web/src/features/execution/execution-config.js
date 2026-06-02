import { TASK_MODULES } from "@sige/contracts";
function requireTaskModule(moduleId) {
    const module = TASK_MODULES.find((candidate) => candidate.id === moduleId);
    if (!module) {
        throw new Error(`Missing task module definition for ${moduleId}`);
    }
    return module;
}
export const EXECUTION_MODULES = [
    {
        moduleId: "litigation",
        slug: "litigio",
        team: "LITIGATION",
        label: "Litigio",
        shortLabel: "Litigio",
        icon: "⚖️",
        color: "#1d4ed8",
        description: "Asuntos judiciales, escritos y control de siguientes tareas del equipo de litigio.",
        defaultResponsible: "LAMR",
        definition: requireTaskModule("litigation")
    },
    {
        moduleId: "corporate-labor",
        slug: "corporativo",
        team: "CORPORATE_LABOR",
        label: "Corporativo y laboral",
        shortLabel: "Corporativo",
        icon: "🏢",
        color: "#334155",
        description: "Seguimiento corporativo y administrativo con tablero separado por equipo.",
        defaultResponsible: "CRV",
        definition: requireTaskModule("corporate-labor")
    },
    {
        moduleId: "settlements",
        slug: "convenios",
        team: "SETTLEMENTS",
        label: "Convenios",
        shortLabel: "Convenios",
        icon: "🤝",
        color: "#15803d",
        description: "Control de convenios, contratos y mediacion con reflejo de tareas pendientes.",
        defaultResponsible: "MLDM/CAOG",
        definition: requireTaskModule("settlements")
    },
    {
        moduleId: "financial-law",
        slug: "financiero",
        team: "FINANCIAL_LAW",
        label: "Derecho financiero",
        shortLabel: "Financiero",
        icon: "💰",
        color: "#b45309",
        description: "Reportes y respuestas regulatorias con control de vencimientos recurrentes.",
        defaultResponsible: "RV/HM",
        definition: requireTaskModule("financial-law")
    },
    {
        moduleId: "tax-compliance",
        slug: "compliance",
        team: "TAX_COMPLIANCE",
        label: "Compliance fiscal",
        shortLabel: "Compliance",
        icon: "✅",
        color: "#be185d",
        description: "Obligaciones fiscales y contables con vista operativa por cliente y asunto.",
        defaultResponsible: "MP/YA",
        definition: requireTaskModule("tax-compliance")
    }
];
export const EXECUTION_MODULE_BY_SLUG = Object.fromEntries(EXECUTION_MODULES.map((module) => [module.slug, module]));
export const EXECUTION_MODULE_BY_ID = Object.fromEntries(EXECUTION_MODULES.map((module) => [module.moduleId, module]));
export const EXECUTION_MODULE_BY_TEAM = Object.fromEntries(EXECUTION_MODULES.map((module) => [module.team, module]));
const FALLBACK_COLORS = ["#0f766e", "#7c3aed", "#c2410c", "#0369a1", "#4d7c0f", "#be123c"];
const FALLBACK_ICONS_BY_TEAM = {
    ADMIN: "A",
    ADMIN_OPERATIONS: "O",
    AUDIT: "V",
    CLIENT_RELATIONS: "C",
    FINANCE: "$",
    SALES: "S"
};
function getFallbackColor(moduleId) {
    const score = Array.from(moduleId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return FALLBACK_COLORS[score % FALLBACK_COLORS.length];
}
function getModuleInitial(label) {
    return label.trim().charAt(0).toUpperCase() || "T";
}
function getFallbackIcon(module) {
    return FALLBACK_ICONS_BY_TEAM[module.team] ?? getModuleInitial(module.label);
}
function getDefaultResponsible(module) {
    return module.members?.find((member) => member.shortName || member.id)?.shortName
        ?? module.members?.find((member) => member.shortName || member.id)?.id
        ?? "";
}
export function buildExecutionModuleDescriptor(module) {
    const legacyModule = EXECUTION_MODULE_BY_ID[module.id];
    if (legacyModule) {
        return {
            ...legacyModule,
            label: module.label || legacyModule.label,
            shortLabel: module.label || legacyModule.shortLabel,
            description: module.summary || legacyModule.description,
            defaultResponsible: legacyModule.defaultResponsible || getDefaultResponsible(module),
            definition: module
        };
    }
    return {
        moduleId: module.id,
        slug: module.id,
        team: module.team,
        label: module.label,
        shortLabel: module.label,
        icon: getFallbackIcon(module),
        color: getFallbackColor(module.id),
        description: module.summary || "Espacio de tareas pendiente de configuracion.",
        defaultResponsible: getDefaultResponsible(module),
        definition: module
    };
}
export function buildExecutionModuleDescriptors(modules) {
    return modules.map(buildExecutionModuleDescriptor);
}
export function findExecutionModuleDescriptorBySlug(modules, slug) {
    if (!slug) {
        return undefined;
    }
    return buildExecutionModuleDescriptors(modules).find((module) => module.slug === slug || module.moduleId === slug);
}
export function canAccessAllExecutionModules(user) {
    const permissions = user?.permissions ?? [];
    return Boolean(permissions.includes("*") || permissions.includes("execution:all") || user?.team === "ADMIN");
}
export function getVisibleExecutionModules(user) {
    if (canAccessAllExecutionModules(user)) {
        return EXECUTION_MODULES;
    }
    const permissions = new Set(user?.permissions ?? []);
    const permittedModules = EXECUTION_MODULES.filter((module) => permissions.has(`execution:${module.moduleId}`));
    if (permittedModules.length > 0) {
        return permittedModules;
    }
    if (!user?.team) {
        return [];
    }
    const module = EXECUTION_MODULE_BY_TEAM[user.team];
    return module ? [module] : [];
}
