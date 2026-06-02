import { Buffer } from "node:buffer";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ExternalContract, ExternalContractInpc, ExternalContractRenewal } from "@sige/contracts";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip
} from "docx";
import PDFDocument from "pdfkit";

import { AppError } from "../../core/errors/app-error";

export const RENT_UPDATE_TEMPLATE_ID = "rent-increase";
export const RENT_UPDATE_TEMPLATE_TITLE = "Formato de aumento de renta";
export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME_TYPE = "application/pdf";

const RENT_UPDATE_BASE_TEMPLATE_URL = new URL("../../../templates/formato-actualizacion-renta-base.docx", import.meta.url);
const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];

const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF"
};
const signatureBorder = {
  style: BorderStyle.SINGLE,
  size: 8,
  color: "000000"
};
const SIGNATURE_TABLE_WIDTH_DXA = 9792;
const SIGNATURE_CELL_WIDTH_DXA = 4700;
const SIGNATURE_SPACER_WIDTH_DXA = SIGNATURE_TABLE_WIDTH_DXA - (SIGNATURE_CELL_WIDTH_DXA * 2);

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];

export interface RentUpdateFormatInput {
  contract: ExternalContract;
  renewalId?: string | null;
  documentDate?: string | null;
  effectiveDate?: string | null;
  previousRentMxn?: number | null;
  inpcBasePeriod?: string | null;
  inpcTargetPeriod?: string | null;
  useRoundedRent?: boolean | null;
  roundedRentMxn?: number | null;
  inpcRecords: ExternalContractInpc[];
}

export interface RentUpdateGeneratedFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface RentUpdateFormatOutput {
  word: RentUpdateGeneratedFile;
  pdf: RentUpdateGeneratedFile;
  renewalId?: string;
  documentDate: string;
  effectiveDate: string;
  monthlyRentMxn?: number;
  rentIncreasePct?: number;
  inpcBasePeriod?: string | null;
  inpcTargetPeriod?: string | null;
  templateId: string;
  templateTitle: string;
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeDateInput(value: string | null | undefined, fallback: string, label: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return fallback;
  }

  if (!parseDateKey(normalized)) {
    throw new AppError(400, "EXTERNAL_CONTRACT_RENT_UPDATE_DATE_INVALID", `${label} debe tener formato AAAA-MM-DD.`);
  }

  return normalized;
}

function normalizePeriodInput(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new AppError(400, "EXTERNAL_CONTRACT_RENT_UPDATE_INPC_INVALID", "El período INPC debe tener formato AAAA-MM.");
  }

  return normalized;
}

function normalizePositiveNumber(value: number | null | undefined, label: string) {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new AppError(400, "EXTERNAL_CONTRACT_RENT_UPDATE_AMOUNT_INVALID", `${label} debe ser mayor a cero.`);
  }

  return value;
}

function textOrFallback(value: string | undefined, fallback: string) {
  return normalizeText(value) || fallback;
}

function parseDateKey(value?: string | null) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLongDate(value?: string | null) {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return normalizeText(value) || "__ de ______ de 20__";
  }

  const day = parsed.getUTCDate();
  const month = MONTHS_ES[parsed.getUTCMonth()] ?? "";
  const dayLabel = day === 1 ? "1°" : String(day);
  return `${dayLabel} de ${month} de ${parsed.getUTCFullYear()}`;
}

function formatFilenameDate(value?: string | null) {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return currentDateKey().split("-").reverse().join(".");
  }

  return [
    String(parsed.getUTCDate()).padStart(2, "0"),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCFullYear())
  ].join(".");
}

function sanitizeHumanFilenamePart(value?: string | null, fallback = "Sin dato") {
  return (normalizeText(value) || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}

const lowercaseNameParticles = new Set(["de", "del", "la", "las", "los", "y", "e"]);

function shouldNormalizeNameCasing(value: string) {
  const letters = value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  return Boolean(letters) && (letters === letters.toLocaleUpperCase("es-MX") || letters === letters.toLocaleLowerCase("es-MX"));
}

function capitalizeNameToken(value: string, tokenIndex: number) {
  const lowerValue = value.toLocaleLowerCase("es-MX");

  if (tokenIndex > 0 && lowercaseNameParticles.has(lowerValue)) {
    return lowerValue;
  }

  return `${lowerValue.charAt(0).toLocaleUpperCase("es-MX")}${lowerValue.slice(1)}`;
}

function formatPersonNameForFilename(value?: string | null, fallback = "Arrendatario sin nombre") {
  const sanitized = sanitizeHumanFilenamePart(value, fallback);

  if (!shouldNormalizeNameCasing(sanitized)) {
    return sanitized;
  }

  let tokenIndex = 0;
  return sanitized
    .split(/(\s+|-)/)
    .map((part) => {
      if (!part || /^\s+$/.test(part) || part === "-") {
        return part;
      }

      const formatted = capitalizeNameToken(part, tokenIndex);
      tokenIndex += 1;
      return formatted;
    })
    .join("");
}

function inferFileExtension(fileMimeType?: string | null, originalFileName?: string | null) {
  const normalizedMimeType = normalizeText(fileMimeType).toLowerCase();
  const normalizedFileName = normalizeText(originalFileName).toLowerCase();

  if (normalizedMimeType.includes("pdf") || normalizedFileName.endsWith(".pdf")) {
    return "pdf";
  }

  if (normalizedFileName.endsWith(".doc")) {
    return "doc";
  }

  return "docx";
}

function extractRentUpdateDownloadDate(value?: string | null) {
  const filename = normalizeText(value);
  const comparableFilename = filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const match = filename.match(/\((\d{2}\.\d{2}\.\d{4})\)\.[a-z0-9]+$/iu);
  if (!comparableFilename.startsWith("actualizacion de renta (")) {
    return null;
  }

  return match?.[1] ?? null;
}

export function resolveRentUpdateDownloadFilename(input: {
  clientName?: string | null;
  tenantName?: string | null;
  documentDate?: string | null;
  fileMimeType?: string | null;
  originalFileName?: string | null;
}) {
  const tenantName = formatPersonNameForFilename(
    normalizeText(input.tenantName) || normalizeText(input.clientName),
    "Arrendatario sin nombre"
  );
  const extension = inferFileExtension(input.fileMimeType, input.originalFileName);
  const cleanExtension = extension.replace(/^\.+/, "") || "docx";
  const dateLabel = extractRentUpdateDownloadDate(input.originalFileName) ?? formatFilenameDate(input.documentDate);

  return `Actualización de renta (${tenantName}) (${dateLabel}).${cleanExtension}`;
}

function buildRentUpdateFilename(contract: ExternalContract, documentDate: string, extension: string) {
  const tenantName = formatPersonNameForFilename(
    normalizeText(contract.tenantName) || normalizeText(contract.clientName),
    "Arrendatario sin nombre"
  );
  const dateLabel = formatFilenameDate(documentDate);
  const cleanExtension = extension.replace(/^\.+/, "") || "docx";

  return `Actualización de renta (${tenantName}) (${dateLabel}).${cleanExtension}`;
}

function formatCurrency(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) {
    return "$***** M.N.";
  }

  return `${new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(value)} M.N.`;
}

function formatPercent(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return "*****%";
  }

  return `${value.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatInpcValue(record?: ExternalContractInpc) {
  if (!record || !Number.isFinite(record.value)) {
    return "*****";
  }

  return record.value.toLocaleString("es-MX", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 6
  });
}

function formatInpcPeriod(periodKey?: string | null) {
  const normalized = normalizeText(periodKey);
  const match = normalized.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return "período pendiente";
  }

  const monthIndex = Number(match[2]) - 1;
  return `${MONTHS_ES[monthIndex] ?? match[2]} de ${match[1]}`;
}

function inpcPeriodKey(record: ExternalContractInpc) {
  return `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}`;
}

function dateToInpcPeriodKey(value?: string | null) {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return null;
  }

  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addYearsDateKey(value: string, years: number) {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return value;
  }

  const next = new Date(parsed);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next.toISOString().slice(0, 10);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function selectRenewal(contract: ExternalContract, renewalId?: string | null) {
  if (renewalId) {
    const renewal = contract.renewals.find((entry) => entry.id === renewalId);
    if (!renewal) {
      throw new AppError(404, "EXTERNAL_CONTRACT_RENEWAL_NOT_FOUND", "La renovacion seleccionada no existe para este contrato.");
    }

    return renewal;
  }

  const renewal = [...contract.renewals].sort((left, right) => right.sequence - left.sequence)[0];
  if (!renewal) {
    throw new AppError(400, "EXTERNAL_CONTRACT_RENEWAL_REQUIRED", "Agrega una renovacion al contrato antes de generar el formato.");
  }

  return renewal;
}

function resolveBaseRent(contract: ExternalContract, renewal: ExternalContractRenewal) {
  const previousRenewal = contract.renewals.find((entry) => entry.sequence === renewal.sequence - 1);
  return renewal.monthlyRentMxn ?? previousRenewal?.monthlyRentMxn ?? contract.monthlyRentMxn;
}

function resolveInpcPeriodRecord(
  inpcRecords: ExternalContractInpc[],
  periodKey?: string | null,
  fallbackToLatest = false
) {
  const recordsByPeriod = new Map(inpcRecords.map((record) => [inpcPeriodKey(record), record]));
  const exact = periodKey ? recordsByPeriod.get(periodKey) : undefined;
  if (exact || !fallbackToLatest) {
    return exact;
  }

  return [...inpcRecords].sort((left, right) => right.periodDate.localeCompare(left.periodDate))[0];
}

function resolveInpcRecordOnOrBeforePeriod(inpcRecords: ExternalContractInpc[], periodKey?: string | null) {
  const normalizedPeriod = normalizeText(periodKey);
  const sorted = [...inpcRecords].sort((left, right) => left.periodDate.localeCompare(right.periodDate));

  if (!normalizedPeriod) {
    return sorted[0];
  }

  const previous = sorted.filter((record) => inpcPeriodKey(record) <= normalizedPeriod).at(-1);
  return previous ?? sorted[0];
}

function resolveRentUpdateBaseInpc(
  inpcRecords: ExternalContractInpc[],
  renewal: ExternalContractRenewal,
  desiredBasePeriodKey?: string | null,
  requestedBasePeriodKey?: string | null
) {
  if (requestedBasePeriodKey) {
    return resolveInpcPeriodRecord(inpcRecords, requestedBasePeriodKey);
  }

  const renewalTargetInpc = renewal.inpcTargetPeriod
    ? resolveInpcPeriodRecord(inpcRecords, renewal.inpcTargetPeriod)
    : undefined;
  if (renewalTargetInpc) {
    return renewalTargetInpc;
  }

  return resolveInpcPeriodRecord(inpcRecords, desiredBasePeriodKey) ?? resolveInpcRecordOnOrBeforePeriod(inpcRecords, desiredBasePeriodKey);
}

function resolveRentUpdate(
  contract: ExternalContract,
  renewal: ExternalContractRenewal,
  inpcRecords: ExternalContractInpc[],
  baseEffectiveDate: string,
  nextEffectiveDate: string,
  input: RentUpdateFormatInput
) {
  const requestedBasePeriodKey = normalizePeriodInput(input.inpcBasePeriod);
  const requestedTargetPeriodKey = normalizePeriodInput(input.inpcTargetPeriod);
  const desiredBasePeriodKey = dateToInpcPeriodKey(baseEffectiveDate);
  const targetPeriodKey = requestedTargetPeriodKey ?? dateToInpcPeriodKey(nextEffectiveDate);
  const baseInpc = resolveRentUpdateBaseInpc(inpcRecords, renewal, desiredBasePeriodKey, requestedBasePeriodKey);
  const targetInpc = resolveInpcPeriodRecord(inpcRecords, targetPeriodKey, !requestedTargetPeriodKey);
  const previousRent = normalizePositiveNumber(input.previousRentMxn, "La renta anterior") ?? resolveBaseRent(contract, renewal);
  const inpcFactor = baseInpc && targetInpc && baseInpc.value > 0 ? targetInpc.value / baseInpc.value : undefined;
  const updatedRent = previousRent && inpcFactor ? roundMoney(previousRent * inpcFactor) : undefined;
  const increase = previousRent && updatedRent ? roundMoney(updatedRent - previousRent) : undefined;
  const increasePct = inpcFactor
    ? (inpcFactor - 1) * 100
    : previousRent && increase ? (increase / previousRent) * 100 : undefined;
  const roundedRent = input.useRoundedRent
    ? normalizePositiveNumber(input.roundedRentMxn, "La renta redondeada")
    : undefined;
  const presentedRent = roundedRent ?? updatedRent;
  const presentedIncrease = previousRent && presentedRent ? roundMoney(presentedRent - previousRent) : undefined;
  const presentedIncreasePct = previousRent && presentedIncrease ? (presentedIncrease / previousRent) * 100 : increasePct;

  return {
    previousRent,
    updatedRent,
    increase,
    increasePct,
    roundedRent,
    presentedRent,
    presentedIncrease,
    presentedIncreasePct,
    baseInpc,
    targetInpc,
    basePeriodKey: baseInpc ? inpcPeriodKey(baseInpc) : desiredBasePeriodKey,
    targetPeriodKey: targetInpc ? inpcPeriodKey(targetInpc) : targetPeriodKey
  };
}

type PartyGender = "female" | "male";
type LeaseParty = "landlord" | "tenant";

const entityNamePatterns = [
  /\bS\.?\s*A\.?\b/i,
  /\bS\.?\s*C\.?\b/i,
  /\bS\.?\s+DE\s+R\.?\s*L\.?\b/i,
  /\bSOCIEDAD\b/i,
  /\bEMPRESA\b/i,
  /\bINMOBILIARIA\b/i,
  /\bASOCIACI[ÓO]N\b/i,
  /\bCORPORACI[ÓO]N\b/i
];
const maleFirstNames = new Set([
  "alberto",
  "andre",
  "andres",
  "angel",
  "antonio",
  "arturo",
  "carlos",
  "daniel",
  "david",
  "diego",
  "eduardo",
  "enrique",
  "ernesto",
  "fernando",
  "francisco",
  "ghali",
  "gonzalo",
  "guillermo",
  "jesus",
  "jorge",
  "jose",
  "juan",
  "luis",
  "manuel",
  "mario",
  "miguel",
  "oscar",
  "rafael",
  "raul",
  "ricardo",
  "roberto",
  "santiago",
  "sebastian"
]);
const femaleFirstNames = new Set([
  "adriana",
  "alejandra",
  "ana",
  "andrea",
  "carla",
  "carmen",
  "claudia",
  "diana",
  "elena",
  "fernanda",
  "gabriela",
  "isabel",
  "karla",
  "laura",
  "lorena",
  "lucia",
  "maria",
  "mayra",
  "monica",
  "paola",
  "patricia",
  "sofia",
  "susana",
  "veronica"
]);

function normalizeGenderToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-zñ]/g, "");
}

function inferPartyGender(name: string, fallback: PartyGender): PartyGender {
  const normalized = normalizeText(name);
  if (!normalized) {
    return fallback;
  }

  if (entityNamePatterns.some((pattern) => pattern.test(normalized))) {
    return "female";
  }

  const tokens = normalized
    .split(/\s+/)
    .map(normalizeGenderToken)
    .filter((token) => token && !["c", "cc", "dr", "dra", "lic", "sr", "sra"].includes(token));
  const matchedToken = tokens.find((token) => maleFirstNames.has(token) || femaleFirstNames.has(token));

  if (matchedToken && maleFirstNames.has(matchedToken)) {
    return "male";
  }

  if (matchedToken && femaleFirstNames.has(matchedToken)) {
    return "female";
  }

  return fallback;
}

function resolveLeasePartyRole(name: string, party: LeaseParty) {
  const fallbackGender: PartyGender = party === "landlord" ? "female" : "male";
  const gender = inferPartyGender(name, fallbackGender);
  const noun = party === "landlord"
    ? gender === "male" ? "Arrendador" : "Arrendadora"
    : gender === "male" ? "Arrendatario" : "Arrendataria";

  return {
    noun,
    signatureLabel: `${gender === "male" ? "El" : "La"} ${noun}`
  };
}

function createParagraph(
  text: string,
  options: {
    align?: AlignmentValue;
    bold?: boolean;
    size?: number;
    spacingAfter?: number;
    spacingBefore?: number;
  } = {}
) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.BOTH,
    spacing: {
      after: options.spacingAfter ?? 150,
      before: options.spacingBefore ?? 0,
      line: 300
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        size: options.size ?? 22,
        font: "Times New Roman"
      })
    ]
  });
}

function createSignatureCell(name: string, role: string) {
  return new TableCell({
    width: {
      size: SIGNATURE_CELL_WIDTH_DXA,
      type: WidthType.DXA
    },
    borders: {
      top: signatureBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder
    },
    children: [
      createParagraph(name.toUpperCase(), { align: AlignmentType.CENTER, bold: true, spacingBefore: 55, spacingAfter: 40 }),
      createParagraph(role, { align: AlignmentType.CENTER, spacingAfter: 0 })
    ]
  });
}

function createSignatureSpacerCell() {
  return new TableCell({
    width: {
      size: SIGNATURE_SPACER_WIDTH_DXA,
      type: WidthType.DXA
    },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder
    },
    children: [createParagraph("", { spacingAfter: 0 })]
  });
}

function createSignatureTable(landlord: string, landlordRole: string, tenant: string, tenantRole: string) {
  return new Table({
    width: {
      size: SIGNATURE_TABLE_WIDTH_DXA,
      type: WidthType.DXA
    },
    columnWidths: [SIGNATURE_CELL_WIDTH_DXA, SIGNATURE_SPACER_WIDTH_DXA, SIGNATURE_CELL_WIDTH_DXA],
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder
    },
    rows: [
      new TableRow({
        children: [
          createSignatureCell(landlord, landlordRole),
          createSignatureSpacerCell(),
          createSignatureCell(tenant, tenantRole)
        ]
      })
    ]
  });
}

function renderRentUpdatePdf(input: {
  intro: string;
  paragraphs: string[];
  landlord: string;
  landlordRole: string;
  tenant: string;
  tenantRole: string;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "LETTER",
      margins: {
        top: 72,
        right: 72,
        bottom: 72,
        left: 72
      }
    });

    doc.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    doc.font("Times-Bold").fontSize(11).text(input.intro, {
      align: "justify"
    });
    doc.moveDown(1.3);
    doc.font("Times-Roman").fontSize(11);

    input.paragraphs.forEach((paragraph) => {
      doc.text(paragraph, {
        align: "justify"
      });
      doc.moveDown(0.65);
    });

    if (doc.y > 620) {
      doc.addPage();
    }

    doc.moveDown(5.4);
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = (contentWidth - 36) / 2;
    const signatureY = doc.y;
    const leftX = doc.page.margins.left;
    const rightX = leftX + columnWidth + 36;

    doc
      .moveTo(leftX, signatureY)
      .lineTo(leftX + columnWidth, signatureY)
      .moveTo(rightX, signatureY)
      .lineTo(rightX + columnWidth, signatureY)
      .stroke();

    doc.font("Times-Bold").fontSize(10);
    doc.text(input.landlord.toUpperCase(), leftX, signatureY + 12, {
      width: columnWidth,
      align: "center"
    });
    doc.text(input.tenant.toUpperCase(), rightX, signatureY + 12, {
      width: columnWidth,
      align: "center"
    });

    doc.font("Times-Roman").fontSize(10);
    doc.text(input.landlordRole, leftX, signatureY + 28, {
      width: columnWidth,
      align: "center"
    });
    doc.text(input.tenantRole, rightX, signatureY + 28, {
      width: columnWidth,
      align: "center"
    });

    doc.end();
  });
}

function assertBaseTemplateAvailable() {
  if (!existsSync(fileURLToPath(RENT_UPDATE_BASE_TEMPLATE_URL))) {
    throw new AppError(500, "EXTERNAL_CONTRACT_RENT_UPDATE_TEMPLATE_MISSING", "No se encontró el formato base de actualización de renta.");
  }
}

export async function renderRentUpdateFormat(input: RentUpdateFormatInput): Promise<RentUpdateFormatOutput> {
  assertBaseTemplateAvailable();

  const contract = input.contract;
  const renewal = selectRenewal(contract, input.renewalId);
  const documentDate = normalizeDateInput(input.documentDate, currentDateKey(), "La fecha del formato");
  const landlord = textOrFallback(contract.landlordName, "la arrendadora");
  const tenant = textOrFallback(contract.tenantName, "el arrendatario");
  const landlordRole = resolveLeasePartyRole(landlord, "landlord");
  const tenantRole = resolveLeasePartyRole(tenant, "tenant");
  const contractDate = formatLongDate(contract.leaseStartDate);
  const baseEffectiveDateKey = renewal.leaseStartDate || renewal.renewalDate || documentDate;
  const defaultEffectiveDateKey = addYearsDateKey(baseEffectiveDateKey, 1);
  const effectiveDateKey = normalizeDateInput(input.effectiveDate, defaultEffectiveDateKey, "El inicio de nueva renta");
  const effectiveDate = formatLongDate(effectiveDateKey);
  const rentUpdate = resolveRentUpdate(contract, renewal, input.inpcRecords, baseEffectiveDateKey, effectiveDateKey, input);
  const basePeriod = formatInpcPeriod(rentUpdate.basePeriodKey);
  const targetPeriod = formatInpcPeriod(rentUpdate.targetPeriodKey);
  const intro = `ESCRITO DE ACEPTACIÓN DE LA ACTUALIZACIÓN DEL MONTO DE LA RENTA PACTADO EN EL CONTRATO DE ARRENDAMIENTO CELEBRADO EL ${contractDate.toUpperCase()}, POR ${landlord.toUpperCase()}, EN CALIDAD DE ${landlordRole.noun.toUpperCase()}, Y POR LA OTRA ${tenant.toUpperCase()}, EN CALIDAD DE ${tenantRole.noun.toUpperCase()}, DE CONFORMIDAD CON LO SEÑALADO EN DICHO INSTRUMENTO, EN TÉRMINOS DE LO SEÑALADO A CONTINUACIÓN.`;
  const calculationParagraphs = [
    `Monto anterior de la renta: ${formatCurrency(rentUpdate.previousRent)}`,
    `INPC correspondiente a ${basePeriod}: ${formatInpcValue(rentUpdate.baseInpc)}`,
    `INPC correspondiente a ${targetPeriod}: ${formatInpcValue(rentUpdate.targetInpc)}`,
    `Inflación ocurrida entre ${basePeriod} y ${targetPeriod}: ${formatPercent(rentUpdate.increasePct)}`,
    `Aumento calculado con INPC: ${formatCurrency(rentUpdate.increase)}`,
    `Renta anterior más aumento calculado con INPC: ${formatCurrency(rentUpdate.updatedRent)}`,
    ...(rentUpdate.roundedRent
      ? [`Renta redondeada que se presenta al arrendatario: ${formatCurrency(rentUpdate.roundedRent)}`]
      : []),
    `Fecha a partir de la que surtirá efectos el nuevo monto de la renta: ${effectiveDate}.`,
    "Lo anterior no modifica en ninguna de sus partes el contrato de arrendamiento arriba señalado."
  ];

  const children: Array<Paragraph | Table> = [
    createParagraph(intro, {
      align: AlignmentType.BOTH,
      bold: true,
      spacingAfter: 300
    }),
    ...calculationParagraphs.map((paragraph, index) => createParagraph(paragraph, {
      spacingAfter: index === calculationParagraphs.length - 1 ? 980 : undefined
    })),
    createSignatureTable(landlord, landlordRole.signatureLabel, tenant, tenantRole.signatureLabel)
  ];

  const doc = new DocxDocument({
    title: `${RENT_UPDATE_TEMPLATE_TITLE} - ${contract.contractNumber}`,
    creator: "SIGE",
    description: "Documento generado con base en el formato de actualización de renta del módulo de contratos externos.",
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11)
            },
            margin: {
              top: convertInchesToTwip(0.85),
              right: convertInchesToTwip(0.85),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.85)
            }
          }
        },
        children
      }
    ]
  });

  const [wordBuffer, pdfBuffer] = await Promise.all([
    Packer.toBuffer(doc),
    renderRentUpdatePdf({
      intro,
      paragraphs: calculationParagraphs,
      landlord,
      landlordRole: landlordRole.signatureLabel,
      tenant,
      tenantRole: tenantRole.signatureLabel
    })
  ]);

  return {
    word: {
      buffer: Buffer.from(wordBuffer),
      filename: buildRentUpdateFilename(contract, documentDate, "docx"),
      contentType: DOCX_MIME_TYPE
    },
    pdf: {
      buffer: Buffer.from(pdfBuffer),
      filename: buildRentUpdateFilename(contract, documentDate, "pdf"),
      contentType: PDF_MIME_TYPE
    },
    renewalId: renewal.id,
    documentDate,
    effectiveDate: effectiveDateKey,
    monthlyRentMxn: rentUpdate.presentedRent,
    rentIncreasePct: rentUpdate.presentedIncreasePct,
    inpcBasePeriod: rentUpdate.basePeriodKey,
    inpcTargetPeriod: rentUpdate.targetPeriodKey,
    templateId: RENT_UPDATE_TEMPLATE_ID,
    templateTitle: RENT_UPDATE_TEMPLATE_TITLE
  };
}
