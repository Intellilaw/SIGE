import { TASK_MODULES, type TaskModuleDefinition, type Team } from "@sige/contracts";

export interface ExecutionModuleDescriptor {
  moduleId: TaskModuleDefinition["id"];
  slug: string;
  team: Team;
  label: string;
  shortLabel: string;
  icon: string;
  color: string;
  description: string;
  defaultResponsible: string;
  definition: TaskModuleDefinition;
}

function requireTaskModule(moduleId: TaskModuleDefinition["id"]) {
  const module = TASK_MODULES.find((candidate) => candidate.id === moduleId);
  if (!module) {
    throw new Error(`Missing task module definition for ${moduleId}`);
  }

  return module;
}

export const EXECUTION_MODULES: ExecutionModuleDescriptor[] = [
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

export const EXECUTION_MODULE_BY_SLUG = Object.fromEntries(
  EXECUTION_MODULES.map((module) => [module.slug, module])
) as Record<string, ExecutionModuleDescriptor>;

export const EXECUTION_MODULE_BY_ID = Object.fromEntries(
  EXECUTION_MODULES.map((module) => [module.moduleId, module])
) as Partial<Record<string, ExecutionModuleDescriptor>>;

export const EXECUTION_MODULE_BY_TEAM = Object.fromEntries(
  EXECUTION_MODULES.map((module) => [module.team, module])
) as Partial<Record<string, ExecutionModuleDescriptor>>;

const FALLBACK_COLORS = ["#0f766e", "#7c3aed", "#c2410c", "#0369a1", "#4d7c0f", "#be123c"];
const FALLBACK_ICONS_BY_TEAM: Partial<Record<Team, string>> = {
  ADMIN: "A",
  ADMIN_OPERATIONS: "O",
  AUDIT: "V",
  CLIENT_RELATIONS: "C",
  FINANCE: "$",
  SALES: "S"
};

function getFallbackColor(moduleId: string) {
  const score = Array.from(moduleId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return FALLBACK_COLORS[score % FALLBACK_COLORS.length];
}

function getModuleInitial(label: string) {
  return label.trim().charAt(0).toUpperCase() || "T";
}

function getFallbackIcon(module: TaskModuleDefinition) {
  return FALLBACK_ICONS_BY_TEAM[module.team] ?? getModuleInitial(module.label);
}

function getDefaultResponsible(module: TaskModuleDefinition) {
  return module.members?.find((member) => member.shortName || member.id)?.shortName
    ?? module.members?.find((member) => member.shortName || member.id)?.id
    ?? "";
}

export function buildExecutionModuleDescriptor(module: TaskModuleDefinition): ExecutionModuleDescriptor {
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

export function buildExecutionModuleDescriptors(modules: TaskModuleDefinition[]) {
  return modules.map(buildExecutionModuleDescriptor);
}

export function findExecutionModuleDescriptorBySlug(modules: TaskModuleDefinition[], slug?: string) {
  if (!slug) {
    return undefined;
  }

  return buildExecutionModuleDescriptors(modules).find((module) => module.slug === slug || module.moduleId === slug);
}

export function canAccessAllExecutionModules(user?: {
  role?: string;
  team?: string;
  permissions?: string[];
} | null) {
  return Boolean(user?.permissions?.includes("*") || user?.team === "ADMIN");
}

export function getVisibleExecutionModules(user?: {
  role?: string;
  team?: string;
  permissions?: string[];
} | null) {
  if (canAccessAllExecutionModules(user)) {
    return EXECUTION_MODULES;
  }

  if (!user?.team) {
    return [];
  }

  const module = EXECUTION_MODULE_BY_TEAM[user.team as Team];
  return module ? [module] : [];
}
