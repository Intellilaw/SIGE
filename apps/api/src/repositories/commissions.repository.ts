import { Prisma, type PrismaClient } from "@prisma/client";
import { COMMISSION_SECTIONS } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapCommissionReceiver, mapCommissionSnapshot, mapFinanceRecord, mapGeneralExpense } from "./mappers";
import type { CommissionsRepository, CreateCommissionSnapshotRecord } from "./types";

function normalizeRequiredText(value: string) {
  return value.trim();
}

function asSnapshotJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export class PrismaCommissionsRepository implements CommissionsRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async getOverview(year: number, month: number) {
    await this.ensureDefaultReceivers();

    const [financeRecords, generalExpenses, receivers] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where: { year, month },
        orderBy: [{ clientNumber: "asc" }, { clientName: "asc" }, { subject: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.generalExpense.findMany({
        where: {
          year,
          month,
          paid: true
        },
        orderBy: [{ paidAt: "asc" }, { team: "asc" }, { detail: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.commissionReceiver.findMany({
        orderBy: [{ name: "asc" }]
      })
    ]);

    return {
      financeRecords: financeRecords.map(mapFinanceRecord),
      generalExpenses: generalExpenses.map(mapGeneralExpense),
      receivers: receivers.map(mapCommissionReceiver)
    };
  }

  public async listReceivers() {
    await this.ensureDefaultReceivers();

    const records = await this.prisma.commissionReceiver.findMany({
      orderBy: [{ name: "asc" }]
    });

    return records.map(mapCommissionReceiver);
  }

  public async createReceiver(name: string) {
    const normalizedName = normalizeRequiredText(name);
    if (!normalizedName) {
      throw new AppError(400, "COMMISSION_RECEIVER_NAME_REQUIRED", "The receiver name is required.");
    }

    try {
      const record = await this.prisma.commissionReceiver.create({
        data: {
          name: normalizedName
        }
      });

      return mapCommissionReceiver(record);
    } catch (error) {
      this.rethrowKnownError(error);
      throw error;
    }
  }

  public async updateReceiver(receiverId: string, name: string) {
    const normalizedName = normalizeRequiredText(name);
    if (!normalizedName) {
      throw new AppError(400, "COMMISSION_RECEIVER_NAME_REQUIRED", "The receiver name is required.");
    }

    const current = await this.prisma.commissionReceiver.findUnique({
      where: { id: receiverId }
    });

    if (!current) {
      return null;
    }

    try {
      const record = await this.prisma.commissionReceiver.update({
        where: { id: receiverId },
        data: {
          name: normalizedName
        }
      });

      return mapCommissionReceiver(record);
    } catch (error) {
      this.rethrowKnownError(error);
      throw error;
    }
  }

  public async deleteReceiver(receiverId: string) {
    const result = await this.prisma.commissionReceiver.deleteMany({
      where: { id: receiverId }
    });

    if (result.count === 0) {
      throw new AppError(404, "COMMISSION_RECEIVER_NOT_FOUND", "The requested receiver does not exist.");
    }
  }

  public async listSnapshots() {
    const records = await this.prisma.commissionSnapshot.findMany({
      orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }]
    });

    return records.map(mapCommissionSnapshot);
  }

  public async createSnapshot(payload: CreateCommissionSnapshotRecord) {
    const title = normalizeRequiredText(payload.title);
    const section = normalizeRequiredText(payload.section);

    if (!title) {
      throw new AppError(400, "COMMISSION_SNAPSHOT_TITLE_REQUIRED", "The snapshot title is required.");
    }

    if (!section) {
      throw new AppError(400, "COMMISSION_SNAPSHOT_SECTION_REQUIRED", "The snapshot section is required.");
    }

    const record = await this.prisma.commissionSnapshot.create({
      data: {
        year: payload.year,
        month: payload.month,
        title,
        section,
        totalNetMxn: new Prisma.Decimal(payload.totalNetMxn ?? 0),
        ...(payload.snapshotData === undefined ? {} : { snapshotData: asSnapshotJson(payload.snapshotData) })
      }
    });

    return mapCommissionSnapshot(record);
  }

  private async ensureDefaultReceivers() {
    await this.prisma.commissionReceiver.createMany({
      data: COMMISSION_SECTIONS.map((name) => ({ name })),
      skipDuplicates: true
    });
  }

  private rethrowKnownError(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "COMMISSION_RECEIVER_DUPLICATE", "A receiver with that name already exists.");
    }
  }
}
