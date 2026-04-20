import type { PrismaClient } from "@prisma/client";

import { mapClient } from "./mappers";
import type { ClientsRepository } from "./types";

export class PrismaClientsRepository implements ClientsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list() {
    const records = await this.prisma.client.findMany({ orderBy: { name: "asc" } });
    return records.map(mapClient);
  }

  public async create(name: string) {
    const count = await this.prisma.client.count();
    const record = await this.prisma.client.create({
      data: {
        clientNumber: String(1000 + count + 1),
        name
      }
    });

    return mapClient(record);
  }
}