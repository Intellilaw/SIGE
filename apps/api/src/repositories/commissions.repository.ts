import { Prisma, type PrismaClient } from "@prisma/client";
import { COMMISSION_SECTIONS, type CommissionRecipientAssignment } from "@sige/contracts";
import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import {
  assertCommissionPeriodUnlocked,
  buildCommissionPeriodSourceHash,
  getCommissionPeriodLock,
  isRusconiCommissionPaymentFlow
} from "./commission-period-lock";
import { getRequiredCommissionReceiverNames } from "./commission-receiver-defaults";
import { attachSalesCommissionsToFinanceRecords } from "./finance-sales-commissions";
import type { KpiCommissionRequirementsService } from "./kpi-commission-requirements";
import {
  mapCommissionExclusion,
  mapCommissionPaymentAcknowledgement,
  mapCommissionReceiver,
  mapCommissionSnapshot,
  mapFinanceRecord,
  mapGeneralExpense,
  mapProjectorCommission
} from "./mappers";
import type {
  CommissionExclusionWriteRecord,
  CommissionPaymentAcknowledgementUpdateRecord,
  CommissionPaymentActor,
  CommissionPaymentReconcileRow,
  CommissionSignedReceiptUploadRecord,
  CommissionsRepository,
  CreateCommissionSnapshotRecord,
  ProjectorCommissionUpdateRecord
} from "./types";

function normalizeRequiredText(value: string) {
  return value.trim();
}

function asSnapshotJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function normalizeMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function moneyChanged(left: number | Prisma.Decimal, right: number | Prisma.Decimal) {
  return normalizeMoney(Number(left)) !== normalizeMoney(Number(right));
}

function normalizeRoleKey(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const PROJECTOR_SECTION_BY_ROLE = new Map([
  [normalizeRoleKey("Proyectista 1"), "Proyectista 1 (EKPO)"],
  [normalizeRoleKey("Proyectista 2"), "Proyectista 2 (NBSG)"]
]);

const NAMED_COMMISSION_RECIPIENTS = ["Emilio Petith", "Joaquín Pani", "Edgar Ortuño"];

function commissionSectionForRole(role?: string | null) {
  const normalizedRole = normalizeRoleKey(role);
  if (!normalizedRole) {
    return null;
  }

  return PROJECTOR_SECTION_BY_ROLE.get(normalizedRole)
    ?? COMMISSION_SECTIONS.find((section) => normalizeRoleKey(section) === normalizedRole)
    ?? null;
}

function buildRecipientAssignments(users: Array<{
  id: string;
  displayName: string;
  specificRole: string | null;
  secondarySpecificRole: string | null;
}>) {
  const assignments = new Map<string, CommissionRecipientAssignment>();

  users.forEach((user) => {
    [user.specificRole, user.secondarySpecificRole].forEach((role) => {
      const section = commissionSectionForRole(role);
      const recipientName = user.displayName.trim();
      if (!section || !recipientName) {
        return;
      }

      const key = normalizeRoleKey(section);
      if (!assignments.has(key)) {
        assignments.set(key, { section, recipientName, userId: user.id });
      }
    });
  });

  NAMED_COMMISSION_RECIPIENTS.forEach((recipientName) => {
    const key = normalizeRoleKey(recipientName);
    if (!assignments.has(key)) {
      assignments.set(key, { section: recipientName, recipientName });
    }
  });

  return [...assignments.values()];
}

export class PrismaCommissionsRepository implements CommissionsRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly commissionRequirements: KpiCommissionRequirementsService
  ) {}

  public async getOverview(year: number, month: number) {
    await this.ensureDefaultReceivers();

    const [financeRecords, generalExpenses, receivers, exclusions, projectorCommissions, paymentFlow, activeUsers] = await Promise.all([
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
      }),
      this.prisma.commissionExclusion.findMany({
        where: { year, month },
        orderBy: [{ section: "asc" }, { group: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.projectorCommission.findMany({
        where: { year, month },
        orderBy: [{ section: "asc" }, { completedAt: "asc" }, { createdAt: "asc" }]
      }),
      this.getPaymentFlowState(year, month),
      this.prisma.user.findMany({
        where: { isActive: true },
        orderBy: [{ displayName: "asc" }, { username: "asc" }],
        select: {
          id: true,
          displayName: true,
          specificRole: true,
          secondarySpecificRole: true
        }
      })
    ]);
    const enrichedFinanceRecords = await attachSalesCommissionsToFinanceRecords(
      this.prisma,
      financeRecords.map(mapFinanceRecord)
    );
    const recipientAssignments = buildRecipientAssignments(activeUsers);
    const releaseEligibility = await this.commissionRequirements.getEligibilityForMonth(year, month);
    const paidUserIds = new Set(
      paymentFlow.acknowledgements
        .filter((acknowledgement) => acknowledgement.paidByTransfer || acknowledgement.receivedByEmrt)
        .flatMap((acknowledgement) => {
          const assignment = recipientAssignments.find((candidate) =>
            normalizeRoleKey(candidate.section) === normalizeRoleKey(acknowledgement.section)
          );
          return assignment?.userId ? [assignment.userId] : [];
        })
    );

    return {
      financeRecords: enrichedFinanceRecords,
      generalExpenses: generalExpenses.map(mapGeneralExpense),
      receivers: receivers.map(mapCommissionReceiver),
      recipientAssignments,
      exclusions: exclusions.map(mapCommissionExclusion),
      projectorCommissions: projectorCommissions.map(mapProjectorCommission),
      paymentAcknowledgements: paymentFlow.acknowledgements,
      commissionReleaseEligibilities: releaseEligibility.map((eligibility) => ({
        ...eligibility,
        auditAlert: eligibility.blocked && paidUserIds.has(eligibility.userId)
      })),
      periodLocked: paymentFlow.locked
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

  public async setExclusion(payload: CommissionExclusionWriteRecord) {
    await assertCommissionPeriodUnlocked(this.prisma, payload.year, payload.month);
    const organizationId = getCurrentOrganizationIdOrDefault();
    const record = await this.prisma.commissionExclusion.upsert({
      where: {
        organizationId_year_month_section_group_financeRecordId: {
          organizationId,
          year: payload.year,
          month: payload.month,
          section: payload.section,
          group: payload.group,
          financeRecordId: payload.financeRecordId
        }
      },
      create: {
        year: payload.year,
        month: payload.month,
        section: payload.section,
        group: payload.group,
        financeRecordId: payload.financeRecordId,
        createdByUserId: payload.createdByUserId,
        createdByName: payload.createdByName
      },
      update: {
        createdByUserId: payload.createdByUserId,
        createdByName: payload.createdByName
      }
    });

    return mapCommissionExclusion(record);
  }

  public async clearExclusion(payload: Omit<CommissionExclusionWriteRecord, "createdByUserId" | "createdByName">) {
    await assertCommissionPeriodUnlocked(this.prisma, payload.year, payload.month);
    await this.prisma.commissionExclusion.deleteMany({
      where: {
        year: payload.year,
        month: payload.month,
        section: payload.section,
        group: payload.group,
        financeRecordId: payload.financeRecordId
      }
    });
  }

  public async updateProjectorCommission(entryId: string, payload: ProjectorCommissionUpdateRecord) {
    const current = await this.prisma.projectorCommission.findUnique({
      where: { id: entryId }
    });

    if (!current) {
      return null;
    }

    await assertCommissionPeriodUnlocked(this.prisma, current.year, current.month);

    const authorizationChanged = payload.authorized !== undefined && payload.authorized !== current.authorized;
    const record = await this.prisma.projectorCommission.update({
      where: { id: entryId },
      data: {
        ...(payload.amountMxn === undefined ? {} : { amountMxn: new Prisma.Decimal(payload.amountMxn) }),
        ...(payload.authorized === undefined ? {} : { authorized: payload.authorized }),
        ...(authorizationChanged ? {
          authorizedAt: payload.authorized ? new Date() : null,
          authorizedByUserId: payload.authorized ? payload.authorizedByUserId : null,
          authorizedByName: payload.authorized ? payload.authorizedByName : null
        } : {})
      }
    });

    return mapProjectorCommission(record);
  }

  public async getPaymentFlowState(year: number, month: number) {
    if (!isRusconiCommissionPaymentFlow()) {
      return {
        year,
        month,
        locked: false,
        confirmedByEmrtCount: 0,
        acknowledgements: []
      };
    }

    const [records, lock] = await Promise.all([
      this.prisma.commissionPaymentAcknowledgement.findMany({
        where: { year, month },
        orderBy: [{ section: "asc" }, { createdAt: "asc" }],
        omit: { signedReceiptFileContent: true }
      }),
      getCommissionPeriodLock(this.prisma, year, month)
    ]);

    return {
      year,
      month,
      ...lock,
      acknowledgements: records.map(mapCommissionPaymentAcknowledgement)
    };
  }

  public async reconcilePaymentAcknowledgements(
    year: number,
    month: number,
    rows: CommissionPaymentReconcileRow[]
  ) {
    if (!isRusconiCommissionPaymentFlow()) {
      throw new AppError(404, "COMMISSION_PAYMENT_FLOW_NOT_FOUND", "El flujo de pagos de comisiones no aplica a este tenant.");
    }

    const lock = await getCommissionPeriodLock(this.prisma, year, month);
    if (lock.locked) {
      return this.getPaymentFlowState(year, month);
    }

    const sourceHash = await buildCommissionPeriodSourceHash(this.prisma, year, month);
    const normalizedRows = [...new Map(
      rows.map((row) => {
        const section = normalizeRequiredText(row.section);
        if (!section) {
          throw new AppError(400, "COMMISSION_PAYMENT_SECTION_REQUIRED", "El receptor de comisiones es obligatorio.");
        }
        return [section, { section, amountMxn: normalizeMoney(row.amountMxn) }];
      })
    ).values()];

    await this.prisma.$transaction(async (transaction) => {
      for (const row of normalizedRows) {
        const current = await transaction.commissionPaymentAcknowledgement.findFirst({
          where: { year, month, section: row.section },
          omit: { signedReceiptFileContent: true }
        });

        if (!current) {
          await transaction.commissionPaymentAcknowledgement.create({
            data: {
              year,
              month,
              section: row.section,
              amountMxn: new Prisma.Decimal(row.amountMxn),
              sourceHash
            }
          });
          continue;
        }

        const amountHasChanged = moneyChanged(current.amountMxn, row.amountMxn);
        const invalidateAraceli = amountHasChanged && current.receivedByAraceli;
        const invalidateTransfer = amountHasChanged && current.paidByTransfer;
        const invalidateSignedReceipt = amountHasChanged && Boolean(current.signedReceiptUploadedAt);
        await transaction.commissionPaymentAcknowledgement.update({
          where: { id: current.id },
          data: {
            amountMxn: new Prisma.Decimal(row.amountMxn),
            sourceHash,
            ...(invalidateTransfer ? {
              paidByTransfer: false,
              paidByTransferAt: null,
              paidByTransferUserId: null,
              paidByTransferName: null
            } : {}),
            ...(invalidateAraceli ? {
              receivedByAraceli: false,
              receivedByAraceliAt: null,
              receivedByAraceliUserId: null,
              receivedByAraceliName: null
            } : {}),
            ...(invalidateSignedReceipt ? {
              signedReceiptFileName: null,
              signedReceiptMimeType: null,
              signedReceiptSizeBytes: null,
              signedReceiptUploadedAt: null,
              signedReceiptUserId: null,
              signedReceiptUserName: null,
              signedReceiptFileContent: null
            } : {})
          }
        });

        if (invalidateAraceli) {
          await transaction.commissionPaymentAcknowledgementEvent.create({
            data: {
              acknowledgementId: current.id,
              action: "ARACELI_INVALIDATED_AMOUNT_CHANGE",
              amountMxn: new Prisma.Decimal(row.amountMxn),
              details: {
                previousAmountMxn: normalizeMoney(Number(current.amountMxn)),
                nextAmountMxn: row.amountMxn
              }
            }
          });
        }
        if (invalidateTransfer) {
          await transaction.commissionPaymentAcknowledgementEvent.create({
            data: {
              acknowledgementId: current.id,
              action: "TRANSFER_INVALIDATED_AMOUNT_CHANGE",
              amountMxn: new Prisma.Decimal(row.amountMxn),
              details: {
                previousAmountMxn: normalizeMoney(Number(current.amountMxn)),
                nextAmountMxn: row.amountMxn
              }
            }
          });
        }
        if (invalidateSignedReceipt) {
          await transaction.commissionPaymentAcknowledgementEvent.create({
            data: {
              acknowledgementId: current.id,
              action: "SIGNED_RECEIPT_INVALIDATED_AMOUNT_CHANGE",
              amountMxn: new Prisma.Decimal(row.amountMxn),
              details: {
                previousAmountMxn: normalizeMoney(Number(current.amountMxn)),
                nextAmountMxn: row.amountMxn,
                previousFileName: current.signedReceiptFileName
              }
            }
          });
        }
      }
    });

    return this.getPaymentFlowState(year, month);
  }

  public async updatePaymentAcknowledgement(
    payload: CommissionPaymentAcknowledgementUpdateRecord,
    actor: CommissionPaymentActor
  ) {
    if (!isRusconiCommissionPaymentFlow()) {
      throw new AppError(404, "COMMISSION_PAYMENT_FLOW_NOT_FOUND", "El flujo de pagos de comisiones no aplica a este tenant.");
    }

    const organizationId = getCurrentOrganizationIdOrDefault();
    const section = normalizeRequiredText(payload.section);
    const current = await this.prisma.commissionPaymentAcknowledgement.findUnique({
      where: {
        organizationId_year_month_section: {
          organizationId,
          year: payload.year,
          month: payload.month,
          section
        }
      },
      omit: { signedReceiptFileContent: true }
    });

    if (!current) {
      throw new AppError(404, "COMMISSION_PAYMENT_ACK_NOT_FOUND", "Actualiza Totales de comisiones antes de confirmar este pago.");
    }

    if (payload.excluded !== undefined) {
      await assertCommissionPeriodUnlocked(this.prisma, payload.year, payload.month);
      const excluded = payload.excluded;
      const invalidateAraceli = excluded && current.receivedByAraceli;
      const invalidateTransfer = excluded && current.paidByTransfer;
      await this.prisma.$transaction(async (transaction) => {
        await transaction.commissionPaymentAcknowledgement.update({
          where: { id: current.id },
          data: {
            excluded,
            ...(invalidateTransfer ? {
              paidByTransfer: false,
              paidByTransferAt: null,
              paidByTransferUserId: null,
              paidByTransferName: null
            } : {}),
            ...(invalidateAraceli ? {
              receivedByAraceli: false,
              receivedByAraceliAt: null,
              receivedByAraceliUserId: null,
              receivedByAraceliName: null
            } : {})
          }
        });
        await transaction.commissionPaymentAcknowledgementEvent.create({
          data: {
            acknowledgementId: current.id,
            action: excluded ? "RECEIVER_EXCLUDED" : "RECEIVER_INCLUDED",
            amountMxn: current.amountMxn,
            actorUserId: actor.userId,
            actorName: actor.displayName
          }
        });
      });
      return this.getPaymentFlowState(payload.year, payload.month);
    }

    if (payload.paidByTransfer !== undefined) {
      await assertCommissionPeriodUnlocked(this.prisma, payload.year, payload.month);
      const paid = payload.paidByTransfer;
      if (paid && (current.excluded || Number(current.amountMxn) <= 0)) {
        throw new AppError(400, "COMMISSION_PAYMENT_NOT_ELIGIBLE", "Las comisiones excluidas o en cero no requieren confirmacion.");
      }
      if (paid) {
        if (!current.paidByTransfer) {
          await this.assertCommissionReleaseAllowed(payload.year, payload.month, payload.section);
        }
        const sourceHash = await buildCommissionPeriodSourceHash(this.prisma, payload.year, payload.month);
        if (current.sourceHash !== sourceHash) {
          throw new AppError(409, "COMMISSION_PAYMENT_REFRESH_REQUIRED", "Los datos del periodo cambiaron. Refresca Totales de comisiones antes de registrar la transferencia.");
        }
      }

      await this.prisma.$transaction(async (transaction) => {
        await transaction.commissionPaymentAcknowledgement.update({
          where: { id: current.id },
          data: {
            paidByTransfer: paid,
            paidByTransferAt: paid ? current.paidByTransferAt ?? new Date() : null,
            paidByTransferUserId: paid ? actor.userId : null,
            paidByTransferName: paid ? actor.displayName : null,
            ...(paid ? {
              receivedByAraceli: false,
              receivedByAraceliAt: null,
              receivedByAraceliUserId: null,
              receivedByAraceliName: null,
              receivedByEmrt: false,
              receivedByEmrtAt: null,
              receivedByEmrtUserId: null,
              receivedByEmrtName: null
            } : {})
          }
        });
        await transaction.commissionPaymentAcknowledgementEvent.create({
          data: {
            acknowledgementId: current.id,
            action: paid ? "TRANSFER_PAID" : "TRANSFER_UNCHECKED",
            amountMxn: current.amountMxn,
            actorUserId: actor.userId,
            actorName: actor.displayName,
            details: paid ? {
              clearedReceivedByAraceli: current.receivedByAraceli,
              clearedReceivedByEmrt: current.receivedByEmrt
            } : undefined
          }
        });
      });
      return this.getPaymentFlowState(payload.year, payload.month);
    }

    if (payload.receivedByAraceli !== undefined) {
      if (current.paidByTransfer) {
        throw new AppError(423, "COMMISSION_PAYMENT_TRANSFER_LOCKED", "Desmarca el pago mediante transferencia antes de confirmar la recepcion de Araceli.");
      }
      if (current.receivedByEmrt) {
        throw new AppError(423, "COMMISSION_PAYMENT_EMRT_LOCKED", "EMRT debe reabrir esta confirmacion antes de modificar la recepcion de Araceli.");
      }
      if (payload.receivedByAraceli && (current.excluded || Number(current.amountMxn) <= 0)) {
        throw new AppError(400, "COMMISSION_PAYMENT_NOT_ELIGIBLE", "Las comisiones excluidas o en cero no requieren confirmacion.");
      }
      if (payload.receivedByAraceli) {
        const sourceHash = await buildCommissionPeriodSourceHash(this.prisma, payload.year, payload.month);
        if (current.sourceHash !== sourceHash) {
          throw new AppError(409, "COMMISSION_PAYMENT_REFRESH_REQUIRED", "Los datos del periodo cambiaron. Refresca Totales de comisiones antes de confirmar.");
        }
      }

      const received = payload.receivedByAraceli;
      await this.prisma.$transaction(async (transaction) => {
        await transaction.commissionPaymentAcknowledgement.update({
          where: { id: current.id },
          data: {
            receivedByAraceli: received,
            receivedByAraceliAt: received ? current.receivedByAraceliAt ?? new Date() : null,
            receivedByAraceliUserId: received ? actor.userId : null,
            receivedByAraceliName: received ? actor.displayName : null
          }
        });
        await transaction.commissionPaymentAcknowledgementEvent.create({
          data: {
            acknowledgementId: current.id,
            action: received ? "ARACELI_RECEIVED" : "ARACELI_UNCHECKED",
            amountMxn: current.amountMxn,
            actorUserId: actor.userId,
            actorName: actor.displayName
          }
        });
      });
      return this.getPaymentFlowState(payload.year, payload.month);
    }

    if (payload.receivedByEmrt !== undefined) {
      const received = payload.receivedByEmrt;
      if (current.paidByTransfer) {
        throw new AppError(423, "COMMISSION_PAYMENT_TRANSFER_LOCKED", "Desmarca el pago mediante transferencia antes de confirmar la recepcion de EMRT.");
      }
      if (received && !current.receivedByAraceli) {
        throw new AppError(400, "COMMISSION_PAYMENT_ARACELI_REQUIRED", "Araceli debe confirmar primero la recepcion de esta comision.");
      }
      if (received && (current.excluded || Number(current.amountMxn) <= 0)) {
        throw new AppError(400, "COMMISSION_PAYMENT_NOT_ELIGIBLE", "Las comisiones excluidas o en cero no requieren confirmacion.");
      }
      if (received) {
        if (!current.receivedByEmrt) {
          await this.assertCommissionReleaseAllowed(payload.year, payload.month, payload.section);
        }
        const sourceHash = await buildCommissionPeriodSourceHash(this.prisma, payload.year, payload.month);
        if (current.sourceHash !== sourceHash) {
          if (current.receivedByAraceli) {
            await this.prisma.$transaction(async (transaction) => {
              await transaction.commissionPaymentAcknowledgement.update({
                where: { id: current.id },
                data: {
                  receivedByAraceli: false,
                  receivedByAraceliAt: null,
                  receivedByAraceliUserId: null,
                  receivedByAraceliName: null
                }
              });
              await transaction.commissionPaymentAcknowledgementEvent.create({
                data: {
                  acknowledgementId: current.id,
                  action: "ARACELI_INVALIDATED_SOURCE_CHANGE",
                  amountMxn: current.amountMxn,
                  details: { previousSourceHash: current.sourceHash, nextSourceHash: sourceHash }
                }
              });
            });
          }
          throw new AppError(409, "COMMISSION_PAYMENT_REFRESH_REQUIRED", "Los datos del periodo cambiaron. Araceli debe confirmar nuevamente el monto actualizado.");
        }
      }

      await this.prisma.$transaction(async (transaction) => {
        await transaction.commissionPaymentAcknowledgement.update({
          where: { id: current.id },
          data: received
            ? {
                receivedByEmrt: true,
                receivedByEmrtAt: current.receivedByEmrtAt ?? new Date(),
                receivedByEmrtUserId: actor.userId,
                receivedByEmrtName: actor.displayName
              }
            : {
                receivedByEmrt: false,
                receivedByEmrtAt: null,
                receivedByEmrtUserId: null,
                receivedByEmrtName: null,
                reopenedAt: new Date(),
                reopenedByUserId: actor.userId,
                reopenedByName: actor.displayName
              }
        });
        await transaction.commissionPaymentAcknowledgementEvent.create({
          data: {
            acknowledgementId: current.id,
            action: received ? "EMRT_RECEIVED" : "EMRT_REOPENED",
            amountMxn: current.amountMxn,
            actorUserId: actor.userId,
            actorName: actor.displayName
          }
        });
      });
      return this.getPaymentFlowState(payload.year, payload.month);
    }

    throw new AppError(400, "COMMISSION_PAYMENT_EMPTY_PAYLOAD", "No se recibio ningun cambio para el flujo de comisiones.");
  }

  public async uploadSignedReceipt(payload: CommissionSignedReceiptUploadRecord, actor: CommissionPaymentActor) {
    if (!isRusconiCommissionPaymentFlow()) {
      throw new AppError(404, "COMMISSION_PAYMENT_FLOW_NOT_FOUND", "El flujo de pagos de comisiones no aplica a este tenant.");
    }

    const organizationId = getCurrentOrganizationIdOrDefault();
    const section = normalizeRequiredText(payload.section);
    const current = await this.prisma.commissionPaymentAcknowledgement.findUnique({
      where: {
        organizationId_year_month_section: {
          organizationId,
          year: payload.year,
          month: payload.month,
          section
        }
      },
      omit: { signedReceiptFileContent: true }
    });

    if (!current) {
      throw new AppError(404, "COMMISSION_PAYMENT_ACK_NOT_FOUND", "Actualiza Totales de comisiones antes de cargar el recibo firmado.");
    }
    if (current.excluded || Number(current.amountMxn) <= 0) {
      throw new AppError(400, "COMMISSION_PAYMENT_NOT_ELIGIBLE", "Solo se pueden cargar recibos para comisiones vigentes con monto mayor a cero.");
    }

    const originalFileName = normalizeRequiredText(payload.originalFileName).split(/[\\/]/).pop() ?? "";
    const fileContent = Buffer.from(payload.fileContent);
    if (!originalFileName.toLowerCase().endsWith(".pdf")) {
      throw new AppError(400, "COMMISSION_SIGNED_RECEIPT_PDF_REQUIRED", "El recibo firmado debe ser un archivo PDF.");
    }
    if (!fileContent.byteLength || fileContent.byteLength > 10 * 1024 * 1024) {
      throw new AppError(400, "COMMISSION_SIGNED_RECEIPT_SIZE_INVALID", "El recibo firmado debe pesar entre 1 byte y 10 MB.");
    }
    if (fileContent.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new AppError(400, "COMMISSION_SIGNED_RECEIPT_INVALID_PDF", "El archivo seleccionado no contiene un PDF valido.");
    }

    const uploadedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.commissionPaymentAcknowledgement.update({
        where: { id: current.id },
        data: {
          signedReceiptFileName: originalFileName,
          signedReceiptMimeType: "application/pdf",
          signedReceiptSizeBytes: fileContent.byteLength,
          signedReceiptUploadedAt: uploadedAt,
          signedReceiptUserId: actor.userId,
          signedReceiptUserName: actor.displayName,
          signedReceiptFileContent: new Uint8Array(fileContent)
        }
      });
      await transaction.commissionPaymentAcknowledgementEvent.create({
        data: {
          acknowledgementId: current.id,
          action: current.signedReceiptUploadedAt ? "SIGNED_RECEIPT_REPLACED" : "SIGNED_RECEIPT_UPLOADED",
          amountMxn: current.amountMxn,
          actorUserId: actor.userId,
          actorName: actor.displayName,
          details: {
            fileName: originalFileName,
            fileSizeBytes: fileContent.byteLength
          }
        }
      });
    });

    return this.getPaymentFlowState(payload.year, payload.month);
  }

  public async findSignedReceipt(year: number, month: number, section: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const record = await this.prisma.commissionPaymentAcknowledgement.findUnique({
      where: {
        organizationId_year_month_section: {
          organizationId,
          year,
          month,
          section: normalizeRequiredText(section)
        }
      },
      select: {
        signedReceiptFileName: true,
        signedReceiptMimeType: true,
        signedReceiptFileContent: true
      }
    });

    if (!record?.signedReceiptFileName || !record.signedReceiptFileContent?.byteLength) {
      return null;
    }

    return {
      originalFileName: record.signedReceiptFileName,
      fileMimeType: record.signedReceiptMimeType || "application/pdf",
      fileContent: Buffer.from(record.signedReceiptFileContent)
    };
  }

  private async assertCommissionReleaseAllowed(year: number, month: number, section: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        displayName: true,
        specificRole: true,
        secondarySpecificRole: true
      }
    });
    const assignment = buildRecipientAssignments(users).find((candidate) =>
      normalizeRoleKey(candidate.section) === normalizeRoleKey(section)
    );
    if (!assignment?.userId) {
      return;
    }

    const eligibility = (await this.commissionRequirements.getEligibilityForMonth(year, month))
      .find((candidate) => candidate.userId === assignment.userId);
    if (!eligibility?.blocked) {
      return;
    }

    const pending = eligibility.requirements.map((requirement) =>
      `${requirement.pendingAmount} ${requirement.unit} de ${requirement.metricLabel}`
    ).join("; ");
    throw new AppError(
      423,
      "COMMISSION_KPI_REQUIREMENTS_PENDING",
      `Pago retenido. Pendientes para liberar: ${pending}.`
    );
  }

  private async ensureDefaultReceivers() {
    const organizationId = getCurrentOrganizationIdOrDefault();

    await this.prisma.commissionReceiver.createMany({
      data: getRequiredCommissionReceiverNames(organizationId).map((name) => ({ organizationId, name })),
      skipDuplicates: true
    });
  }

  private rethrowKnownError(error: unknown): never | void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "COMMISSION_RECEIVER_DUPLICATE", "A receiver with that name already exists.");
    }
  }
}
