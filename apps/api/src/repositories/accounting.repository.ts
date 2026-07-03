import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  AccountingAccount,
  AccountingAccountNature,
  AccountingAccountType,
  AccountingAutomationResult,
  AccountingCatalogXmlImportInput,
  AccountingCatalogXmlImportResult,
  AccountingCatalogXmlPreviewAccount,
  AccountingCatalogXmlPreviewResult,
  AccountingCatalogXmlUploadInput,
  AccountingCfdiDocument,
  AccountingCfdiUploadInput,
  AccountingCreateAccountInput,
  AccountingFinancialStatementLine,
  AccountingInitialBalanceInput,
  AccountingJournalEntry,
  AccountingJournalEntryInput,
  AccountingJournalLineInput,
  AccountingOverview,
  AccountingPendingItem,
  AccountingSettingsInput,
  AccountingTrialBalanceLine,
  AccountingXmlExportResult
} from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import {
  mapAccountingAccount,
  mapAccountingCfdiDocument,
  mapAccountingJournalEntry,
  mapAccountingPeriod,
  mapAccountingSettings
} from "./mappers";
import type { AccountingRepository } from "./types";

type AccountingEntryRecord = Parameters<typeof mapAccountingJournalEntry>[0];
type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

const IVA_RATE = 0.16;
const DEFAULT_ACCOUNT_CODES = {
  bank: "1010-001",
  cash: "1010-002",
  clients: "1050-000",
  suppliers: "2010-000",
  vatCreditablePending: "1060-000",
  vatCreditablePaid: "1061-000",
  vatTransferredPending: "2080-000",
  vatTransferredCollected: "2081-000",
  openingEquity: "3020-000",
  income: "4010-000",
  generalExpense: "6010-000"
} as const;

const STANDARD_ACCOUNTS: Array<{
  code: string;
  name: string;
  type: AccountingAccountType;
  nature: AccountingAccountNature;
  satGroupingCode?: string;
  parentCode?: string;
}> = [
  { code: "1000-000", name: "Activo", type: "ASSET", nature: "DEBIT", satGroupingCode: "100" },
  { code: "1010-000", name: "Bancos y caja", type: "ASSET", nature: "DEBIT", satGroupingCode: "102", parentCode: "1000-000" },
  { code: DEFAULT_ACCOUNT_CODES.bank, name: "Bancos MXN", type: "ASSET", nature: "DEBIT", satGroupingCode: "102.01", parentCode: "1010-000" },
  { code: DEFAULT_ACCOUNT_CODES.cash, name: "Caja MXN", type: "ASSET", nature: "DEBIT", satGroupingCode: "101.01", parentCode: "1010-000" },
  { code: DEFAULT_ACCOUNT_CODES.clients, name: "Clientes", type: "ASSET", nature: "DEBIT", satGroupingCode: "105.01", parentCode: "1000-000" },
  { code: DEFAULT_ACCOUNT_CODES.vatCreditablePending, name: "IVA acreditable pendiente de pago", type: "ASSET", nature: "DEBIT", satGroupingCode: "118.01", parentCode: "1000-000" },
  { code: DEFAULT_ACCOUNT_CODES.vatCreditablePaid, name: "IVA acreditable pagado", type: "ASSET", nature: "DEBIT", satGroupingCode: "118.02", parentCode: "1000-000" },
  { code: "2000-000", name: "Pasivo", type: "LIABILITY", nature: "CREDIT", satGroupingCode: "200" },
  { code: DEFAULT_ACCOUNT_CODES.suppliers, name: "Proveedores y acreedores", type: "LIABILITY", nature: "CREDIT", satGroupingCode: "201.01", parentCode: "2000-000" },
  { code: DEFAULT_ACCOUNT_CODES.vatTransferredPending, name: "IVA trasladado pendiente de cobro", type: "LIABILITY", nature: "CREDIT", satGroupingCode: "208.01", parentCode: "2000-000" },
  { code: DEFAULT_ACCOUNT_CODES.vatTransferredCollected, name: "IVA trasladado cobrado", type: "LIABILITY", nature: "CREDIT", satGroupingCode: "208.02", parentCode: "2000-000" },
  { code: "3000-000", name: "Capital contable", type: "EQUITY", nature: "CREDIT", satGroupingCode: "300" },
  { code: "3010-000", name: "Capital social", type: "EQUITY", nature: "CREDIT", satGroupingCode: "301.01", parentCode: "3000-000" },
  { code: DEFAULT_ACCOUNT_CODES.openingEquity, name: "Saldos iniciales y resultados acumulados", type: "EQUITY", nature: "CREDIT", satGroupingCode: "304.01", parentCode: "3000-000" },
  { code: "4000-000", name: "Ingresos", type: "INCOME", nature: "CREDIT", satGroupingCode: "401" },
  { code: DEFAULT_ACCOUNT_CODES.income, name: "Ingresos por servicios", type: "INCOME", nature: "CREDIT", satGroupingCode: "401.01", parentCode: "4000-000" },
  { code: "5000-000", name: "Costos", type: "COST", nature: "DEBIT", satGroupingCode: "501" },
  { code: "6000-000", name: "Gastos", type: "EXPENSE", nature: "DEBIT", satGroupingCode: "601" },
  { code: DEFAULT_ACCOUNT_CODES.generalExpense, name: "Gastos generales", type: "EXPENSE", nature: "DEBIT", satGroupingCode: "601.01", parentCode: "6000-000" }
];

function assertMonth(month: number) {
  if (month < 1 || month > 12) {
    throw new AppError(400, "INVALID_MONTH", "Month must be between 1 and 12.");
  }
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRequiredText(value?: string | null) {
  return normalizeOptionalText(value) ?? "";
}

function normalizeRfc(value?: string | null) {
  return normalizeOptionalText(value)?.toUpperCase().replace(/[^A-Z0-9&Ñ]/g, "") ?? null;
}

function normalizeMoney(value?: number | null) {
  const numeric = Number(value ?? 0);
  return new Prisma.Decimal(Number.isFinite(numeric) ? Math.max(0, numeric) : 0);
}

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
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

function toDateKey(value?: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function getMonthEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0));
}

function getEntryInclude() {
  return {
    lines: {
      include: {
        account: {
          select: { code: true, name: true }
        }
      },
      orderBy: [{ createdAt: "asc" as const }]
    }
  };
}

function buildLineData(line: AccountingJournalLineInput, sourceType?: string | null, sourceId?: string | null) {
  const debitMxn = Number(line.debitMxn ?? 0);
  const creditMxn = Number(line.creditMxn ?? 0);
  if (debitMxn > 0 && creditMxn > 0) {
    throw new AppError(400, "ACCOUNTING_LINE_DOUBLE_SIDED", "A journal line cannot have debit and credit at the same time.");
  }

  return {
    accountId: line.accountId,
    description: normalizeRequiredText(line.description),
    debitMxn: normalizeMoney(debitMxn),
    creditMxn: normalizeMoney(creditMxn),
    sourceType: normalizeOptionalText(sourceType),
    sourceId: normalizeOptionalText(sourceId)
  };
}

function assertBalanced(lines: AccountingJournalLineInput[]) {
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debitMxn ?? 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.creditMxn ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    throw new AppError(400, "ACCOUNTING_ENTRY_UNBALANCED", "La poliza debe cuadrar: cargos y abonos deben ser iguales.");
  }
}

function normalizeAccountNature(value?: string | null, type?: AccountingAccountType): AccountingAccountNature {
  if (value === "CREDIT" || value === "DEBIT") {
    return value;
  }

  return type === "LIABILITY" || type === "EQUITY" || type === "INCOME" ? "CREDIT" : "DEBIT";
}

function normalizeAccountType(value?: string | null): AccountingAccountType {
  const valid = new Set<AccountingAccountType>(["ASSET", "LIABILITY", "EQUITY", "INCOME", "COST", "EXPENSE"]);
  if (valid.has(value as AccountingAccountType)) {
    return value as AccountingAccountType;
  }

  throw new AppError(400, "INVALID_ACCOUNT_TYPE", "Invalid accounting account type.");
}

function isPaymentReceived(method?: string | null, received?: boolean | null) {
  return method === "T" || (method === "E" && received === true);
}

function getAttributeMap(tagBody?: string | null) {
  const attributes: Record<string, string> = {};
  if (!tagBody) {
    return attributes;
  }

  for (const match of tagBody.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) {
    const key = match[1].split(":").pop() ?? match[1];
    attributes[key] = match[2];
  }

  return attributes;
}

function getFirstTagAttributes(xml: string, localName: string) {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b([^>]*)>`, "i"));
  return getAttributeMap(match?.[1]);
}

function getTagAttributes(xml: string, localName: string) {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attributes: Array<Record<string, string>> = [];

  for (const match of xml.matchAll(new RegExp(`<(?:[\\w.-]+:)?${escaped}\\b([^>]*)\\/?>`, "gi"))) {
    attributes.push(getAttributeMap(match[1]));
  }

  return attributes;
}

function decodeXmlAttribute(value?: string | null) {
  return String(value ?? "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function getXmlAttribute(attributes: Record<string, string>, key: string) {
  const target = key.toLowerCase();
  const entry = Object.entries(attributes).find(([candidate]) => candidate.toLowerCase() === target);
  return decodeXmlAttribute(entry?.[1]);
}

function normalizeCatalogNature(value?: string | null, type?: AccountingAccountType): AccountingAccountNature {
  const normalized = normalizeOptionalText(value)?.toUpperCase();
  if (normalized === "D" || normalized === "DEBIT") {
    return "DEBIT";
  }
  if (normalized === "A" || normalized === "CREDIT") {
    return "CREDIT";
  }

  return normalizeAccountNature(undefined, type);
}

function isValidCatalogNature(value?: string | null) {
  const normalized = normalizeOptionalText(value)?.toUpperCase();
  return normalized === "D" || normalized === "A" || normalized === "DEBIT" || normalized === "CREDIT";
}

function inferCatalogAccountType(satGroupingCode?: string | null, code?: string | null, name?: string | null): AccountingAccountType {
  const groupingPrefix = normalizeOptionalText(satGroupingCode)?.match(/^\d+/)?.[0];
  const groupingNumber = Number(groupingPrefix ?? NaN);
  if (groupingNumber >= 100 && groupingNumber < 200) {
    return "ASSET";
  }
  if (groupingNumber >= 200 && groupingNumber < 300) {
    return "LIABILITY";
  }
  if (groupingNumber >= 300 && groupingNumber < 400) {
    return "EQUITY";
  }
  if (groupingNumber >= 400 && groupingNumber < 500) {
    return "INCOME";
  }
  if (groupingNumber >= 500 && groupingNumber < 600) {
    return "COST";
  }
  if (groupingNumber >= 600 && groupingNumber < 800) {
    return "EXPENSE";
  }

  const accountPrefix = normalizeOptionalText(code)?.match(/\d/)?.[0];
  if (accountPrefix === "1") {
    return "ASSET";
  }
  if (accountPrefix === "2") {
    return "LIABILITY";
  }
  if (accountPrefix === "3") {
    return "EQUITY";
  }
  if (accountPrefix === "4") {
    return "INCOME";
  }
  if (accountPrefix === "5") {
    return "COST";
  }
  if (accountPrefix === "6" || accountPrefix === "7") {
    return "EXPENSE";
  }

  const normalizedName = normalizeOptionalText(name)?.toLowerCase() ?? "";
  if (normalizedName.includes("pasivo")) {
    return "LIABILITY";
  }
  if (normalizedName.includes("capital")) {
    return "EQUITY";
  }
  if (normalizedName.includes("ingreso")) {
    return "INCOME";
  }
  if (normalizedName.includes("costo")) {
    return "COST";
  }
  if (normalizedName.includes("gasto")) {
    return "EXPENSE";
  }

  return "ASSET";
}

function parseCatalogXmlAccounts(xml: string): Array<Omit<AccountingCatalogXmlPreviewAccount, "action">> {
  const rows = getTagAttributes(xml, "Ctas");
  const seenCodes = new Set<string>();

  return rows.map((attributes, index) => {
    const code = normalizeRequiredText(getXmlAttribute(attributes, "NumCta"));
    const name = normalizeRequiredText(getXmlAttribute(attributes, "Desc"));
    const satGroupingCode = normalizeOptionalText(getXmlAttribute(attributes, "CodAgrup")) ?? undefined;
    const parentCode = normalizeOptionalText(getXmlAttribute(attributes, "SubCtaDe")) ?? undefined;
    const rawLevel = Number.parseInt(getXmlAttribute(attributes, "Nivel"), 10);
    const level = Number.isFinite(rawLevel) && rawLevel > 0 ? rawLevel : parentCode ? 2 : 1;
    const rawNature = getXmlAttribute(attributes, "Natur");
    const type = inferCatalogAccountType(satGroupingCode, code, name);
    const errors: string[] = [];

    if (!code) {
      errors.push(`La fila ${index + 1} no tiene NumCta.`);
    } else if (seenCodes.has(code)) {
      errors.push(`La cuenta ${code} esta duplicada en el XML.`);
    }
    if (!name) {
      errors.push(`La cuenta ${code || index + 1} no tiene Desc.`);
    }
    if (!satGroupingCode) {
      errors.push(`La cuenta ${code || index + 1} no tiene CodAgrup.`);
    }
    if (!Number.isFinite(rawLevel) || rawLevel <= 0) {
      errors.push(`La cuenta ${code || index + 1} no tiene un Nivel valido.`);
    }
    if (!isValidCatalogNature(rawNature)) {
      errors.push(`La cuenta ${code || index + 1} no tiene Natur valida.`);
    }
    if (parentCode && parentCode === code) {
      errors.push(`La cuenta ${code} no puede ser su propia cuenta padre.`);
    }

    if (code) {
      seenCodes.add(code);
    }

    return {
      code,
      name,
      type,
      satGroupingCode,
      parentCode,
      level,
      nature: normalizeCatalogNature(rawNature, type),
      error: errors.length > 0 ? errors.join(" ") : undefined
    };
  });
}

function decodeCatalogXml(payload: AccountingCatalogXmlUploadInput) {
  try {
    const base64 = payload.xmlBase64.includes(",") ? payload.xmlBase64.slice(payload.xmlBase64.indexOf(",") + 1) : payload.xmlBase64;
    const xml = Buffer.from(base64, "base64").toString("utf8").replace(/^\uFEFF/, "");
    if (!xml.includes("<")) {
      throw new Error("Invalid XML payload.");
    }
    return xml;
  } catch {
    throw new AppError(400, "ACCOUNTING_CATALOG_XML_INVALID", `No se pudo leer el XML ${payload.originalFileName}.`);
  }
}

function parseXmlNumber(value?: string | null) {
  const numeric = Number(String(value ?? "0").replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseXmlDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value.length <= 10 ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sumXmlTaxTransfers(xml: string) {
  let sum = 0;
  for (const match of xml.matchAll(/<(?:[\w.-]+:)?Traslado\b([^>]*)\/?>/gi)) {
    const attrs = getAttributeMap(match[1]);
    sum += parseXmlNumber(attrs.Importe);
  }
  return roundMoney(sum);
}

function parseCfdiXml(xml: string, originalFileName: string) {
  const comprobante = getFirstTagAttributes(xml, "Comprobante");
  const emisor = getFirstTagAttributes(xml, "Emisor");
  const receptor = getFirstTagAttributes(xml, "Receptor");
  const timbre = getFirstTagAttributes(xml, "TimbreFiscalDigital");
  const impuestos = getFirstTagAttributes(xml, "Impuestos");
  const uuid = normalizeOptionalText(timbre.UUID)?.toUpperCase();

  if (!uuid) {
    throw new AppError(400, "CFDI_UUID_NOT_FOUND", `No se encontro UUID en ${originalFileName}.`);
  }

  const taxMxn = parseXmlNumber(impuestos.TotalImpuestosTrasladados) || sumXmlTaxTransfers(xml);

  return {
    uuid,
    version: comprobante.Version ?? comprobante.version ?? null,
    type: comprobante.TipoDeComprobante ?? "I",
    issuerRfc: normalizeRfc(emisor.Rfc) ?? "",
    issuerName: normalizeOptionalText(emisor.Nombre),
    receiverRfc: normalizeRfc(receptor.Rfc) ?? "",
    receiverName: normalizeOptionalText(receptor.Nombre),
    issueDate: parseXmlDate(comprobante.Fecha),
    certificationDate: parseXmlDate(timbre.FechaTimbrado),
    subtotalMxn: roundMoney(parseXmlNumber(comprobante.SubTotal)),
    discountMxn: roundMoney(parseXmlNumber(comprobante.Descuento)),
    taxMxn,
    totalMxn: roundMoney(parseXmlNumber(comprobante.Total)),
    currency: normalizeOptionalText(comprobante.Moneda)?.toUpperCase() ?? "MXN",
    paymentMethod: normalizeOptionalText(comprobante.MetodoPago),
    paymentForm: normalizeOptionalText(comprobante.FormaPago),
    usage: normalizeOptionalText(receptor.UsoCFDI),
    parsedData: {
      comprobante,
      emisor,
      receptor,
      timbre
    }
  };
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatXmlMoney(value: number) {
  return roundMoney(value).toFixed(2);
}

function getMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export class PrismaAccountingRepository implements AccountingRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  private getOrganizationId() {
    return getCurrentOrganizationIdOrDefault();
  }

  public async getOverview(year: number, month: number): Promise<AccountingOverview> {
    assertMonth(month);
    const organizationId = this.getOrganizationId();
    const [period, settings, accounts, entries, cfdiDocuments, allEntries] = await Promise.all([
      this.findOrCreatePeriod(year, month),
      this.findOrCreateSettings(),
      this.prisma.accountingAccount.findMany({
        where: { organizationId },
        orderBy: [{ code: "asc" }]
      }),
      this.prisma.accountingJournalEntry.findMany({
        where: { organizationId, year, month },
        include: getEntryInclude(),
        orderBy: [{ entryDate: "asc" }, { number: "asc" }]
      }),
      this.prisma.accountingCfdiDocument.findMany({
        where: { organizationId },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
        take: 100
      }),
      this.prisma.accountingJournalEntry.findMany({
        where: {
          organizationId,
          OR: [
            { year: { lt: year } },
            { year, month: { lte: month } }
          ]
        },
        include: getEntryInclude(),
        orderBy: [{ year: "asc" }, { month: "asc" }, { entryDate: "asc" }, { number: "asc" }]
      })
    ]);

    const mappedAccounts = accounts.map(mapAccountingAccount);
    const mappedEntries = entries.map(mapAccountingJournalEntry);
    const mappedAllEntries = allEntries.map(mapAccountingJournalEntry);
    const trialBalance = this.buildTrialBalance(mappedAccounts, mappedAllEntries, year, month);
    const balanceSheet = this.buildBalanceSheet(mappedAccounts, trialBalance);
    const incomeStatement = this.buildIncomeStatement(mappedAccounts, trialBalance);
    const pendingItems = await this.buildPendingItems(year, month, mappedAccounts, mappedEntries, cfdiDocuments.map(mapAccountingCfdiDocument));
    const totals = this.buildTotals(trialBalance, balanceSheet, incomeStatement);

    return {
      period: mapAccountingPeriod(period),
      settings: mapAccountingSettings(settings),
      accounts: mappedAccounts,
      entries: mappedEntries,
      cfdiDocuments: cfdiDocuments.map(mapAccountingCfdiDocument),
      trialBalance,
      balanceSheet,
      incomeStatement,
      pendingItems,
      totals
    };
  }

  public async updateSettings(payload: AccountingSettingsInput) {
    const organizationId = this.getOrganizationId();
    const settings = await this.prisma.accountingSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        companyRfc: normalizeRfc(payload.companyRfc),
        legalName: normalizeOptionalText(payload.legalName)
      },
      update: {
        companyRfc: normalizeRfc(payload.companyRfc),
        legalName: normalizeOptionalText(payload.legalName)
      }
    });

    return mapAccountingSettings(settings);
  }

  public async initializeStandardCatalog() {
    const organizationId = this.getOrganizationId();
    const accountByCode = new Map<string, { id: string; level: number }>();

    for (const account of STANDARD_ACCOUNTS) {
      const parent = account.parentCode ? accountByCode.get(account.parentCode) : null;
      const record = await this.prisma.accountingAccount.upsert({
        where: {
          organizationId_code: {
            organizationId,
            code: account.code
          }
        },
        create: {
          organizationId,
          code: account.code,
          name: account.name,
          type: account.type,
          nature: account.nature,
          satGroupingCode: account.satGroupingCode,
          parentId: parent?.id ?? null,
          level: parent ? parent.level + 1 : 1,
          isDefault: true
        },
        update: {
          name: account.name,
          type: account.type,
          nature: account.nature,
          satGroupingCode: account.satGroupingCode,
          parentId: parent?.id ?? null,
          level: parent ? parent.level + 1 : 1,
          isDefault: true,
          isActive: true
        },
        select: { id: true, level: true }
      });
      accountByCode.set(account.code, record);
    }

    const accounts = await this.prisma.accountingAccount.findMany({
      where: { organizationId },
      orderBy: [{ code: "asc" }]
    });

    return accounts.map(mapAccountingAccount);
  }

  public async previewCatalogXml(payload: AccountingCatalogXmlUploadInput): Promise<AccountingCatalogXmlPreviewResult> {
    const organizationId = this.getOrganizationId();
    const xml = decodeCatalogXml(payload);
    const parsedAccounts = parseCatalogXmlAccounts(xml);

    if (parsedAccounts.length === 0) {
      throw new AppError(400, "ACCOUNTING_CATALOG_XML_EMPTY", `No se encontraron cuentas Ctas en ${payload.originalFileName}.`);
    }

    const existingAccounts = await this.prisma.accountingAccount.findMany({
      where: { organizationId },
      select: {
        code: true,
        name: true,
        type: true,
        satGroupingCode: true,
        parent: { select: { code: true } },
        level: true,
        nature: true,
        isActive: true
      }
    });
    const existingByCode = new Map(existingAccounts.map((account) => [account.code, account]));
    const xmlCodes = new Set(parsedAccounts.map((account) => account.code).filter(Boolean));

    const accounts = parsedAccounts.map((account): AccountingCatalogXmlPreviewAccount => {
      const errors = account.error ? [account.error] : [];
      if (account.parentCode) {
        const parentExistsInXml = xmlCodes.has(account.parentCode);
        const parentExistsAlready = existingByCode.has(account.parentCode);
        if (payload.replaceActiveCatalog && !parentExistsInXml) {
          errors.push(`La cuenta padre ${account.parentCode} debe venir en el XML para reemplazar el catalogo activo.`);
        } else if (!parentExistsInXml && !parentExistsAlready) {
          errors.push(`La cuenta padre ${account.parentCode} no existe en el XML ni en el catalogo actual.`);
        }
      }

      if (errors.length > 0) {
        return {
          ...account,
          action: "ERROR",
          error: errors.join(" ")
        };
      }

      const existing = existingByCode.get(account.code);
      const isUnchanged = Boolean(
        existing &&
        existing.name === account.name &&
        existing.type === account.type &&
        (existing.satGroupingCode ?? undefined) === (account.satGroupingCode ?? undefined) &&
        (existing.parent?.code ?? undefined) === (account.parentCode ?? undefined) &&
        existing.level === account.level &&
        existing.nature === account.nature &&
        existing.isActive
      );

      return {
        ...account,
        action: existing ? isUnchanged ? "UNCHANGED" : "UPDATE" : "CREATE"
      };
    });

    const summary = accounts.reduce(
      (totals, account) => {
        totals.total += 1;
        if (account.action === "CREATE") {
          totals.create += 1;
        } else if (account.action === "UPDATE") {
          totals.update += 1;
        } else if (account.action === "UNCHANGED") {
          totals.unchanged += 1;
        } else {
          totals.errors += 1;
        }
        return totals;
      },
      { total: 0, create: 0, update: 0, unchanged: 0, errors: 0 }
    );

    return {
      originalFileName: normalizeRequiredText(payload.originalFileName),
      accounts,
      summary,
      errors: accounts
        .filter((account) => account.action === "ERROR")
        .map((account) => ({ code: account.code || undefined, message: account.error ?? "Cuenta invalida." }))
    };
  }

  public async importCatalogXml(payload: AccountingCatalogXmlImportInput): Promise<AccountingCatalogXmlImportResult> {
    const organizationId = this.getOrganizationId();
    const preview = await this.previewCatalogXml(payload);
    if (preview.summary.errors > 0) {
      throw new AppError(
        400,
        "ACCOUNTING_CATALOG_XML_HAS_ERRORS",
        `El XML tiene ${preview.summary.errors} cuenta(s) con errores. Revisa la vista previa antes de importar.`
      );
    }

    const importAccounts = preview.accounts.filter((account) => account.action !== "ERROR");
    const importedCodes = new Set(importAccounts.map((account) => account.code));
    let deactivated = 0;
    const accounts = await this.prisma.$transaction(async (tx) => {
      const existingAccounts = await tx.accountingAccount.findMany({
        where: { organizationId },
        select: { code: true, id: true, level: true }
      });
      const accountByCode = new Map(existingAccounts.map((account) => [account.code, account]));

      if (payload.replaceActiveCatalog) {
        const result = await tx.accountingAccount.updateMany({
          where: {
            organizationId,
            isActive: true,
            code: { notIn: Array.from(importedCodes) }
          },
          data: { isActive: false }
        });
        deactivated = result.count;
      }

      let pending = [...importAccounts].sort((first, second) => first.level - second.level || first.code.localeCompare(second.code, "es-MX"));
      while (pending.length > 0) {
        const nextPending: typeof pending = [];
        let progressed = false;

        for (const account of pending) {
          const parent = account.parentCode ? accountByCode.get(account.parentCode) : null;
          if (account.parentCode && !parent && importedCodes.has(account.parentCode)) {
            nextPending.push(account);
            continue;
          }
          if (account.parentCode && !parent) {
            throw new AppError(400, "ACCOUNTING_CATALOG_PARENT_NOT_FOUND", `No se encontro la cuenta padre ${account.parentCode}.`);
          }

          const record = await tx.accountingAccount.upsert({
            where: {
              organizationId_code: {
                organizationId,
                code: account.code
              }
            },
            create: {
              organizationId,
              code: account.code,
              name: account.name,
              type: account.type,
              satGroupingCode: account.satGroupingCode ?? null,
              parentId: parent?.id ?? null,
              level: account.level,
              nature: account.nature,
              isActive: true,
              isDefault: false
            },
            update: {
              name: account.name,
              type: account.type,
              satGroupingCode: account.satGroupingCode ?? null,
              parentId: parent?.id ?? null,
              level: account.level,
              nature: account.nature,
              isActive: true
            },
            select: { id: true, level: true }
          });
          accountByCode.set(account.code, { code: account.code, ...record });
          progressed = true;
        }

        if (!progressed) {
          throw new AppError(400, "ACCOUNTING_CATALOG_PARENT_CYCLE", "No se pudo resolver la jerarquia del catalogo. Revisa cuentas padre circulares o faltantes.");
        }

        pending = nextPending;
      }

      return tx.accountingAccount.findMany({
        where: { organizationId },
        orderBy: [{ code: "asc" }]
      });
    });

    return {
      preview,
      accounts: accounts.map(mapAccountingAccount),
      deactivated
    };
  }

  public async createAccount(payload: AccountingCreateAccountInput) {
    const organizationId = this.getOrganizationId();
    const type = normalizeAccountType(payload.type);
    const parent = payload.parentId
      ? await this.prisma.accountingAccount.findFirst({
          where: { organizationId, id: payload.parentId },
          select: { id: true, level: true }
        })
      : null;

    if (payload.parentId && !parent) {
      throw new AppError(404, "ACCOUNT_PARENT_NOT_FOUND", "Parent account was not found.");
    }

    const account = await this.prisma.accountingAccount.create({
      data: {
        organizationId,
        code: normalizeRequiredText(payload.code),
        name: normalizeRequiredText(payload.name),
        type,
        subtype: normalizeOptionalText(payload.subtype),
        satGroupingCode: normalizeOptionalText(payload.satGroupingCode),
        parentId: parent?.id ?? null,
        level: parent ? parent.level + 1 : 1,
        nature: normalizeAccountNature(payload.nature, type)
      }
    });

    return mapAccountingAccount(account);
  }

  public async updateAccount(accountId: string, payload: Partial<AccountingCreateAccountInput> & { isActive?: boolean }) {
    const organizationId = this.getOrganizationId();
    const current = await this.findAccountOrThrow(accountId);
    const nextType = payload.type ? normalizeAccountType(payload.type) : (current.type as AccountingAccountType);
    const parent = Object.prototype.hasOwnProperty.call(payload, "parentId") && payload.parentId
      ? await this.prisma.accountingAccount.findFirst({
          where: { organizationId, id: payload.parentId },
          select: { id: true, level: true }
        })
      : null;

    if (payload.parentId && !parent) {
      throw new AppError(404, "ACCOUNT_PARENT_NOT_FOUND", "Parent account was not found.");
    }

    const account = await this.prisma.accountingAccount.update({
      where: {
        organizationId_code: {
          organizationId,
          code: current.code
        }
      },
      data: {
        code: payload.code ? normalizeRequiredText(payload.code) : undefined,
        name: payload.name ? normalizeRequiredText(payload.name) : undefined,
        type: payload.type ? nextType : undefined,
        subtype: Object.prototype.hasOwnProperty.call(payload, "subtype") ? normalizeOptionalText(payload.subtype) : undefined,
        satGroupingCode: Object.prototype.hasOwnProperty.call(payload, "satGroupingCode") ? normalizeOptionalText(payload.satGroupingCode) : undefined,
        parentId: Object.prototype.hasOwnProperty.call(payload, "parentId") ? parent?.id ?? null : undefined,
        level: Object.prototype.hasOwnProperty.call(payload, "parentId") ? parent ? parent.level + 1 : 1 : undefined,
        nature: payload.nature ? normalizeAccountNature(payload.nature, nextType) : undefined,
        isActive: typeof payload.isActive === "boolean" ? payload.isActive : undefined
      }
    });

    return mapAccountingAccount(account);
  }

  public async createJournalEntry(payload: AccountingJournalEntryInput, actor?: { userId?: string; displayName?: string }) {
    assertMonth(payload.month);
    assertBalanced(payload.lines);
    const organizationId = this.getOrganizationId();
    const entryDate = parseDateOnly(payload.entryDate) ?? getMonthEndDate(payload.year, payload.month);

    const entry = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextEntryNumber(tx, payload.year, payload.month);
      const created = await tx.accountingJournalEntry.create({
        data: {
          organizationId,
          year: payload.year,
          month: payload.month,
          entryDate,
          number,
          entryType: payload.entryType ?? "MANUAL",
          status: "POSTED",
          description: normalizeRequiredText(payload.description),
          createdByUserId: actor?.userId ?? null,
          createdByName: actor?.displayName ?? null,
          lines: {
            create: payload.lines.map((line) => ({
              organizationId,
              ...buildLineData(line)
            }))
          }
        },
        include: getEntryInclude()
      });
      await this.markPeriodDirty(tx, payload.year, payload.month);
      return created;
    });

    return mapAccountingJournalEntry(entry);
  }

  public async createOpeningBalance(payload: AccountingInitialBalanceInput, actor?: { userId?: string; displayName?: string }) {
    const organizationId = this.getOrganizationId();
    const [targetAccount, equityAccount] = await Promise.all([
      this.findAccountOrThrow(payload.accountId),
      this.findAccountByCodeOrThrow(DEFAULT_ACCOUNT_CODES.openingEquity)
    ]);
    const debit = Number(payload.debitMxn ?? 0);
    const credit = Number(payload.creditMxn ?? 0);
    if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) {
      throw new AppError(400, "INVALID_OPENING_BALANCE", "Capture saldo inicial en cargo o abono, no ambos.");
    }

    const lines: AccountingJournalLineInput[] = debit > 0
      ? [
          { accountId: targetAccount.id, description: "Saldo inicial", debitMxn: debit },
          { accountId: equityAccount.id, description: `Contrapartida saldo inicial ${targetAccount.code}`, creditMxn: debit }
        ]
      : [
          { accountId: equityAccount.id, description: `Contrapartida saldo inicial ${targetAccount.code}`, debitMxn: credit },
          { accountId: targetAccount.id, description: "Saldo inicial", creditMxn: credit }
        ];

    return this.createJournalEntry({
      year: payload.year,
      month: 1,
      entryDate: `${payload.year}-01-01`,
      entryType: "OPENING",
      description: normalizeOptionalText(payload.description) ?? `Saldo inicial ${targetAccount.code}`,
      lines
    }, actor);
  }

  public async uploadCfdiDocuments(files: AccountingCfdiUploadInput[]) {
    const organizationId = this.getOrganizationId();
    const imported: AccountingCfdiDocument[] = [];
    const duplicates: AccountingCfdiDocument[] = [];
    const errors: Array<{ originalFileName: string; message: string }> = [];

    for (const file of files) {
      try {
        const xml = Buffer.from(file.xmlBase64, "base64").toString("utf8");
        const parsed = parseCfdiXml(xml, file.originalFileName);
        const existing = await this.prisma.accountingCfdiDocument.findUnique({
          where: {
            organizationId_uuid: {
              organizationId,
              uuid: parsed.uuid
            }
          }
        });

        if (existing) {
          duplicates.push(mapAccountingCfdiDocument(existing));
          continue;
        }

        const record = await this.prisma.accountingCfdiDocument.create({
          data: {
            organizationId,
            uuid: parsed.uuid,
            version: parsed.version,
            type: parsed.type,
            issuerRfc: parsed.issuerRfc,
            issuerName: parsed.issuerName,
            receiverRfc: parsed.receiverRfc,
            receiverName: parsed.receiverName,
            issueDate: parsed.issueDate,
            certificationDate: parsed.certificationDate,
            subtotalMxn: normalizeMoney(parsed.subtotalMxn),
            discountMxn: normalizeMoney(parsed.discountMxn),
            taxMxn: normalizeMoney(parsed.taxMxn),
            totalMxn: normalizeMoney(parsed.totalMxn),
            currency: parsed.currency,
            paymentMethod: parsed.paymentMethod,
            paymentForm: parsed.paymentForm,
            usage: parsed.usage,
            originalFileName: file.originalFileName,
            xmlContent: xml,
            parsedData: parsed.parsedData as Prisma.InputJsonValue
          }
        });
        imported.push(mapAccountingCfdiDocument(record));
      } catch (error) {
        errors.push({
          originalFileName: file.originalFileName,
          message: error instanceof Error ? error.message : "No se pudo procesar el XML."
        });
      }
    }

    return { imported, duplicates, errors };
  }

  public async generateAutomaticEntries(year: number, month: number): Promise<AccountingAutomationResult> {
    assertMonth(month);
    await this.initializeStandardCatalog();
    const organizationId = this.getOrganizationId();
    const accountLookup = await this.getDefaultAccounts();
    const created: AccountingJournalEntry[] = [];
    const skipped: AccountingPendingItem[] = [];

    const [financeRecords, generalExpenses] = await Promise.all([
      this.prisma.financeRecord.findMany({
        where: { organizationId, year, month },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.generalExpense.findMany({
        where: { organizationId, year, month },
        orderBy: [{ createdAt: "asc" }]
      })
    ]);

    for (const record of financeRecords) {
      const conceptFeesMxn = Number(record.conceptFeesMxn ?? 0);
      if (conceptFeesMxn > 0) {
        const result = await this.createAutomaticEntryIfMissing({
          year,
          month,
          entryDate: record.nextPaymentDate ?? getMonthEndDate(year, month),
          entryType: "FINANCE_INCOME",
          description: `Ingreso devengado ${record.clientName || record.subject || record.quoteNumber || ""}`.trim(),
          sourceType: "FINANCE_INCOME",
          sourceId: record.id,
          sourceFingerprint: `finance-income:${record.id}`,
          lines: [
            { accountId: accountLookup.clients.id, description: "Cuenta por cobrar", debitMxn: conceptFeesMxn },
            { accountId: accountLookup.income.id, description: "Ingreso por servicios", creditMxn: conceptFeesMxn }
          ]
        });
        if (result) {
          created.push(result);
        }
      }

      const payments = [
        { index: 1, amount: Number(record.paidThisMonthMxn ?? 0), date: record.paymentDate1, method: record.paymentMethod, received: record.paymentReceived },
        { index: 2, amount: Number(record.payment2Mxn ?? 0), date: record.paymentDate2, method: record.paymentMethod2, received: record.paymentReceived2 },
        { index: 3, amount: Number(record.payment3Mxn ?? 0), date: record.paymentDate3, method: record.paymentMethod3, received: record.paymentReceived3 }
      ];

      for (const payment of payments) {
        if (payment.amount <= 0 || !payment.date || !isPaymentReceived(payment.method, payment.received)) {
          continue;
        }

        const vatMxn = roundMoney(payment.amount * IVA_RATE);
        const cashAccount = payment.method === "E" ? accountLookup.cash : accountLookup.bank;
        const result = await this.createAutomaticEntryIfMissing({
          year,
          month,
          entryDate: payment.date,
          entryType: "FINANCE_PAYMENT",
          description: `Cobro ${payment.index} ${record.clientName || record.subject || record.quoteNumber || ""}`.trim(),
          sourceType: "FINANCE_PAYMENT",
          sourceId: record.id,
          sourceFingerprint: `finance-payment:${record.id}:${payment.index}`,
          lines: [
            { accountId: cashAccount.id, description: "Cobro recibido", debitMxn: roundMoney(payment.amount + vatMxn) },
            { accountId: accountLookup.clients.id, description: "Aplicacion a cuentas por cobrar", creditMxn: payment.amount },
            { accountId: accountLookup.vatTransferredCollected.id, description: "IVA efectivamente cobrado", creditMxn: vatMxn }
          ]
        });
        if (result) {
          created.push(result);
        }
      }
    }

    for (const expense of generalExpenses) {
      const amountMxn = Number(expense.amountMxn ?? 0);
      if (amountMxn <= 0) {
        skipped.push({
          id: `general-expense:${expense.id}`,
          sourceType: "GENERAL_EXPENSE",
          sourceId: expense.id,
          label: "Gasto sin monto",
          detail: expense.detail,
          severity: "WARNING"
        });
        continue;
      }

      const isPaid = Boolean(expense.paid || expense.paidAt || expense.approvedByEmrt);
      const hasVat = Boolean(expense.hasVat);
      const vatMxn = hasVat ? roundMoney(amountMxn * IVA_RATE) : 0;
      const cashAccount = expense.paymentMethod === "Efectivo" ? accountLookup.cash : accountLookup.bank;
      const creditAccount = isPaid ? cashAccount : accountLookup.suppliers;
      const vatAccount = isPaid ? accountLookup.vatCreditablePaid : accountLookup.vatCreditablePending;
      const result = await this.createAutomaticEntryIfMissing({
        year,
        month,
        entryDate: expense.paidAt ?? expense.paidByEmrtAt ?? getMonthEndDate(year, month),
        entryType: "GENERAL_EXPENSE",
        description: `Gasto general ${expense.detail}`.trim(),
        sourceType: "GENERAL_EXPENSE",
        sourceId: expense.id,
        sourceFingerprint: `general-expense:${expense.id}`,
        lines: [
          { accountId: accountLookup.generalExpense.id, description: expense.detail, debitMxn: amountMxn },
          ...(vatMxn > 0 ? [{ accountId: vatAccount.id, description: isPaid ? "IVA efectivamente pagado" : "IVA pendiente de pago", debitMxn: vatMxn }] : []),
          { accountId: creditAccount.id, description: isPaid ? "Pago de gasto" : "Provision de gasto", creditMxn: roundMoney(amountMxn + vatMxn) }
        ]
      });
      if (result) {
        created.push(result);
      }
    }

    if (created.length > 0) {
      await this.markPeriodDirty(this.prisma, year, month);
    }

    return { created, skipped };
  }

  public async exportSatXml(year: number, month: number, format: AccountingXmlExportResult["format"]) {
    assertMonth(month);
    const overview = await this.getOverview(year, month);
    const settings = overview.settings;
    const rfc = normalizeRfc(settings.companyRfc) ?? "RFC_PENDIENTE";
    const monthText = String(month).padStart(2, "0");
    const generatedAt = new Date().toISOString();
    let content = "";

    if (format === "CATALOGO") {
      content = this.buildCatalogXml(overview.accounts, rfc, year, monthText);
    } else if (format === "BALANZA") {
      content = this.buildTrialBalanceXml(overview.trialBalance, rfc, year, monthText);
    } else if (format === "POLIZAS") {
      content = this.buildPoliciesXml(overview.entries, rfc, year, monthText);
    } else if (format === "AUXILIAR_CUENTAS") {
      content = this.buildAccountAuxiliaryXml(overview.entries, rfc, year, monthText);
    } else if (format === "AUXILIAR_FOLIOS") {
      content = this.buildFoliosAuxiliaryXml(overview.cfdiDocuments, overview.entries, rfc, year, monthText);
    } else {
      throw new AppError(400, "INVALID_SAT_XML_FORMAT", "Invalid SAT XML format.");
    }

    await this.prisma.accountingPeriod.upsert({
      where: {
        organizationId_year_month: {
          organizationId: this.getOrganizationId(),
          year,
          month
        }
      },
      create: {
        organizationId: this.getOrganizationId(),
        year,
        month,
        status: "SAT_EXPORTED",
        exportedAt: new Date(),
        requiresRegeneration: false
      },
      update: {
        status: "SAT_EXPORTED",
        exportedAt: new Date(),
        requiresRegeneration: false
      }
    });

    return {
      fileName: `${rfc}${year}${monthText}_${format.toLowerCase()}.xml`,
      content,
      format,
      generatedAt
    };
  }

  private async findOrCreatePeriod(year: number, month: number) {
    const organizationId = this.getOrganizationId();
    return this.prisma.accountingPeriod.upsert({
      where: {
        organizationId_year_month: {
          organizationId,
          year,
          month
        }
      },
      create: { organizationId, year, month },
      update: {}
    });
  }

  private async findOrCreateSettings() {
    const organizationId = this.getOrganizationId();
    return this.prisma.accountingSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {}
    });
  }

  private async findAccountOrThrow(accountId: string) {
    const account = await this.prisma.accountingAccount.findFirst({
      where: {
        organizationId: this.getOrganizationId(),
        id: accountId
      }
    });

    if (!account) {
      throw new AppError(404, "ACCOUNT_NOT_FOUND", "Accounting account was not found.");
    }

    return account;
  }

  private async findAccountByCodeOrThrow(code: string) {
    const account = await this.prisma.accountingAccount.findUnique({
      where: {
        organizationId_code: {
          organizationId: this.getOrganizationId(),
          code
        }
      }
    });

    if (!account) {
      throw new AppError(404, "ACCOUNT_NOT_FOUND", `Missing accounting account ${code}.`);
    }

    return account;
  }

  private async getDefaultAccounts() {
    const entries = await Promise.all(Object.entries(DEFAULT_ACCOUNT_CODES).map(async ([key, code]) => [
      key,
      await this.findAccountByCodeOrThrow(code)
    ] as const));

    return Object.fromEntries(entries) as Record<keyof typeof DEFAULT_ACCOUNT_CODES, Awaited<ReturnType<typeof this.findAccountByCodeOrThrow>>>;
  }

  private async nextEntryNumber(prisma: PrismaExecutor, year: number, month: number) {
    const organizationId = this.getOrganizationId();
    const count = await prisma.accountingJournalEntry.count({
      where: { organizationId, year, month }
    });
    return `${getMonthKey(year, month)}-${String(count + 1).padStart(4, "0")}`;
  }

  private async createAutomaticEntryIfMissing(input: {
    year: number;
    month: number;
    entryDate: Date;
    entryType: AccountingJournalEntry["entryType"];
    description: string;
    sourceType: string;
    sourceId: string;
    sourceFingerprint: string;
    lines: AccountingJournalLineInput[];
  }) {
    assertBalanced(input.lines);
    const organizationId = this.getOrganizationId();
    const existing = await this.prisma.accountingJournalEntry.findFirst({
      where: {
        organizationId,
        sourceType: input.sourceType,
        sourceFingerprint: input.sourceFingerprint
      },
      select: { id: true }
    });

    if (existing) {
      return null;
    }

    const entry = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextEntryNumber(tx, input.year, input.month);
      const created = await tx.accountingJournalEntry.create({
        data: {
          organizationId,
          year: input.year,
          month: input.month,
          entryDate: input.entryDate,
          number,
          entryType: input.entryType,
          status: "POSTED",
          description: input.description,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceFingerprint: input.sourceFingerprint,
          lines: {
            create: input.lines.map((line) => ({
              organizationId,
              ...buildLineData(line, input.sourceType, input.sourceId)
            }))
          }
        },
        include: getEntryInclude()
      });
      await this.markPeriodDirty(tx, input.year, input.month);
      return created;
    });

    return mapAccountingJournalEntry(entry);
  }

  private async markPeriodDirty(prisma: PrismaExecutor, year: number, month: number) {
    const organizationId = this.getOrganizationId();
    await prisma.accountingPeriod.upsert({
      where: {
        organizationId_year_month: {
          organizationId,
          year,
          month
        }
      },
      create: {
        organizationId,
        year,
        month,
        requiresRegeneration: true
      },
      update: {
        requiresRegeneration: true
      }
    });
  }

  private buildTrialBalance(
    accounts: AccountingAccount[],
    entries: AccountingJournalEntry[],
    year: number,
    month: number
  ): AccountingTrialBalanceLine[] {
    const rows = new Map<string, AccountingTrialBalanceLine>();
    for (const account of accounts) {
      rows.set(account.id, {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        openingDebitMxn: 0,
        openingCreditMxn: 0,
        periodDebitMxn: 0,
        periodCreditMxn: 0,
        endingDebitMxn: 0,
        endingCreditMxn: 0
      });
    }

    for (const entry of entries) {
      const isBeforePeriod = entry.year < year || (entry.year === year && entry.month < month);
      const isInPeriod = entry.year === year && entry.month === month;
      for (const line of entry.lines) {
        const row = rows.get(line.accountId);
        if (!row) {
          continue;
        }

        if (isBeforePeriod) {
          row.openingDebitMxn += line.debitMxn;
          row.openingCreditMxn += line.creditMxn;
        } else if (isInPeriod) {
          row.periodDebitMxn += line.debitMxn;
          row.periodCreditMxn += line.creditMxn;
        }
      }
    }

    return [...rows.values()]
      .map((row) => {
        const ending = row.openingDebitMxn - row.openingCreditMxn + row.periodDebitMxn - row.periodCreditMxn;
        return {
          ...row,
          openingDebitMxn: roundMoney(row.openingDebitMxn),
          openingCreditMxn: roundMoney(row.openingCreditMxn),
          periodDebitMxn: roundMoney(row.periodDebitMxn),
          periodCreditMxn: roundMoney(row.periodCreditMxn),
          endingDebitMxn: roundMoney(Math.max(0, ending)),
          endingCreditMxn: roundMoney(Math.max(0, -ending))
        };
      })
      .filter((row) =>
        row.openingDebitMxn ||
        row.openingCreditMxn ||
        row.periodDebitMxn ||
        row.periodCreditMxn ||
        row.endingDebitMxn ||
        row.endingCreditMxn
      )
      .sort((left, right) => left.accountCode.localeCompare(right.accountCode));
  }

  private buildBalanceSheet(accounts: AccountingAccount[], trialBalance: AccountingTrialBalanceLine[]) {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    return trialBalance
      .filter((row) => ["ASSET", "LIABILITY", "EQUITY"].includes(row.accountType))
      .map((row) => {
        const account = accountById.get(row.accountId);
        const naturalBalance = row.endingDebitMxn - row.endingCreditMxn;
        const amountMxn = account?.nature === "CREDIT" ? -naturalBalance : naturalBalance;
        return {
          accountType: row.accountType,
          accountId: row.accountId,
          accountCode: row.accountCode,
          accountName: row.accountName,
          amountMxn: roundMoney(amountMxn)
        };
      })
      .filter((line) => line.amountMxn !== 0);
  }

  private buildIncomeStatement(accounts: AccountingAccount[], trialBalance: AccountingTrialBalanceLine[]) {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    return trialBalance
      .filter((row) => ["INCOME", "COST", "EXPENSE"].includes(row.accountType))
      .map((row) => {
        const account = accountById.get(row.accountId);
        const periodBalance = row.periodDebitMxn - row.periodCreditMxn;
        const amountMxn = account?.nature === "CREDIT" ? -periodBalance : periodBalance;
        return {
          accountType: row.accountType,
          accountId: row.accountId,
          accountCode: row.accountCode,
          accountName: row.accountName,
          amountMxn: roundMoney(amountMxn)
        };
      })
      .filter((line) => line.amountMxn !== 0);
  }

  private buildTotals(
    trialBalance: AccountingTrialBalanceLine[],
    balanceSheet: AccountingFinancialStatementLine[],
    incomeStatement: AccountingFinancialStatementLine[]
  ) {
    const sumByType = (lines: AccountingFinancialStatementLine[], type: AccountingAccountType) =>
      roundMoney(lines.filter((line) => line.accountType === type).reduce((sum, line) => sum + line.amountMxn, 0));
    const incomeMxn = sumByType(incomeStatement, "INCOME");
    const costsMxn = sumByType(incomeStatement, "COST");
    const expensesMxn = sumByType(incomeStatement, "EXPENSE");

    return {
      assetsMxn: sumByType(balanceSheet, "ASSET"),
      liabilitiesMxn: sumByType(balanceSheet, "LIABILITY"),
      equityMxn: sumByType(balanceSheet, "EQUITY"),
      incomeMxn,
      costsMxn,
      expensesMxn,
      netIncomeMxn: roundMoney(incomeMxn - costsMxn - expensesMxn),
      trialBalanceDebitMxn: roundMoney(trialBalance.reduce((sum, row) => sum + row.periodDebitMxn, 0)),
      trialBalanceCreditMxn: roundMoney(trialBalance.reduce((sum, row) => sum + row.periodCreditMxn, 0))
    };
  }

  private async buildPendingItems(
    year: number,
    month: number,
    accounts: AccountingAccount[],
    entries: AccountingJournalEntry[],
    cfdiDocuments: AccountingCfdiDocument[]
  ) {
    const organizationId = this.getOrganizationId();
    const pending: AccountingPendingItem[] = [];
    const settings = await this.findOrCreateSettings();
    if (!settings.companyRfc) {
      pending.push({
        id: "settings:rfc",
        sourceType: "ACCOUNTING_SETTINGS",
        label: "RFC pendiente",
        detail: "Captura el RFC de la empresa para generar XML SAT validable.",
        severity: "ERROR"
      });
    }

    accounts
      .filter((account) => account.isActive && !account.satGroupingCode)
      .forEach((account) => pending.push({
        id: `account-sat:${account.id}`,
        sourceType: "ACCOUNT",
        sourceId: account.id,
        label: "Cuenta sin codigo SAT",
        detail: `${account.code} ${account.name}`,
        severity: "WARNING"
      }));

    entries
      .filter((entry) => !entry.balanced)
      .forEach((entry) => pending.push({
        id: `entry-unbalanced:${entry.id}`,
        sourceType: "JOURNAL_ENTRY",
        sourceId: entry.id,
        label: "Poliza descuadrada",
        detail: entry.description,
        severity: "ERROR"
      }));

    cfdiDocuments
      .filter((document) => !document.linkedSourceId && document.status === "UPLOADED")
      .forEach((document) => pending.push({
        id: `cfdi-unlinked:${document.id}`,
        sourceType: "CFDI",
        sourceId: document.id,
        label: "CFDI sin poliza",
        detail: `${document.uuid} ${document.issuerName ?? document.issuerRfc}`,
        severity: "INFO"
      }));

    const [financeRecords, generalExpenses] = await Promise.all([
      this.prisma.financeRecord.findMany({ where: { organizationId, year, month }, select: { id: true, clientName: true, subject: true } }),
      this.prisma.generalExpense.findMany({ where: { organizationId, year, month }, select: { id: true, detail: true } })
    ]);
    const fingerprints = new Set(
      await this.prisma.accountingJournalEntry.findMany({
        where: { organizationId, year, month, sourceFingerprint: { not: null } },
        select: { sourceFingerprint: true }
      }).then((rows) => rows.map((row) => row.sourceFingerprint).filter((value): value is string => Boolean(value)))
    );

    financeRecords
      .filter((record) => !fingerprints.has(`finance-income:${record.id}`))
      .forEach((record) => pending.push({
        id: `finance-pending:${record.id}`,
        sourceType: "FINANCE_INCOME",
        sourceId: record.id,
        label: "Ingreso pendiente de contabilizar",
        detail: `${record.clientName} ${record.subject}`.trim(),
        severity: "INFO"
      }));

    generalExpenses
      .filter((record) => !fingerprints.has(`general-expense:${record.id}`))
      .forEach((record) => pending.push({
        id: `expense-pending:${record.id}`,
        sourceType: "GENERAL_EXPENSE",
        sourceId: record.id,
        label: "Gasto pendiente de contabilizar",
        detail: record.detail,
        severity: "INFO"
      }));

    return pending;
  }

  private buildCatalogXml(accounts: AccountingAccount[], rfc: string, year: number, monthText: string) {
    const rows = accounts
      .filter((account) => account.isActive)
      .map((account) =>
        `  <catalogocuentas:Ctas CodAgrup="${xmlEscape(account.satGroupingCode ?? "")}" NumCta="${xmlEscape(account.code)}" Desc="${xmlEscape(account.name)}" Nivel="${account.level}" Natur="${account.nature === "DEBIT" ? "D" : "A"}"${account.parentId ? ` SubCtaDe="${xmlEscape(accounts.find((candidate) => candidate.id === account.parentId)?.code ?? "")}"` : ""}/>`
      )
      .join("\n");

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<catalogocuentas:Catalogo Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${monthText}" Anio="${year}" xmlns:catalogocuentas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/CatalogoCuentas">`,
      rows,
      `</catalogocuentas:Catalogo>`
    ].join("\n");
  }

  private buildTrialBalanceXml(lines: AccountingTrialBalanceLine[], rfc: string, year: number, monthText: string) {
    const rows = lines.map((line) => {
      const opening = line.openingDebitMxn - line.openingCreditMxn;
      const ending = line.endingDebitMxn - line.endingCreditMxn;
      return `  <BCE:Ctas NumCta="${xmlEscape(line.accountCode)}" SaldoIni="${formatXmlMoney(opening)}" Debe="${formatXmlMoney(line.periodDebitMxn)}" Haber="${formatXmlMoney(line.periodCreditMxn)}" SaldoFin="${formatXmlMoney(ending)}"/>`;
    }).join("\n");

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<BCE:Balanza Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${monthText}" Anio="${year}" TipoEnvio="N" xmlns:BCE="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/BalanzaComprobacion">`,
      rows,
      `</BCE:Balanza>`
    ].join("\n");
  }

  private buildPoliciesXml(entries: AccountingJournalEntry[], rfc: string, year: number, monthText: string) {
    const rows = entries.map((entry) => [
      `  <PLZ:Poliza NumUnIdenPol="${xmlEscape(entry.number)}" Fecha="${xmlEscape(entry.entryDate)}" Concepto="${xmlEscape(entry.description)}">`,
      ...entry.lines.map((line) =>
        `    <PLZ:Transaccion NumCta="${xmlEscape(line.accountCode)}" DesCta="${xmlEscape(line.accountName)}" Concepto="${xmlEscape(line.description)}" Debe="${formatXmlMoney(line.debitMxn)}" Haber="${formatXmlMoney(line.creditMxn)}"/>`
      ),
      `  </PLZ:Poliza>`
    ].join("\n")).join("\n");

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<PLZ:Polizas Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${monthText}" Anio="${year}" TipoSolicitud="AF" NumOrden="" NumTramite="" xmlns:PLZ="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/PolizasPeriodo">`,
      rows,
      `</PLZ:Polizas>`
    ].join("\n");
  }

  private buildAccountAuxiliaryXml(entries: AccountingJournalEntry[], rfc: string, year: number, monthText: string) {
    const rows = entries.flatMap((entry) => entry.lines.map((line) =>
      `  <AuxiliarCtas:Cuenta NumCta="${xmlEscape(line.accountCode)}" DesCta="${xmlEscape(line.accountName)}"><AuxiliarCtas:DetalleAux Fecha="${xmlEscape(entry.entryDate)}" NumUnIdenPol="${xmlEscape(entry.number)}" Concepto="${xmlEscape(line.description)}" Debe="${formatXmlMoney(line.debitMxn)}" Haber="${formatXmlMoney(line.creditMxn)}"/></AuxiliarCtas:Cuenta>`
    )).join("\n");

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<AuxiliarCtas:AuxiliarCtas Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${monthText}" Anio="${year}" TipoSolicitud="AF" NumOrden="" NumTramite="" xmlns:AuxiliarCtas="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarCtas">`,
      rows,
      `</AuxiliarCtas:AuxiliarCtas>`
    ].join("\n");
  }

  private buildFoliosAuxiliaryXml(
    cfdiDocuments: AccountingCfdiDocument[],
    entries: AccountingJournalEntry[],
    rfc: string,
    year: number,
    monthText: string
  ) {
    const entryByCfdiId = new Map(entries.filter((entry) => entry.cfdiDocumentId).map((entry) => [entry.cfdiDocumentId, entry]));
    const rows = cfdiDocuments.map((document) => {
      const entry = entryByCfdiId.get(document.id);
      return `  <RepAux:DetAuxFol NumUnIdenPol="${xmlEscape(entry?.number ?? "")}" Fecha="${xmlEscape(entry?.entryDate ?? document.issueDate?.slice(0, 10) ?? "")}"><RepAux:ComprNal UUID_CFDI="${xmlEscape(document.uuid)}" RFC="${xmlEscape(document.issuerRfc)}" MontoTotal="${formatXmlMoney(document.totalMxn)}"/></RepAux:DetAuxFol>`;
    }).join("\n");

    return [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<RepAux:RepAuxFol Version="1.3" RFC="${xmlEscape(rfc)}" Mes="${monthText}" Anio="${year}" TipoSolicitud="AF" NumOrden="" NumTramite="" xmlns:RepAux="http://www.sat.gob.mx/esquemas/ContabilidadE/1_3/AuxiliarFolios">`,
      rows,
      `</RepAux:RepAuxFol>`
    ].join("\n");
  }
}
