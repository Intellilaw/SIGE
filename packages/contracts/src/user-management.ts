import type { AuthUser, LegacyAccessRole, SystemRole, Team } from "./domain";

export const USERNAME_FAKE_DOMAIN = "@calculadora.app";

export interface TeamOption {
  key: Team;
  label: string;
}

export interface ManagedTeam extends TeamOption {
  id: string;
  isActive: boolean;
  sortOrder: number;
  memberCount: number;
  executionSpaceEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  deactivatedAt?: string;
  executionSpaceDeactivatedAt?: string;
}

export interface CreateManagedTeamInput {
  label: string;
  executionSpaceEnabled?: boolean;
}

export interface UpdateManagedTeamInput {
  label?: string;
  isActive?: boolean;
  executionSpaceEnabled?: boolean;
}

export const TEAM_OPTIONS: TeamOption[] = [
  { key: "LITIGATION", label: "Litigio" },
  { key: "CORPORATE_LABOR", label: "Corporativo y laboral" },
  { key: "SETTLEMENTS", label: "Convenios" },
  { key: "FINANCIAL_LAW", label: "Der Financiero" },
  { key: "TAX_COMPLIANCE", label: "Compliance Fiscal" },
  { key: "AUDIT", label: "Auditoría" },
  { key: "CLIENT_RELATIONS", label: "Comunicación con cliente" },
  { key: "SALES", label: "Ventas" },
  { key: "FINANCE", label: "Finanzas" },
  { key: "ADMIN_OPERATIONS", label: "Servicios administrativos" },
  { key: "ADMIN", label: "Dirección general" }
];

export const SPECIFIC_ROLE_OPTIONS = [
  "Dirección general",
  "Litigio (líder)",
  "Litigio (colaborador)",
  "Corporativo-laboral (líder)",
  "Corporativo-laboral (colaborador)",
  "Convenios (líder)",
  "Convenios (colaborador)",
  "Der Financiero (líder)",
  "Der Financiero (colaborador)",
  "Compliance Fiscal (líder)",
  "Compliance Fiscal (colaborador)",
  "Finanzas",
  "Comunicación con cliente",
  "Ventas",
  "Auditor",
  "Proyectista 1",
  "Proyectista 2"
] as const;

export type SpecificRole = typeof SPECIFIC_ROLE_OPTIONS[number];

export interface ManagedUser extends AuthUser {
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  emailConfirmedAt?: string;
}

export interface CreateManagedUserInput {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
  shortName?: string;
  legacyRole?: LegacyAccessRole;
  legacyTeam?: string;
  secondaryLegacyTeam?: string;
  specificRole?: string;
  secondarySpecificRole?: string;
  isExternal?: boolean;
  createLaborFile?: boolean;
}

export interface UpdateManagedUserInput {
  username?: string;
  email?: string;
  displayName?: string;
  password?: string;
  shortName?: string | null;
  legacyRole?: LegacyAccessRole;
  legacyTeam?: string | null;
  secondaryLegacyTeam?: string | null;
  specificRole?: string | null;
  secondarySpecificRole?: string | null;
  isExternal?: boolean;
  createLaborFile?: boolean;
  isActive?: boolean;
}

function normalizeText(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const objectText = ["label", "name", "key", "value"].find((key) => typeof record[key] === "string");
    if (objectText) {
      return normalizeText(record[objectText]);
    }
  }

  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function buildTaskModuleIdFromTeamKey(team?: string | null) {
  return String(team ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const TASK_EXECUTION_TEAM_KEYS = new Set<string>([
  "LITIGATION",
  "CORPORATE_LABOR",
  "SETTLEMENTS",
  "FINANCIAL_LAW",
  "TAX_COMPLIANCE"
]);

const TASK_EXECUTION_ROLE_MODULES = [
  { roleIncludes: "litigio", moduleId: "litigation" },
  { roleIncludes: "corporativo-laboral", moduleId: "corporate-labor" },
  { roleIncludes: "convenios", moduleId: "settlements" },
  { roleIncludes: "der financiero", moduleId: "financial-law" },
  { roleIncludes: "compliance fiscal", moduleId: "tax-compliance" }
] as const;

function addTaskExecutionModulePermissions(permissions: Set<string>, moduleId: string) {
  permissions.add("tasks:read");
  permissions.add(`tasks:${moduleId}`);
  permissions.add(`execution:${moduleId}`);
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripDiacritics(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toTitleCase(value: string) {
  return collapseWhitespace(value)
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

function extractIdentifierLocalPart(value: string) {
  const trimmed = collapseWhitespace(value);
  if (!trimmed) {
    return "";
  }

  const atIndex = trimmed.indexOf("@");
  return atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed;
}

function tokenizeLegacyIdentifier(usernameOrEmail: string) {
  const normalized = stripDiacritics(extractIdentifierLocalPart(usernameOrEmail))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  return normalized.length > 0 ? normalized.split(/\s+/).filter(Boolean) : [];
}

function buildCandidateFromTokens(tokens: string[]) {
  return toTitleCase(tokens.join(" "));
}

export function buildLegacyUsernameCandidates(usernameOrEmail: string) {
  const tokens = tokenizeLegacyIdentifier(usernameOrEmail);
  if (tokens.length === 0) {
    return [];
  }

  if (tokens.length === 1) {
    return [buildCandidateFromTokens(tokens)];
  }

  const surnameIndex = tokens.length >= 3 ? 2 : 1;
  const candidates = new Set<string>();
  const baseTokens = [tokens[0], tokens[surnameIndex]];

  candidates.add(buildCandidateFromTokens(baseTokens));

  if (tokens.length > surnameIndex + 1) {
    let extendedTokens = [...baseTokens];
    for (const token of tokens.slice(surnameIndex + 1)) {
      extendedTokens = [...extendedTokens, token];
      candidates.add(buildCandidateFromTokens(extendedTokens));
    }
  }

  candidates.add(buildCandidateFromTokens(tokens));

  return Array.from(candidates).filter(Boolean);
}

export function normalizeLegacyUsername(usernameOrEmail: string) {
  return buildLegacyUsernameCandidates(usernameOrEmail)[0] ?? "";
}

export function normalizeLegacyUsernameKey(username: string) {
  return normalizeText(collapseWhitespace(username));
}

export function resolveUniqueLegacyUsername(usernameOrEmail: string, takenUsernames: Iterable<string>) {
  const takenKeys = new Set(
    Array.from(takenUsernames, (username) => normalizeLegacyUsernameKey(username))
  );

  for (const candidate of buildLegacyUsernameCandidates(usernameOrEmail)) {
    const candidateKey = normalizeLegacyUsernameKey(candidate);
    if (!takenKeys.has(candidateKey)) {
      return candidate;
    }
  }

  const baseUsername = normalizeLegacyUsername(usernameOrEmail);
  if (!baseUsername) {
    return "";
  }

  let suffix = 2;
  let candidate = `${baseUsername} ${suffix}`;
  while (takenKeys.has(normalizeLegacyUsernameKey(candidate))) {
    suffix += 1;
    candidate = `${baseUsername} ${suffix}`;
  }

  return candidate;
}

export function buildLegacyUsernameLookupCandidates(usernameOrEmail: string) {
  const candidates = new Set<string>(buildLegacyUsernameCandidates(usernameOrEmail));
  const localPart = stripDiacritics(extractIdentifierLocalPart(usernameOrEmail));

  if (localPart) {
    candidates.add(localPart.toLowerCase());
    candidates.add(toTitleCase(localPart.replace(/[._-]+/g, " ")));
  }

  return Array.from(candidates).filter(Boolean);
}

export function buildLegacyEmail(usernameOrEmail: string) {
  const trimmed = collapseWhitespace(usernameOrEmail).toLowerCase();
  if (trimmed.includes("@")) {
    return trimmed;
  }

  const localPart = tokenizeLegacyIdentifier(usernameOrEmail).join(".");
  return localPart ? `${localPart}${USERNAME_FAKE_DOMAIN}` : USERNAME_FAKE_DOMAIN;
}

export function buildDisplayName(username: string) {
  const tokens = tokenizeLegacyIdentifier(username);
  return tokens.length > 0 ? buildCandidateFromTokens(tokens) : toTitleCase(username);
}

export function normalizeShortName(shortName?: string | null) {
  const value = (shortName ?? "").trim().toUpperCase();
  return value.length > 0 ? value : undefined;
}

export function findTeamOptionByLabel(label?: string | null) {
  if (!label) {
    return undefined;
  }

  const normalized = normalizeText(label);
  return TEAM_OPTIONS.find((option) => normalizeText(option.label) === normalized);
}

export function getLegacyTeamLabel(team?: Team | null) {
  return TEAM_OPTIONS.find((option) => option.key === team)?.label;
}

export function deriveSystemRole(input: {
  legacyRole: LegacyAccessRole;
  legacyTeam?: string | null;
  specificRole?: string | null;
  secondarySpecificRole?: string | null;
}): SystemRole {
  if (input.legacyRole === "SUPERADMIN") {
    return "SUPERADMIN";
  }

  const specificRole = normalizeText(input.specificRole ?? "");
  const secondarySpecificRole = normalizeText(input.secondarySpecificRole ?? "");
  const roles = [specificRole, secondarySpecificRole].filter(Boolean);

  if (roles.includes("direccion general")) {
    return "DIRECTOR";
  }

  if (specificRole.includes("(lider)")) {
    return "TEAM_LEAD";
  }

  if (specificRole === "auditor") {
    return "AUDITOR";
  }

  if (secondarySpecificRole.includes("(lider)")) {
    return "TEAM_LEAD";
  }

  if (secondarySpecificRole === "auditor") {
    return "AUDITOR";
  }

  return "ANALYST";
}

export function derivePermissions(input: {
  legacyRole: LegacyAccessRole;
  team?: Team | null;
  legacyTeam?: string | null;
  secondaryTeam?: Team | null;
  secondaryLegacyTeam?: string | null;
  specificRole?: string | null;
  secondarySpecificRole?: string | null;
  isExternal?: boolean | null;
}): string[] {
  if (input.isExternal) {
    return [
      "dashboard:read",
      "external-matters:read",
      "external-execution:read",
      "external-tasks:read",
      "external-tasks:write",
      "external-finances:read"
    ].sort();
  }

  const permissions = new Set<string>([
    "dashboard:read",
    "catalog:read",
    "commissions:read",
    "documents-third-party:read",
    "internal-contracts:read",
    "labor-file:read",
    "holidays:read",
    "kpis:read"
  ]);

  const specificRole = normalizeText(input.specificRole ?? "");
  const secondarySpecificRole = normalizeText(input.secondarySpecificRole ?? "");
  const specificRoles = [specificRole, secondarySpecificRole].filter(Boolean);
  const hasSpecificRole = (role: string) => specificRoles.includes(role);
  const hasSpecificRoleIncluding = (value: string) => specificRoles.some((role) => role.includes(value));
  const teamAssignments = [
    { team: input.team, legacyTeam: input.legacyTeam },
    { team: input.secondaryTeam, legacyTeam: input.secondaryLegacyTeam }
  ].filter((assignment) => assignment.team || assignment.legacyTeam);
  const effectiveTeamAssignments = teamAssignments.length > 0
    ? teamAssignments
    : [{ team: input.team, legacyTeam: input.legacyTeam }];

  if (input.legacyRole === "SUPERADMIN" || hasSpecificRole("direccion general")) {
    return ["*"];
  }

  for (const assignment of effectiveTeamAssignments) {
    const normalizedTeam = normalizeText(assignment.legacyTeam ?? getLegacyTeamLabel(assignment.team) ?? "");
    const teamKey = assignment.team;
    const isClientRelationsTeam =
      teamKey === "CLIENT_RELATIONS" ||
      normalizedTeam === "comunicacion con cliente" || normalizedTeam === "comunicacion con clientes";
    const isSalesTeam = teamKey === "SALES" || normalizedTeam === "ventas";
    const isFinanceTeam = teamKey === "FINANCE" || normalizedTeam === "finanzas" || hasSpecificRole("finanzas");

    if (teamKey && TASK_EXECUTION_TEAM_KEYS.has(teamKey)) {
      const taskModuleId = buildTaskModuleIdFromTeamKey(teamKey);
      if (taskModuleId) {
        addTaskExecutionModulePermissions(permissions, taskModuleId);
      }
    }

    if (isClientRelationsTeam) {
      permissions.add("clients:read");
      permissions.add("clients:write");
      permissions.add("quotes:read");
      permissions.add("quotes:write");
      permissions.add("leads:read");
      permissions.add("leads:write");
      permissions.add("matters:read");
      permissions.add("matters:write");
      permissions.add("execution:all");
      permissions.add("finances:read");
      permissions.add("internal-contracts:read");
      permissions.add("internal-contract-templates:read");
    }

    if (isSalesTeam) {
      permissions.add("clients:read");
      permissions.add("clients:write");
      permissions.add("quotes:read");
      permissions.add("quotes:write");
      permissions.add("leads:read");
      permissions.add("leads:write");
      permissions.add("matters:read");
      permissions.add("sales:read");
      permissions.add("sales:write");
      permissions.add("finances:monthly:read");
      permissions.add("commissions:all:read");
    }

    if (isFinanceTeam) {
      permissions.add("tasks:read");
      permissions.add("tasks:finance");
      permissions.add("clients:read");
      permissions.add("quotes:read");
      permissions.add("quotes:write");
      permissions.add("matters:read");
      permissions.add("finances:read");
      permissions.add("finances:write");
      permissions.add("accounting:read");
      permissions.add("accounting:write");
      permissions.add("budget-planning:read");
      permissions.add("budget-planning:write");
      permissions.add("general-expenses:read");
      permissions.add("general-expenses:write");
      permissions.add("commissions:all:read");
      permissions.add("commissions:exclusions:write");
      permissions.add("internal-contracts:read");
      permissions.add("internal-contracts:write");
      permissions.add("internal-contract-templates:read");
    }

    if (teamKey === "ADMIN_OPERATIONS" || normalizedTeam === "servicios administrativos") {
      permissions.add("general-expenses:read");
      permissions.add("general-expenses:write");
      permissions.add("accounting:read");
      permissions.add("budget-planning:read");
      permissions.add("budget-planning:write");
      permissions.add("internal-contracts:read");
      permissions.add("internal-contracts:write");
      permissions.add("internal-contract-templates:read");
      permissions.add("labor-file:read");
      permissions.add("labor-file:write");
      permissions.add("holidays:write");
    }

    if (teamKey === "LITIGATION" || normalizedTeam === "litigio") {
      permissions.add("tasks:read");
      permissions.add("tasks:litigation");
      permissions.add("execution:litigation");
    }

    if (teamKey === "CORPORATE_LABOR" || normalizedTeam === "corporativo y laboral") {
      permissions.add("tasks:read");
      permissions.add("tasks:corporate-labor");
      permissions.add("execution:corporate-labor");
    }

    if (teamKey === "SETTLEMENTS" || normalizedTeam === "convenios") {
      permissions.add("tasks:read");
      permissions.add("tasks:settlements");
      permissions.add("execution:settlements");
    }

    if (teamKey === "FINANCIAL_LAW" || normalizedTeam === "der financiero") {
      permissions.add("tasks:read");
      permissions.add("tasks:financial-law");
      permissions.add("execution:financial-law");
    }

    if (teamKey === "TAX_COMPLIANCE" || normalizedTeam === "compliance fiscal") {
      permissions.add("tasks:read");
      permissions.add("tasks:tax-compliance");
      permissions.add("execution:tax-compliance");
    }
  }

  for (const roleModule of TASK_EXECUTION_ROLE_MODULES) {
    if (hasSpecificRoleIncluding(roleModule.roleIncludes)) {
      addTaskExecutionModulePermissions(permissions, roleModule.moduleId);
    }
  }

  if (hasSpecificRole("auditor")) {
    permissions.add("general-expenses:read");
    permissions.add("general-expenses:write");
  }

  if (hasSpecificRoleIncluding("(lider)")) {
    permissions.add("kpis:team-manage");
  }

  if (hasSpecificRole("litigio (lider)")) {
    permissions.add("tasks:litigation:additional");
  }

  if (hasSpecificRole("corporativo-laboral (lider)")) {
    permissions.add("tasks:corporate-labor:additional");
  }

  if (hasSpecificRole("convenios (lider)")) {
    permissions.add("tasks:settlements:additional");
  }

  if (hasSpecificRole("der financiero (lider)")) {
    permissions.add("tasks:financial-law:additional");
  }

  if (hasSpecificRole("compliance fiscal (lider)")) {
    permissions.add("tasks:tax-compliance:additional");
  }

  return Array.from(permissions).sort();
}

export function deriveEffectivePermissions(input: {
  legacyRole: LegacyAccessRole;
  team?: Team | null;
  legacyTeam?: string | null;
  secondaryTeam?: Team | null;
  secondaryLegacyTeam?: string | null;
  specificRole?: string | null;
  secondarySpecificRole?: string | null;
  permissions?: string[] | null;
  isExternal?: boolean | null;
}): string[] {
  const explicitPermissions = Array.isArray(input.permissions)
    ? input.permissions.filter((permission): permission is string => typeof permission === "string")
    : [];
  if (input.isExternal) {
    const permissions = new Set([
      ...derivePermissions({
        legacyRole: input.legacyRole,
        team: input.team,
        legacyTeam: input.legacyTeam,
        secondaryTeam: input.secondaryTeam,
        secondaryLegacyTeam: input.secondaryLegacyTeam,
        specificRole: input.specificRole,
        secondarySpecificRole: input.secondarySpecificRole,
        isExternal: true
      }),
      ...explicitPermissions.filter((permission) => permission === "dashboard:read" || permission.startsWith("external-"))
    ]);

    return Array.from(permissions).sort();
  }

  if (explicitPermissions.includes("*")) {
    return ["*"];
  }

  const permissions = new Set<string>([
    ...derivePermissions({
      legacyRole: input.legacyRole,
      team: input.team,
      legacyTeam: input.legacyTeam,
      secondaryTeam: input.secondaryTeam,
      secondaryLegacyTeam: input.secondaryLegacyTeam,
      specificRole: input.specificRole,
      secondarySpecificRole: input.secondarySpecificRole,
      isExternal: input.isExternal
    }),
    ...explicitPermissions
  ]);

  return Array.from(permissions).sort();
}
