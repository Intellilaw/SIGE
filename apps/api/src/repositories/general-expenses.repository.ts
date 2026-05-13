import { Prisma, type PrismaClient } from "@prisma/client";
import type { GeneralExpense } from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapGeneralExpense } from "./mappers";
import type {
  GeneralExpenseActor,
  GeneralExpenseCreateRecord,
  GeneralExpenseUpdateRecord,
  GeneralExpensesRepository
} from "./types";

const DEFAULT_TEAM: GeneralExpense["team"] = "Sin equipo";
const DEFAULT_PAYMENT_METHOD: GeneralExpense["paymentMethod"] = "Transferencia";
const DEFAULT_BANK: NonNullable<GeneralExpense["bank"]> = "Banamex";
const DEFAULT_MONTH_RANGE = { min: 1, max: 12 };
const LOCKED_AFTER_APPROVAL_FIELDS: Array<keyof GeneralExpenseUpdateRecord> = [
  "detail",
  "amountMxn",
  "countsTowardLimit",
  "generalExpense",
  "expenseWithoutTeam",
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance",
  "paymentMethod",
  "bank",
  "recurring"
];
const PCT_KEYS: Array<keyof Pick<
  GeneralExpenseUpdateRecord,
  "pctLitigation" | "pctCorporateLabor" | "pctSettlements" | "pctFinancialLaw" | "pctTaxCompliance"
>> = [
  "pctLitigation",
  "pctCorporateLabor",
  "pctSettlements",
  "pctFinancialLaw",
  "pctTaxCompliance"
];

type StoredGeneralExpense = Awaited<ReturnType<PrismaClient["generalExpense"]["findUniqueOrThrow"]>>;

function hasOwn<T extends object>(payload: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDateOnly(value?: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, "INVALID_DATE", `Invalid date value: ${value}`);
  }

  return parsed;
}

function toDateInput(value?: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function clampPercentage(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numeric));
}

function normalizePaymentMethod(value?: GeneralExpense["paymentMethod"] | null): GeneralExpense["paymentMethod"] {
  return value === "Efectivo" ? "Efectivo" : "Transferencia";
}

function normalizeBank(method: GeneralExpense["paymentMethod"], bank?: GeneralExpense["bank"] | null) {
  if (method !== "Transferencia") {
    return null;
  }

  return bank === "HSBC" ? "HSBC" : bank === "Banamex" ? "Banamex" : DEFAULT_BANK;
}

function isSuperadmin(actor: GeneralExpenseActor) {
  return actor.role === "SUPERADMIN" || actor.legacyRole === "SUPERADMIN" || actor.permissions.includes("*");
}

function isFinance(actor: GeneralExpenseActor) {
  return actor.team === "FINANCE" || normalizeComparableText(actor.legacyTeam) === "finanzas";
}

function isEduardoRusconi(actor: GeneralExpenseActor) {
  return (
    normalizeComparableText(actor.username) === "eduardo rusconi" ||
    normalizeComparableText(actor.displayName) === "eduardo rusconi" ||
    actor.email.toLowerCase().startsWith("eduardo.rusconi")
  );
}

function canReviewJnls(actor: GeneralExpenseActor) {
  return !isSuperadmin(actor) && (
    actor.team === "AUDIT" ||
    normalizeComparableText(actor.legacyTeam) === "auditoria"
  );
}

function assertMonth(month: number) {
  if (month < DEFAULT_MONTH_RANGE.min || month > DEFAULT_MONTH_RANGE.max) {
    throw new AppError(400, "INVALID_MONTH", "Month must be between 1 and 12.");
  }
}

function getNextMonth(year: number, month: number) {
  assertMonth(month);
  const nextMonthDate = new Date(year, month, 1);
  return {
    year: nextMonthDate.getFullYear(),
    month: nextMonthDate.getMonth() + 1
  };
}

export class PrismaGeneralExpensesRepository implements GeneralExpensesRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(year: number, month: number) {
    assertMonth(month);

    const records = await this.prisma.generalExpense.findMany({
      where: { year, month },
      orderBy: [{ createdAt: "asc" }]
    });

    return records.map(mapGeneralExpense);
  }

  public async create(payload: GeneralExpenseCreateRecord = {}) {
    const now = new Date();
    const year = payload.year ?? now.getFullYear();
    const month = payload.month ?? now.getMonth() + 1;
    assertMonth(month);

    const record = await this.prisma.generalExpense.create({
      data: {
        year,
        month,
        detail: "",
        amountMxn: new Prisma.Decimal(0),
        countsTowardLimit: false,
        team: DEFAULT_TEAM,
        generalExpense: false,
        expenseWithoutTeam: false,
        pctLitigation: new Prisma.Decimal(0),
        pctCorporateLabor: new Prisma.Decimal(0),
        pctSettlements: new Prisma.Decimal(0),
        pctFinancialLaw: new Prisma.Decimal(0),
        pctTaxCompliance: new Prisma.Decimal(0),
        paymentMethod: DEFAULT_PAYMENT_METHOD,
        bank: DEFAULT_BANK,
        recurring: false,
        approvedByEmrt: false,
        paidByEmrtAt: null,
        reviewedByJnls: false,
        paid: false,
        paidAt: null
      }
    });

    return mapGeneralExpense(record);
  }

  public async update(expenseId: string, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    const current = await this.findOrThrow(expenseId);
    this.assertFieldAccess(current, payload, actor);

    const data = this.buildUpdatePayload(current, payload);
    const record = await this.prisma.generalExpense.update({
      where: { id: expenseId },
      data
    });

    return mapGeneralExpense(record);
  }

  public async delete(expenseId: string) {
    const current = await this.findOrThrow(expenseId);
    if (current.approvedByEmrt) {
      throw new AppError(400, "GENERAL_EXPENSE_APPROVED_LOCKED", "Approved expenses cannot be deleted.");
    }

    await this.prisma.generalExpense.delete({
      where: { id: expenseId }
    });
  }

  public async copyRecurringToNextMonth(year: number, month: number) {
    assertMonth(month);

    const { year: targetYear, month: targetMonth } = getNextMonth(year, month);
    const recurringRows = await this.prisma.generalExpense.findMany({
      where: {
        year,
        month,
        recurring: true
      },
      orderBy: [{ createdAt: "asc" }]
    });

    if (recurringRows.length === 0) {
      return { year: targetYear, month: targetMonth, copied: 0 };
    }

    const result = await this.prisma.generalExpense.createMany({
      data: recurringRows.map((row) => ({
        year: targetYear,
        month: targetMonth,
        detail: row.detail,
        amountMxn: row.amountMxn,
        countsTowardLimit: row.countsTowardLimit,
        team: row.team,
        generalExpense: row.generalExpense,
        expenseWithoutTeam: row.expenseWithoutTeam,
        pctLitigation: row.pctLitigation,
        pctCorporateLabor: row.pctCorporateLabor,
        pctSettlements: row.pctSettlements,
        pctFinancialLaw: row.pctFinancialLaw,
        pctTaxCompliance: row.pctTaxCompliance,
        paymentMethod: row.paymentMethod,
        bank: row.bank,
        recurring: true,
        approvedByEmrt: false,
        paidByEmrtAt: null,
        reviewedByJnls: false,
        paid: false,
        paidAt: null
      }))
    });

    return {
      year: targetYear,
      month: targetMonth,
      copied: result.count
    };
  }

  private async findOrThrow(expenseId: string) {
    const record = await this.prisma.generalExpense.findUnique({
      where: { id: expenseId }
    });

    if (!record) {
      throw new AppError(404, "GENERAL_EXPENSE_NOT_FOUND", "The requested expense does not exist.");
    }

    return record;
  }

  private assertFieldAccess(current: StoredGeneralExpense, payload: GeneralExpenseUpdateRecord, actor: GeneralExpenseActor) {
    if (current.approvedByEmrt && LOCKED_AFTER_APPROVAL_FIELDS.some((field) => hasOwn(payload, field))) {
      throw new AppError(400, "GENERAL_EXPENSE_APPROVED_LOCKED", "This expense is locked because it was already approved by EMRT.");
    }

    if (hasOwn(payload, "approvedByEmrt") && !isSuperadmin(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_APPROVE_FORBIDDEN", "Only superadmin can approve or unapprove expenses.");
    }

    if (hasOwn(payload, "paid") && !isFinance(actor)) {
      throw new AppError(403, "GENERAL_EXPENSE_PAY_FORBIDDEN", "Only the finance team can mark expenses as paid.");
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      if (!canReviewJnls(actor)) {
        throw new AppError(403, "GENERAL_EXPENSE_REVIEW_FORBIDDEN", "Only the audit team can update the JNLS approval flag.");
      }
    }

    if (hasOwn(payload, "paidByEmrtAt")) {
      const nextPaymentMethod = hasOwn(payload, "paymentMethod")
        ? normalizePaymentMethod(payload.paymentMethod)
        : (current.paymentMethod as GeneralExpense["paymentMethod"]);

      if (!isEduardoRusconi(actor) || nextPaymentMethod !== "Efectivo") {
        throw new AppError(403, "GENERAL_EXPENSE_EMRT_DATE_FORBIDDEN", "Only Eduardo Rusconi can edit the EMRT paid date for cash expenses.");
      }
    }
  }

  private buildUpdatePayload(current: StoredGeneralExpense, payload: GeneralExpenseUpdateRecord): Prisma.GeneralExpenseUpdateInput {
    const data: Prisma.GeneralExpenseUpdateInput = {};

    if (hasOwn(payload, "detail")) {
      data.detail = payload.detail ?? "";
    }

    if (hasOwn(payload, "amountMxn")) {
      data.amountMxn = new Prisma.Decimal(Math.max(0, Number(payload.amountMxn ?? 0)));
    }

    if (hasOwn(payload, "countsTowardLimit")) {
      data.countsTowardLimit = Boolean(payload.countsTowardLimit);
    }

    if (hasOwn(payload, "team")) {
      data.team = payload.team ?? DEFAULT_TEAM;
    }

    if (hasOwn(payload, "generalExpense")) {
      data.generalExpense = Boolean(payload.generalExpense);
      if (payload.generalExpense) {
        data.expenseWithoutTeam = false;
        data.pctLitigation = new Prisma.Decimal(20);
        data.pctCorporateLabor = new Prisma.Decimal(20);
        data.pctSettlements = new Prisma.Decimal(20);
        data.pctFinancialLaw = new Prisma.Decimal(20);
        data.pctTaxCompliance = new Prisma.Decimal(20);
      }
    }

    if (hasOwn(payload, "expenseWithoutTeam")) {
      data.expenseWithoutTeam = Boolean(payload.expenseWithoutTeam);
      if (payload.expenseWithoutTeam) {
        data.generalExpense = false;
        data.pctLitigation = new Prisma.Decimal(0);
        data.pctCorporateLabor = new Prisma.Decimal(0);
        data.pctSettlements = new Prisma.Decimal(0);
        data.pctFinancialLaw = new Prisma.Decimal(0);
        data.pctTaxCompliance = new Prisma.Decimal(0);
      }
    }

    const nextGeneralExpense = hasOwn(payload, "generalExpense")
      ? Boolean(payload.generalExpense)
      : current.generalExpense;
    const nextExpenseWithoutTeam = hasOwn(payload, "expenseWithoutTeam")
      ? Boolean(payload.expenseWithoutTeam)
      : current.expenseWithoutTeam;

    if (!nextGeneralExpense && !nextExpenseWithoutTeam) {
      PCT_KEYS.forEach((key) => {
        if (hasOwn(payload, key)) {
          const value = clampPercentage(payload[key]);
          switch (key) {
            case "pctLitigation":
              data.pctLitigation = new Prisma.Decimal(value);
              break;
            case "pctCorporateLabor":
              data.pctCorporateLabor = new Prisma.Decimal(value);
              break;
            case "pctSettlements":
              data.pctSettlements = new Prisma.Decimal(value);
              break;
            case "pctFinancialLaw":
              data.pctFinancialLaw = new Prisma.Decimal(value);
              break;
            case "pctTaxCompliance":
              data.pctTaxCompliance = new Prisma.Decimal(value);
              break;
            default:
              break;
          }
        }
      });
    }

    const nextPaymentMethod = hasOwn(payload, "paymentMethod")
      ? normalizePaymentMethod(payload.paymentMethod)
      : (current.paymentMethod as GeneralExpense["paymentMethod"]);

    if (hasOwn(payload, "paymentMethod")) {
      data.paymentMethod = nextPaymentMethod;
    }

    if (hasOwn(payload, "bank") || hasOwn(payload, "paymentMethod")) {
      const nextBank = hasOwn(payload, "bank")
        ? normalizeBank(nextPaymentMethod, payload.bank)
        : normalizeBank(nextPaymentMethod, current.bank as GeneralExpense["bank"] | null);
      data.bank = nextBank;
    }

    if (hasOwn(payload, "recurring")) {
      data.recurring = Boolean(payload.recurring);
    }

    if (hasOwn(payload, "approvedByEmrt")) {
      data.approvedByEmrt = Boolean(payload.approvedByEmrt);
    }

    if (hasOwn(payload, "paidByEmrtAt")) {
      data.paidByEmrtAt = parseDateOnly(payload.paidByEmrtAt);
    }

    if (hasOwn(payload, "reviewedByJnls")) {
      data.reviewedByJnls = Boolean(payload.reviewedByJnls);
    }

    if (hasOwn(payload, "paid")) {
      data.paid = Boolean(payload.paid);
    }

    if (hasOwn(payload, "paidAt")) {
      data.paidAt = parseDateOnly(payload.paidAt);
    }

    return data;
  }
}
