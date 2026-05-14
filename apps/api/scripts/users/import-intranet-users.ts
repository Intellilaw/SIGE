import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import {
  buildDisplayName,
  derivePermissions,
  deriveSystemRole,
  findTeamOptionByLabel,
  normalizeLegacyUsername,
  normalizeLegacyUsernameKey,
  normalizeShortName,
  resolveUniqueLegacyUsername
} from "@sige/contracts";
import { z } from "zod";

import { hashPassword } from "../../src/core/auth/passwords";

const rawUserMetaSchema = z.record(z.string(), z.unknown()).optional();

const exportedUserSchema = z.object({
  legacyUserId: z.string().min(1),
  email: z.string().email(),
  username: z.string().optional().nullable(),
  displayName: z.string().optional().nullable(),
  legacyRole: z.string().optional().nullable(),
  legacyTeam: z.string().optional().nullable(),
  specificRole: z.string().optional().nullable(),
  shortName: z.string().optional().nullable(),
  createdAt: z.string().datetime().optional().nullable(),
  lastLoginAt: z.string().datetime().optional().nullable(),
  emailConfirmedAt: z.string().datetime().optional().nullable(),
  rawUserMetaData: rawUserMetaSchema
});

const exportFileSchema = z.object({
  source: z.string().optional(),
  exportedAt: z.string().datetime().optional(),
  totalUsers: z.number().optional(),
  users: z.array(exportedUserSchema)
});

type ExportedUser = z.infer<typeof exportedUserSchema>;

interface ImportableUser {
  source: ExportedUser;
  email: string;
  usernameSource: string;
  username: string;
  displayName: string;
  legacyRole: "SUPERADMIN" | "INTRANET";
  legacyTeam?: string;
  specificRole?: string;
  shortName?: string;
  team?: string;
  role: "SUPERADMIN" | "DIRECTOR" | "TEAM_LEAD" | "ANALYST" | "AUDITOR";
  permissions: string[];
  createdAt?: Date;
  lastLoginAt?: Date;
  emailConfirmedAt?: Date;
}

function trimToUndefined(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function pickMetadataValue(source: ExportedUser, key: "username" | "nombre" | "team" | "specific_role" | "short_name" | "role") {
  const value = source.rawUserMetaData?.[key];
  return typeof value === "string" ? trimToUndefined(value) : undefined;
}

const KNOWN_ACCENT_FIXES = new Map([
  ["Alejandra Mejia", "Alejandra Mejía"],
  ["Alfonso Ramirez", "Alfonso Ramírez"],
  ["Andrea Olguin", "Andrea Olguín"],
  ["Axel mendoza", "Axel Mendoza"],
  ["Carlos Garcï¿½a", "Carlos García"],
  ["Evelyng Pï¿½rez", "Evelyng Pérez"],
  ["Hector Marquina", "Héctor Marquina"],
  ["Jael Lï¿½pez", "Jael López"],
  ["Jesus Ramirez", "Jesús Ramírez"],
  ["Martin Pantoja", "Martín Pantoja"],
  ["Mayra Ordoï¿½ez", "Mayra Ordóñez"],
  ["Miguel ï¿½ngel Valencia", "Miguel Ángel Valencia"],
  ["Rene Viruega", "René Viruega"],
  ["Verï¿½nica Mariana Salas Elisea", "Verónica Mariana Salas Elisea"],
  ["Verï¿½nica Salas", "Verónica Salas"],
  ["Yoseline Alvarez", "Yoseline Álvarez"],
  ["AuditorÃ­a", "Auditoría"]
]);

function repairKnownAccents(value?: string) {
  return value ? KNOWN_ACCENT_FIXES.get(value) ?? value : undefined;
}

function mapLegacyRole(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "superadmin") {
    return "SUPERADMIN" as const;
  }

  if (normalized === "intranet") {
    return "INTRANET" as const;
  }

  return null;
}

function countIdentityTokens(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function pickUsernameSource(source: ExportedUser) {
  const candidates = [
    trimToUndefined(source.displayName),
    trimToUndefined(source.username),
    pickMetadataValue(source, "nombre"),
    pickMetadataValue(source, "username"),
    source.email.split("@")[0]
  ].filter((value): value is string => Boolean(value));

  return [...candidates].sort(
    (left, right) =>
      countIdentityTokens(right) - countIdentityTokens(left) ||
      right.length - left.length
  )[0] ?? source.email;
}

function buildImportableUser(source: ExportedUser): ImportableUser | null {
  const legacyRole = mapLegacyRole(source.legacyRole ?? pickMetadataValue(source, "role"));
  if (!legacyRole) {
    return null;
  }

  const email = source.email.trim().toLowerCase();
  const usernameSource = pickUsernameSource(source);
  const username = normalizeLegacyUsername(usernameSource);

  if (!username) {
    throw new Error(`Unable to derive username for ${email}.`);
  }

  const displayName =
    repairKnownAccents(trimToUndefined(source.displayName)) ??
    repairKnownAccents(pickMetadataValue(source, "nombre")) ??
    buildDisplayName(usernameSource);
  const legacyTeam = repairKnownAccents(trimToUndefined(source.legacyTeam) ?? pickMetadataValue(source, "team"));
  const specificRole = repairKnownAccents(trimToUndefined(source.specificRole) ?? pickMetadataValue(source, "specific_role"));
  const shortName = normalizeShortName(trimToUndefined(source.shortName) ?? pickMetadataValue(source, "short_name"));
  const team = findTeamOptionByLabel(legacyTeam)?.key;
  const role = deriveSystemRole({ legacyRole, legacyTeam, specificRole });
  const permissions = derivePermissions({ legacyRole, legacyTeam, specificRole });

  return {
    source,
    email,
    usernameSource,
    username,
    displayName,
    legacyRole,
    legacyTeam,
    specificRole,
    shortName,
    team,
    role,
    permissions,
    createdAt: source.createdAt ? new Date(source.createdAt) : undefined,
    lastLoginAt: source.lastLoginAt ? new Date(source.lastLoginAt) : undefined,
    emailConfirmedAt: source.emailConfirmedAt ? new Date(source.emailConfirmedAt) : undefined
  };
}

function groupDuplicates(values: string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

function parseCommandLine() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDirectory, "../../../..");
  const { values } = parseArgs({
    options: {
      input: { type: "string" },
      report: { type: "string" },
      apply: { type: "boolean", default: false }
    },
    allowPositionals: false
  });

  if (!values.input) {
    throw new Error("Missing required --input argument.");
  }

  return {
    inputPath: path.resolve(repoRoot, values.input),
    reportPath: path.resolve(
      repoRoot,
      values.report ?? "runtime-logs/intranet-users-import-report.json"
    ),
    apply: values.apply
  };
}

async function main() {
  const { inputPath, reportPath, apply } = parseCommandLine();
  const fileContents = await readFile(inputPath, "utf8");
  const parsedExport = exportFileSchema.parse(JSON.parse(fileContents));

  const skippedPublicUsers: string[] = [];
  const importableUsers: ImportableUser[] = [];

  for (const sourceUser of parsedExport.users) {
    const normalizedUser = buildImportableUser(sourceUser);
    if (!normalizedUser) {
      skippedPublicUsers.push(sourceUser.email);
      continue;
    }

    importableUsers.push(normalizedUser);
  }

  const duplicateEmails = groupDuplicates(importableUsers.map((entry) => entry.email));
  if (duplicateEmails.length > 0) {
    throw new Error(
      `Export file contains duplicate emails. Emails: ${JSON.stringify(duplicateEmails)}`
    );
  }

  const duplicateShortNames = groupDuplicates(
    importableUsers
      .map((entry) => entry.shortName)
      .filter((entry): entry is string => Boolean(entry))
  );
  const unmappedTeams = Array.from(
    new Set(
      importableUsers
        .filter((entry) => entry.legacyTeam && !entry.team)
        .map((entry) => entry.legacyTeam as string)
    )
  );

  const prisma = new PrismaClient();
  const reportEntries: Array<Record<string, unknown>> = [];

  try {
    const importableEmails = new Set(importableUsers.map((entry) => entry.email));
    const existingUsers = await prisma.user.findMany({
      select: {
        email: true,
        username: true
      }
    });
    const takenUsernames = new Set(
      existingUsers
        .filter((entry) => !importableEmails.has(entry.email))
        .map((entry) => normalizeLegacyUsernameKey(entry.username))
    );
    const plannedUsers = [...importableUsers]
      .sort(
        (left, right) =>
          countIdentityTokens(left.usernameSource) - countIdentityTokens(right.usernameSource) ||
          left.email.localeCompare(right.email)
      )
      .map((user) => {
        const username = resolveUniqueLegacyUsername(user.usernameSource, takenUsernames);
        takenUsernames.add(username);
        return {
          ...user,
          username
        };
      });
    const duplicateUsernames = groupDuplicates(
      plannedUsers.map((entry) => normalizeLegacyUsernameKey(entry.username))
    );
    if (duplicateUsernames.length > 0) {
      throw new Error(`Unable to resolve duplicate usernames: ${JSON.stringify(duplicateUsernames)}`);
    }
    const plannedUsersByEmail = new Map(plannedUsers.map((entry) => [entry.email, entry] as const));

    for (const user of importableUsers.map((entry) => plannedUsersByEmail.get(entry.email) ?? entry)) {
      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      const operation = existing ? "update" : "create";
      const passwordHash = hashPassword(randomBytes(32).toString("hex"));

      if (apply) {
        await prisma.user.upsert({
          where: { email: user.email },
          update: {
            username: user.username,
            displayName: user.displayName,
            shortName: user.shortName ?? null,
            role: user.role,
            legacyRole: user.legacyRole,
            team: user.team ?? null,
            legacyTeam: user.legacyTeam ?? null,
            specificRole: user.specificRole ?? null,
            permissions: user.permissions,
            isActive: true,
            passwordResetRequired: true,
            lastLoginAt: user.lastLoginAt ?? null,
            emailConfirmedAt: user.emailConfirmedAt ?? new Date(),
            passwordHash
          },
          create: {
            email: user.email,
            username: user.username,
            displayName: user.displayName,
            shortName: user.shortName ?? null,
            role: user.role,
            legacyRole: user.legacyRole,
            team: user.team ?? null,
            legacyTeam: user.legacyTeam ?? null,
            specificRole: user.specificRole ?? null,
            permissions: user.permissions,
            isActive: true,
            passwordResetRequired: true,
            lastLoginAt: user.lastLoginAt ?? null,
            emailConfirmedAt: user.emailConfirmedAt ?? new Date(),
            passwordHash,
            createdAt: user.createdAt ?? new Date()
          }
        });
      }

      reportEntries.push({
        operation: apply ? operation : `${operation}:preview`,
        email: user.email,
        username: user.username,
        legacyRole: user.legacyRole,
        legacyTeam: user.legacyTeam ?? null,
        specificRole: user.specificRole ?? null,
        shortName: user.shortName ?? null,
        internalRole: user.role,
        internalTeam: user.team ?? null,
        permissions: user.permissions,
        usernameSource: user.usernameSource,
        passwordStrategy: "metadata-only-random-password-force-reset"
      });
    }
  } finally {
    await prisma.$disconnect();
  }

  const report = {
    source: parsedExport.source ?? "Intranet",
    exportedAt: parsedExport.exportedAt ?? null,
    executedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    passwordStrategy: {
      type: "metadata-only-random-password-force-reset",
      description:
        "The importer never copies legacy passwords. Every imported account receives a random unknown password hash, forcing a reset before productive use."
    },
    summary: {
      totalUsersInFile: parsedExport.users.length,
      importableUsers: importableUsers.length,
      skippedPublicUsers: skippedPublicUsers.length,
      duplicateShortNames: duplicateShortNames.length,
      unmappedTeams: unmappedTeams.length
    },
    warnings: {
      skippedPublicUsers,
      duplicateShortNames,
      unmappedTeams
    },
    users: reportEntries
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report written to ${reportPath}`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write into SIGE_2.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
