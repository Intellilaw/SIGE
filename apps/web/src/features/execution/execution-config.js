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
export function canAccessAllExecutionModules(user) {
    return Boolean(user?.permissions?.includes("*") || user?.team === "ADMIN");
}
export function getVisibleExecutionModules(user) {
    if (canAccessAllExecutionModules(user)) {
        return EXECUTION_MODULES;
    }
    if (!user?.team) {
        return [];
    }
    const module = EXECUTION_MODULE_BY_TEAM[user.team];
    return module ? [module] : [];
}
