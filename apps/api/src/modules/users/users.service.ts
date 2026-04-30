import {
  buildDisplayName,
  buildLegacyEmail,
  derivePermissions,
  deriveSystemRole,
  findTeamOptionByLabel,
  normalizeLegacyUsername,
  normalizeShortName,
  type Team,
  type CreateManagedUserInput,
  type UpdateManagedUserInput
} from "@sige/contracts";

import { AppError } from "../../core/errors/app-error";
import { assertStrongPassword } from "../../core/auth/password-policy";
import { hashPassword } from "../../core/auth/passwords";
import type { UsersRepository } from "../../repositories/types";

export class UsersService {
  public constructor(private readonly repository: UsersRepository) {}

  public list() {
    return this.repository.list();
  }

  public async listTeamShortNames(team: Team) {
    const users = await this.repository.list();
    const shortNames = users
      .filter((user) => user.isActive && user.team === team)
      .map((user) => normalizeShortName(user.shortName))
      .filter((shortName): shortName is string => Boolean(shortName));

    return Array.from(new Set(shortNames)).sort((left, right) => left.localeCompare(right));
  }

  public async create(payload: CreateManagedUserInput) {
    const username = normalizeLegacyUsername(payload.username);
    if (!username) {
      throw new AppError(400, "INVALID_USERNAME", "Username is required.");
    }

    const legacyRole = payload.legacyRole ?? "INTRANET";
    const legacyTeam = payload.legacyTeam?.trim() || undefined;
    const specificRole = payload.specificRole?.trim() || undefined;
    const team = findTeamOptionByLabel(legacyTeam)?.key;
    const role = deriveSystemRole({ legacyRole, legacyTeam, specificRole });
    const permissions = derivePermissions({ legacyRole, legacyTeam, specificRole });
    assertStrongPassword(payload.password);

    return this.repository.create({
      email: buildLegacyEmail(username),
      username,
      displayName: payload.displayName?.trim() || buildDisplayName(username),
      shortName: normalizeShortName(payload.shortName),
      role,
      legacyRole,
      team,
      legacyTeam,
      specificRole,
      permissions,
      passwordHash: hashPassword(payload.password)
    });
  }

  public async update(userId: string, payload: UpdateManagedUserInput) {
    const currentUser = await this.repository.findById(userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    const legacyRole = payload.legacyRole ?? currentUser.legacyRole;
    const legacyTeam = payload.legacyTeam === undefined
      ? currentUser.legacyTeam
      : payload.legacyTeam?.trim() || undefined;
    const specificRole = payload.specificRole === undefined
      ? currentUser.specificRole
      : payload.specificRole?.trim() || undefined;
    const role = deriveSystemRole({ legacyRole, legacyTeam, specificRole });
    const permissions = derivePermissions({ legacyRole, legacyTeam, specificRole });
    const nextPassword = payload.password?.trim();

    if (nextPassword) {
      assertStrongPassword(nextPassword);
    }

    return this.repository.update(userId, {
      displayName: payload.displayName?.trim(),
      passwordHash: nextPassword ? hashPassword(nextPassword) : undefined,
      shortName: payload.shortName === undefined ? undefined : normalizeShortName(payload.shortName) ?? null,
      role,
      legacyRole,
      team: findTeamOptionByLabel(legacyTeam)?.key,
      legacyTeam: legacyTeam ?? null,
      specificRole: specificRole ?? null,
      permissions,
      isActive: payload.isActive,
      passwordResetRequired: nextPassword ? false : undefined,
      emailConfirmedAt: nextPassword
        ? (currentUser.emailConfirmedAt ?? new Date().toISOString())
        : undefined
    });
  }

  public async delete(userId: string) {
    const currentUser = await this.repository.findById(userId);
    if (!currentUser) {
      throw new AppError(404, "USER_NOT_FOUND", "User was not found.");
    }

    await this.repository.delete(userId);
  }
}
