import type { PrismaClient } from "@prisma/client";

import { mapManagedUser } from "./mappers";
import type { CreateManagedUserRecord, UpdateManagedUserRecord, UsersRepository } from "./types";

export class PrismaUsersRepository implements UsersRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return records.map(mapManagedUser);
  }

  public async findById(userId: string) {
    const record = await this.prisma.user.findUnique({ where: { id: userId } });
    return record ? mapManagedUser(record) : null;
  }

  public async create(payload: CreateManagedUserRecord) {
    const record = await this.prisma.user.create({
      data: {
        email: payload.email,
        username: payload.username,
        displayName: payload.displayName ?? payload.username,
        shortName: payload.shortName ?? null,
        role: payload.role,
        legacyRole: payload.legacyRole,
        team: payload.team ?? null,
        legacyTeam: payload.legacyTeam ?? null,
        specificRole: payload.specificRole ?? null,
        permissions: payload.permissions,
        passwordHash: payload.passwordHash,
        isActive: true,
        passwordResetRequired: false,
        emailConfirmedAt: new Date()
      }
    });

    return mapManagedUser(record);
  }

  public async update(
    userId: string,
    payload: UpdateManagedUserRecord
  ) {
    const record = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: payload.displayName,
        passwordHash: payload.passwordHash,
        shortName: payload.shortName === undefined ? undefined : payload.shortName,
        role: payload.role,
        legacyRole: payload.legacyRole,
        team: payload.team === undefined ? undefined : payload.team,
        legacyTeam: payload.legacyTeam === undefined ? undefined : payload.legacyTeam,
        specificRole: payload.specificRole === undefined ? undefined : payload.specificRole,
        permissions: payload.permissions,
        isActive: payload.isActive,
        passwordResetRequired: payload.passwordResetRequired,
        emailConfirmedAt: payload.emailConfirmedAt === undefined
          ? undefined
          : payload.emailConfirmedAt
            ? new Date(payload.emailConfirmedAt)
            : null
      }
    });

    return mapManagedUser(record);
  }

  public async delete(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
