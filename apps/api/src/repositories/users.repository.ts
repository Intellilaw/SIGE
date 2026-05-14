import type { PrismaClient } from "@prisma/client";

import { mapManagedUser } from "./mappers";
import { buildLaborFileSnapshot, shouldHaveLaborFile } from "./labor-files.repository";
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
    const record = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
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

      if (shouldHaveLaborFile(user)) {
        await tx.laborFile.create({
          data: {
            user: { connect: { id: user.id } },
            ...buildLaborFileSnapshot(user),
            status: "INCOMPLETE"
          }
        });
      }

      return user;
    });

    return mapManagedUser(record);
  }

  public async update(
    userId: string,
    payload: UpdateManagedUserRecord
  ) {
    const record = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
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

      if (shouldHaveLaborFile(user)) {
        await tx.laborFile.upsert({
          where: { userId: user.id },
          create: {
            user: { connect: { id: user.id } },
            ...buildLaborFileSnapshot(user),
            status: "INCOMPLETE"
          },
          update: buildLaborFileSnapshot(user)
        });
      }

      return user;
    });

    return mapManagedUser(record);
  }

  public async delete(userId: string) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { isActive: false }
      });

      const laborFile = await tx.laborFile.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (laborFile) {
        await tx.laborFile.update({
          where: { id: laborFile.id },
          data: {
            ...buildLaborFileSnapshot(user),
            employmentStatus: "FORMER",
            employmentEndedAt: new Date()
          }
        });
      } else if (shouldHaveLaborFile(user)) {
        await tx.laborFile.create({
          data: {
            user: { connect: { id: user.id } },
            ...buildLaborFileSnapshot(user),
            status: "INCOMPLETE",
            employmentStatus: "FORMER",
            employmentEndedAt: new Date()
          }
        });
      }
    });
  }
}
