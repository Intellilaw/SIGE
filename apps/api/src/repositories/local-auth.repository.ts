import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLegacyEmail,
  buildLegacyUsernameLookupCandidates,
  deriveEffectivePermissions,
  type AuthUser
} from "@sige/contracts";

import { hashPassword } from "../core/auth/passwords";
import type {
  AuthRepository,
  PasswordResetTokenRecord,
  RefreshTokenRecord,
  StoredUser
} from "./types";

interface ImportedUserRecord {
  email: string;
  username: string;
  legacyRole: AuthUser["legacyRole"];
  legacyTeam?: string | null;
  specificRole?: string | null;
  shortName?: string | null;
  internalRole: AuthUser["role"];
  internalTeam?: AuthUser["team"] | null;
  permissions: string[];
}

interface ExportedUserRecord {
  legacyUserId?: string;
  email: string;
  username?: string;
  displayName?: string;
  legacyRole?: string;
  legacyTeam?: string | null;
  specificRole?: string | null;
  shortName?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
  emailConfirmedAt?: string | null;
}

interface LocalStateUser extends StoredUser {
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
  emailConfirmedAt?: string | null;
}

interface LocalAuthState {
  users: LocalStateUser[];
  refreshTokens: RefreshTokenRecord[];
  passwordResetTokens: PasswordResetTokenRecord[];
}

function normalizeLookupValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isNotExpired(isoDate: string) {
  return new Date(isoDate).getTime() > Date.now();
}

function dedupe(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function buildLookupAliases(user: LocalStateUser) {
  const localPart = user.email.split("@")[0] ?? "";
  return dedupe([
    user.email,
    user.username,
    user.displayName,
    localPart,
    localPart.replace(/[._-]+/g, " ")
  ]).map(normalizeLookupValue);
}

export class LocalAuthRepository implements AuthRepository {
  private static readonly repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  private static readonly exportPath = resolve(this.repoRoot, "runtime-logs", "intranet-users-export.json");
  private static readonly importReportPath = resolve(this.repoRoot, "runtime-logs", "intranet-users-import-report.json");
  private static readonly statePath = resolve(this.repoRoot, "apps", "api", "runtime-assets", "local-auth-store.json");

  private state: LocalAuthState | null = null;

  public static isAvailable() {
    return existsSync(this.statePath) || (existsSync(this.exportPath) && existsSync(this.importReportPath));
  }

  public async findStoredUserByIdentifier(identifier: string) {
    const normalizedIdentifier = identifier.trim();
    const normalizedEmail = buildLegacyEmail(normalizedIdentifier);
    const usernameCandidates = buildLegacyUsernameLookupCandidates(normalizedIdentifier).map((candidate) => candidate.toLowerCase());
    const normalizedLookup = normalizeLookupValue(normalizedIdentifier);

    const user = this.getState().users.find((candidate) => {
      if (!candidate.isActive) {
        return false;
      }

      if (candidate.email === normalizedEmail) {
        return true;
      }

      if (usernameCandidates.includes(candidate.username.toLowerCase())) {
        return true;
      }

      return buildLookupAliases(candidate).includes(normalizedLookup);
    });

    return user ? this.asStoredUser(user) : null;
  }

  public async findUserById(userId: string) {
    const user = this.getState().users.find((candidate) => candidate.id === userId);
    return user ? this.asAuthUser(user) : null;
  }

  public async updateLastLoginAt(userId: string) {
    this.updateState((state) => {
      const user = state.users.find((candidate) => candidate.id === userId);
      if (user) {
        user.lastLoginAt = new Date().toISOString();
        user.updatedAt = new Date().toISOString();
      }
    });
  }

  public async updatePassword(
    userId: string,
    passwordHash: string,
    options?: {
      emailConfirmedAt?: string;
      passwordResetRequired?: boolean;
    }
  ) {
    this.updateState((state) => {
      const user = state.users.find((candidate) => candidate.id === userId);
      if (!user) {
        return;
      }

      user.passwordHash = passwordHash;
      user.emailConfirmedAt = options?.emailConfirmedAt ?? user.emailConfirmedAt ?? null;
      if (typeof options?.passwordResetRequired === "boolean") {
        user.passwordResetRequired = options.passwordResetRequired;
      }
      user.updatedAt = new Date().toISOString();
    });
  }

  public async saveRefreshToken(record: RefreshTokenRecord) {
    this.updateState((state) => {
      state.refreshTokens.push(record);
    });
  }

  public async revokeRefreshToken(tokenHash: string) {
    this.updateState((state) => {
      state.refreshTokens = state.refreshTokens.map((record) =>
        record.tokenHash === tokenHash && !record.revokedAt
          ? { ...record, revokedAt: new Date().toISOString() }
          : record
      );
    });
  }

  public async revokeRefreshTokensForUser(userId: string) {
    this.updateState((state) => {
      state.refreshTokens = state.refreshTokens.map((record) =>
        record.userId === userId && !record.revokedAt
          ? { ...record, revokedAt: new Date().toISOString() }
          : record
      );
    });
  }

  public async findRefreshToken(tokenHash: string) {
    return this.getState().refreshTokens.find((record) =>
      record.tokenHash === tokenHash && !record.revokedAt && isNotExpired(record.expiresAt)
    ) ?? null;
  }

  public async savePasswordResetToken(record: PasswordResetTokenRecord) {
    this.updateState((state) => {
      state.passwordResetTokens.push(record);
    });
  }

  public async revokeActivePasswordResetTokensForUser(userId: string) {
    this.updateState((state) => {
      state.passwordResetTokens = state.passwordResetTokens.map((record) =>
        record.userId === userId && !record.consumedAt && isNotExpired(record.expiresAt)
          ? { ...record, consumedAt: new Date().toISOString() }
          : record
      );
    });
  }

  public async findPasswordResetToken(tokenHash: string) {
    return this.getState().passwordResetTokens.find((record) =>
      record.tokenHash === tokenHash && !record.consumedAt && isNotExpired(record.expiresAt)
    ) ?? null;
  }

  public async consumePasswordResetToken(tokenHash: string) {
    this.updateState((state) => {
      state.passwordResetTokens = state.passwordResetTokens.map((record) =>
        record.tokenHash === tokenHash && !record.consumedAt
          ? { ...record, consumedAt: new Date().toISOString() }
          : record
      );
    });
  }

  private getState() {
    if (!this.state) {
      this.state = this.loadState();
    }

    return this.state;
  }

  private loadState(): LocalAuthState {
    if (existsSync(LocalAuthRepository.statePath)) {
      return JSON.parse(readFileSync(LocalAuthRepository.statePath, "utf8")) as LocalAuthState;
    }

    const sourceUsers = this.buildInitialUsers();
    const initialState: LocalAuthState = {
      users: sourceUsers,
      refreshTokens: [],
      passwordResetTokens: []
    };

    this.persistState(initialState);
    return initialState;
  }

  private buildInitialUsers() {
    const exported = JSON.parse(readFileSync(LocalAuthRepository.exportPath, "utf8")) as {
      users: ExportedUserRecord[];
    };
    const imported = JSON.parse(readFileSync(LocalAuthRepository.importReportPath, "utf8")) as {
      users: ImportedUserRecord[];
    };

    const exportedByEmail = new Map(
      exported.users.map((user) => [user.email.toLowerCase(), user] satisfies [string, ExportedUserRecord])
    );

    return imported.users.map((user) => {
      const exportedUser = exportedByEmail.get(user.email.toLowerCase());
      const now = new Date().toISOString();

      return {
        id: exportedUser?.legacyUserId ?? user.email,
        email: user.email,
        username: user.username,
        displayName: exportedUser?.displayName ?? user.username,
        shortName: user.shortName ?? exportedUser?.shortName ?? undefined,
        role: user.internalRole,
        legacyRole: user.legacyRole,
        team: user.internalTeam ?? undefined,
        legacyTeam: user.legacyTeam ?? exportedUser?.legacyTeam ?? undefined,
        specificRole: user.specificRole ?? exportedUser?.specificRole ?? undefined,
        permissions: user.permissions,
        isActive: true,
        passwordResetRequired: true,
        passwordHash: hashPassword(randomBytes(32).toString("hex")),
        createdAt: exportedUser?.createdAt ?? now,
        updatedAt: now,
        lastLoginAt: exportedUser?.lastLoginAt ?? null,
        emailConfirmedAt: exportedUser?.emailConfirmedAt ?? null
      } satisfies LocalStateUser;
    });
  }

  private updateState(mutator: (state: LocalAuthState) => void) {
    const nextState = this.getState();
    mutator(nextState);
    this.persistState(nextState);
  }

  private persistState(state: LocalAuthState) {
    mkdirSync(dirname(LocalAuthRepository.statePath), { recursive: true });
    writeFileSync(LocalAuthRepository.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  private asStoredUser(user: LocalStateUser): StoredUser {
    return {
      ...this.asAuthUser(user),
      passwordHash: user.passwordHash
    };
  }

  private asAuthUser(user: LocalStateUser): AuthUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      shortName: user.shortName,
      role: user.role,
      legacyRole: user.legacyRole,
      team: user.team,
      legacyTeam: user.legacyTeam,
      specificRole: user.specificRole,
      permissions: deriveEffectivePermissions({
        legacyRole: user.legacyRole,
        team: user.team,
        legacyTeam: user.legacyTeam,
        specificRole: user.specificRole
      }),
      isActive: user.isActive,
      passwordResetRequired: user.passwordResetRequired
    };
  }
}
