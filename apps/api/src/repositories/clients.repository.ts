import type { PrismaClient } from "@prisma/client";

import { AppError } from "../core/errors/app-error";
import { getNextClientNumber, normalizeClientName, sortClientRecords } from "./clients.shared";
import { mapClient } from "./mappers";
import type { ClientsRepository } from "./types";

export class PrismaClientsRepository implements ClientsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.client.findMany({
      where: {
        deletedAt: null
      }
    });
    return sortClientRecords(records).map(mapClient);
  }

  public async create(name: string) {
    const record = await this.prisma.client.create({
      data: {
        clientNumber: await getNextClientNumber(this.prisma),
        name: normalizeClientName(name)
      }
    });

    return mapClient(record);
  }

  public async update(clientId: string, name: string) {
    await this.findClientOrThrow(clientId);

    const record = await this.prisma.client.update({
      where: { id: clientId },
      data: {
        name: normalizeClientName(name)
      }
    });

    return mapClient(record);
  }

  public async delete(clientId: string) {
    await this.findClientOrThrow(clientId);

    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        deletedAt: new Date()
      }
    });
  }

  private async findClientOrThrow(clientId: string) {
    const record = await this.prisma.client.findUnique({
      where: { id: clientId }
    });

    if (!record || record.deletedAt) {
      throw new AppError(404, "CLIENT_NOT_FOUND", "El cliente solicitado no existe.");
    }

    return record;
  }
}
