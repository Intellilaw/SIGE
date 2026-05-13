import type { AuthUser, LegacyAccessRole, SystemRole, Team } from "./domain";

export const USERNAME_FAKE_DOMAIN = "@calculadora.app";

export interface TeamOption {
  key: Team;
  label: string;
}

export const TEAM_OPTIONS: TeamOption[] = [
  { key: "LITIGATION", label: "Litigio" },
  { key: "CORPORATE_LABOR", label: "Corporativo y laboral" },
  { key: "SETTLEMENTS", label: "Convenios" },
  { key: "FINANCIAL_LAW", label: "Der Financiero" },
  { key: "TAX_COMPLIANCE", label: "Compliance Fiscal" },
  { key: "CLIENT_RELATIONS", label: "Comunicación con cliente" },
  { key: "FINANCE", label: "Finanzas" },
  { key: "ADMIN_OPERATIONS", label: "Servicios administrativos" },
  { key: "AUDIT", label: "Auditoría" },
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
  displayName?: string;
  shortName?: string;
  legacyRole?: LegacyAccessRole;
  legacyTeam?: string;
  specificRole?: string;
}

export interface UpdateManagedUserInput {
  displayName?: string;
  password?: string;
  shortName?: string | null;
  legacyRole?: LegacyAccessRole;
  legacyTeam?: string | null;
  specificRole?: string | null;
  isActive?: boolean;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

const PRACTICE_TEAM_MODULES: Record<string, string> = {
  litigio: "litigation",
  "corporativo y laboral": "corporate-labor",
  "corporativo laboral": "corporate-labor",
  convenios: "settlements",
  "der financiero": "financial-law",
  "derecho financiero": "financial-law",
  "compliance fiscal": "tax-compliance"
};

function getPracticeTeamModuleId(normalizedTeam: string) {
  return PRACTICE_TEAM_MODULES[normalizedTeam];
}

export function deriveSystemRole(input: {
  legacyRole: LegacyAccessRole;
  legacyTeam?: string | null;
  specificRole?: string | null;
}): SystemRole {
  if (input.legacyRole === "SUPERADMIN") {
    return "SUPERADMIN";
  }

  const specificRole = normalizeText(input.specificRole ?? "");
  const normalizedTeam = normalizeText(input.legacyTeam ?? "");

  if (specificRole === "direccion general") {
    return "DIRECTOR";
  }

  if (specificRole === "auditor" || normalizedTeam === "auditoria") {
    return "AUDITOR";
  }

  if (specificRole.includes("(lider)")) {
    return "TEAM_LEAD";
  }

  return "ANALYST";
}

export function derivePermissions(input: {
  legacyRole: LegacyAccessRole;
  legacyTeam?: string | null;
  specificRole?: string | null;
}): string[] {
  const specificRole = normalizeText(input.specificRole ?? "");
  const normalizedTeam = normalizeText(input.legacyTeam ?? "");
  const isFinanceTeam = normalizedTeam === "finanzas" || specificRole === "finanzas";
  const isClientRelationsTeam = normalizedTeam === "comunicacion con cliente" || specificRole === "comunicacion con cliente";
  const isAuditTeam = normalizedTeam === "auditoria";
  const isAdminOperationsTeam = normalizedTeam === "servicios administrativos";
  const practiceTeamModuleId = getPracticeTeamModuleId(normalizedTeam);
  const isPracticeTeam = Boolean(practiceTeamModuleId);

  if (isAuditTeam) {
    return [
      "general-expenses:jnls-approval:write",
      "general-expenses:read"
    ];
  }

  if (input.legacyRole === "SUPERADMIN" || specificRole === "direccion general") {
    return ["*"];
  }

  const permissions = new Set<string>([
    ...(
      isAuditTeam
        ? []
        : ["dashboard:read"]
    ),
    ...(
      isFinanceTeam || isClientRelationsTeam || isAuditTeam || isAdminOperationsTeam
        ? []
        : [
            "catalog:read",
            "commissions:read",
            "documents-third-party:read",
            "brief-manager:read",
            "internal-contracts:read",
            "labor-file:read",
            "kpis:read"
          ]
    )
  ]);

  if (isPracticeTeam && practiceTeamModuleId) {
    permissions.delete("catalog:read");
    permissions.delete("internal-contracts:read");
    permissions.delete("labor-file:read");
    permissions.delete("kpis:read");
    permissions.add("tasks:read");
    permissions.add(`tasks:${practiceTeamModuleId}`);
    permissions.add(`execution:${practiceTeamModuleId}`);
    permissions.add("commissions:read");
    permissions.add("commissions:own-section:write");
    permissions.add("daily-documents:read");
    permissions.add("daily-documents:write");
    permissions.add("documents-third-party:read");
    permissions.add("documents-third-party:write");
    permissions.add("brief-manager:read");
    permissions.add("brief-manager:write");
    permissions.add("leads:read");
    permissions.add("matters:read");
    permissions.add("finances:read");
    permissions.add("general-expenses:read");
  }

  if (isAdminOperationsTeam) {
    permissions.add("clients:read");
    permissions.add("clients:write");
    permissions.add("general-expenses:read");
    permissions.add("general-expenses:write");
    permissions.add("budget-planning:read");
    permissions.add("budget-planning:write");
    permissions.add("internal-contracts:read");
    permissions.add("internal-contracts:write");
    permissions.add("labor-file:read");
    permissions.add("labor-file:write");
    permissions.add("daily-documents:read");
    permissions.add("daily-documents:write");
    permissions.add("documents-third-party:read");
    permissions.add("documents-third-party:write");
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
    permissions.add("finances:read");
    permissions.add("general-expenses:read");
    permissions.add("commissions:read");
    permissions.add("commissions:client-relations:write");
    permissions.add("internal-contracts:read");
    permissions.add("internal-contracts:write");
    permissions.add("daily-documents:read");
    permissions.add("daily-documents:write");
    permissions.add("documents-third-party:read");
    permissions.add("documents-third-party:write");
  }

  if (isFinanceTeam) {
    permissions.add("clients:read");
    permissions.add("clients:write");
    permissions.add("quotes:read");
    permissions.add("quotes:write");
    permissions.add("leads:read");
    permissions.add("leads:write");
    permissions.add("matters:read");
    permissions.add("finances:read");
    permissions.add("finances:write");
    permissions.add("general-expenses:read");
    permissions.add("general-expenses:write");
    permissions.add("budget-planning:read");
    permissions.add("budget-planning:write");
    permissions.add("commissions:read");
    permissions.add("commissions:write");
    permissions.add("internal-contracts:read");
    permissions.add("internal-contracts:write");
    permissions.add("labor-file:read");
    permissions.add("labor-file:write");
    permissions.add("daily-documents:read");
    permissions.add("daily-documents:write");
    permissions.add("documents-third-party:read");
    permissions.add("documents-third-party:write");
  }

  if (normalizedTeam === "litigio") {
    permissions.add("tasks:read");
    permissions.add("tasks:litigation");
    permissions.add("execution:litigation");
  }

  if (normalizedTeam === "corporativo y laboral") {
    permissions.add("tasks:read");
    permissions.add("tasks:corporate-labor");
    permissions.add("execution:corporate-labor");
  }

  if (normalizedTeam === "convenios") {
    permissions.add("tasks:read");
    permissions.add("tasks:settlements");
    permissions.add("execution:settlements");
  }

  if (normalizedTeam === "der financiero") {
    permissions.add("tasks:read");
    permissions.add("tasks:financial-law");
    permissions.add("execution:financial-law");
  }

  if (normalizedTeam === "compliance fiscal") {
    permissions.add("tasks:read");
    permissions.add("tasks:tax-compliance");
    permissions.add("execution:tax-compliance");
  }

  if (!isPracticeTeam && specificRole.includes("(lider)")) {
    permissions.add("kpis:team-manage");
  }

  if (!isPracticeTeam && specificRole === "litigio (lider)") {
    permissions.add("tasks:litigation:additional");
  }

  if (!isPracticeTeam && specificRole === "corporativo-laboral (lider)") {
    permissions.add("tasks:corporate-labor:additional");
  }

  if (!isPracticeTeam && specificRole === "convenios (lider)") {
    permissions.add("tasks:settlements:additional");
  }

  if (!isPracticeTeam && specificRole === "der financiero (lider)") {
    permissions.add("tasks:financial-law:additional");
  }

  if (!isPracticeTeam && specificRole === "compliance fiscal (lider)") {
    permissions.add("tasks:tax-compliance:additional");
  }

  return Array.from(permissions).sort();
}

export function deriveEffectivePermissions(input: {
  legacyRole: LegacyAccessRole;
  legacyTeam?: string | null;
  specificRole?: string | null;
  team?: Team | null;
}) {
  return derivePermissions({
    legacyRole: input.legacyRole,
    legacyTeam: input.legacyTeam ?? getLegacyTeamLabel(input.team),
    specificRole: input.specificRole
  });
}
