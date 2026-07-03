import { EXECUTION_MODULE_BY_ID } from "../execution/execution-config";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID } from "./task-dashboard-config";
const FALLBACK_COLORS = ["#0f766e", "#7c3aed", "#c2410c", "#0369a1", "#4d7c0f", "#be123c"];
const TASK_ONLY_MODULE_OVERRIDES = {
    finance: {
        slug: "finanzas",
        shortLabel: "Finanzas",
        icon: "$",
        color: "#0f766e",
        description: "Cobranza, datos financieros y tareas adicionales del equipo de finanzas."
    }
};
const FALLBACK_ICONS_BY_TEAM = {
    ADMIN: "🧭",
    ADMIN_OPERATIONS: "🗂️",
    AUDIT: "🧾",
    CLIENT_RELATIONS: "💬",
    FINANCE: "💵",
    SALES: "📣"
};
function normalizeComparableText(value) {
    return (value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
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
function mergeAliases(left, right) {
    return Array.from(new Set([...left, ...right].map((alias) => alias.trim()).filter(Boolean)));
}
export function buildTaskModuleDescriptor(module) {
    const legacyExecutionModule = EXECUTION_MODULE_BY_ID[module.id];
    if (legacyExecutionModule) {
        return {
            ...legacyExecutionModule,
            label: module.label || legacyExecutionModule.label,
            shortLabel: module.label || legacyExecutionModule.shortLabel,
            description: module.summary || legacyExecutionModule.description,
            definition: module,
            legacyExecutionModule
        };
    }
    const taskOnlyOverride = TASK_ONLY_MODULE_OVERRIDES[module.id];
    if (taskOnlyOverride) {
        return {
            moduleId: module.id,
            slug: taskOnlyOverride.slug,
            team: module.team,
            label: module.label,
            shortLabel: taskOnlyOverride.shortLabel,
            icon: taskOnlyOverride.icon,
            color: taskOnlyOverride.color,
            description: module.summary || taskOnlyOverride.description,
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
        definition: module
    };
}
export function buildTaskModuleDescriptors(modules) {
    return modules.map(buildTaskModuleDescriptor);
}
export function findTaskModuleDescriptorBySlug(modules, slug) {
    if (!slug) {
        return undefined;
    }
    return buildTaskModuleDescriptors(modules).find((module) => module.slug === slug || module.moduleId === slug);
}
export function buildTaskDashboardMembers(module) {
    const configuredMembers = TASK_DASHBOARD_CONFIG_BY_MODULE_ID[module.id]?.members ?? [];
    const members = configuredMembers.map((member) => ({
        ...member,
        aliases: [...member.aliases]
    }));
    for (const moduleMember of module.members ?? []) {
        const candidate = {
            id: moduleMember.shortName || moduleMember.id,
            name: moduleMember.name,
            aliases: moduleMember.aliases
        };
        const candidateAliases = [candidate.id, candidate.name, ...candidate.aliases].map(normalizeComparableText);
        const existing = members.find((member) => {
            const memberAliases = [member.id, member.name, ...member.aliases].map(normalizeComparableText);
            return candidateAliases.some((alias) => alias && memberAliases.includes(alias));
        });
        if (existing) {
            existing.aliases = mergeAliases(existing.aliases, candidate.aliases);
        }
        else {
            members.push(candidate);
        }
    }
    return members;
}
