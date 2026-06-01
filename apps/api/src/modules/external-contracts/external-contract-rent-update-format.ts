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

import { AppError } from "../../core/errors/app-error";

export const RENT_UPDATE_TEMPLATE_ID = "rent-increase";
export const RENT_UPDATE_TEMPLATE_TITLE = "Formato de aumento de renta";
export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

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

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];

export interface RentUpdateFormatInput {
  contract: ExternalContract;
  renewalId?: string | null;
  documentDate?: string | null;
  inpcRecords: ExternalContractInpc[];
}

export interface RentUpdateFormatOutput {
  buffer: Buffer;
  filename: string;
  contentType: string;
  renewalId?: string;
  templateId: string;
  templateTitle: string;
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
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

function hasRentUpdateDownloadName(value?: string | null) {
  return /^Actualización de renta \(.+\) \(\d{2}\.\d{2}\.\d{4}\)\.[a-z0-9]+$/iu.test(normalizeText(value));
}

export function resolveRentUpdateDownloadFilename(input: {
  clientName?: string | null;
  documentDate?: string | null;
  fileMimeType?: string | null;
  originalFileName?: string | null;
}) {
  if (hasRentUpdateDownloadName(input.originalFileName)) {
    return normalizeText(input.originalFileName);
  }

  const clientName = sanitizeHumanFilenamePart(input.clientName, "Cliente sin nombre");
  const extension = inferFileExtension(input.fileMimeType, input.originalFileName);
  const cleanExtension = extension.replace(/^\.+/, "") || "docx";
  const dateLabel = formatFilenameDate(input.documentDate);

  return `Actualización de renta (${clientName}) (${dateLabel}).${cleanExtension}`;
}

function buildRentUpdateFilename(contract: ExternalContract, documentDate: string, extension: string) {
  const clientName = sanitizeHumanFilenamePart(contract.clientName, "Cliente sin nombre");
  const dateLabel = formatFilenameDate(documentDate);
  const cleanExtension = extension.replace(/^\.+/, "") || "docx";

  return `Actualización de renta (${clientName}) (${dateLabel}).${cleanExtension}`;
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
    return "periodo pendiente";
  }

  const monthIndex = Number(match[2]) - 1;
  return `${MONTHS_ES[monthIndex] ?? match[2]} de ${match[1]}`;
}

function inpcPeriodKey(record: ExternalContractInpc) {
  return `${record.periodYear}-${String(record.periodMonth).padStart(2, "0")}`;
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

function resolvePreviousRent(contract: ExternalContract, renewal: ExternalContractRenewal) {
  const previousRenewal = contract.renewals.find((entry) => entry.sequence === renewal.sequence - 1);
  return previousRenewal?.monthlyRentMxn ?? contract.monthlyRentMxn;
}

function resolveRentUpdate(contract: ExternalContract, renewal: ExternalContractRenewal, inpcRecords: ExternalContractInpc[]) {
  const recordsByPeriod = new Map(inpcRecords.map((record) => [inpcPeriodKey(record), record]));
  const baseInpc = renewal.inpcBasePeriod ? recordsByPeriod.get(renewal.inpcBasePeriod) : undefined;
  const targetInpc = renewal.inpcTargetPeriod ? recordsByPeriod.get(renewal.inpcTargetPeriod) : undefined;
  const previousRent = resolvePreviousRent(contract, renewal);
  const inpcFactor = baseInpc && targetInpc && baseInpc.value > 0 ? targetInpc.value / baseInpc.value : undefined;
  const updatedRent = renewal.monthlyRentMxn
    ?? (previousRent && inpcFactor ? roundMoney(previousRent * inpcFactor) : undefined);
  const increase = previousRent && updatedRent ? roundMoney(updatedRent - previousRent) : undefined;
  const increasePct = inpcFactor
    ? (inpcFactor - 1) * 100
    : renewal.rentIncreasePct
      ?? (previousRent && increase ? (increase / previousRent) * 100 : undefined);

  return {
    previousRent,
    updatedRent,
    increase,
    increasePct,
    baseInpc,
    targetInpc
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
      size: 50,
      type: WidthType.PERCENTAGE
    },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder
    },
    children: [
      createParagraph("______________________________", { align: AlignmentType.CENTER, spacingAfter: 70 }),
      createParagraph(name.toUpperCase(), { align: AlignmentType.CENTER, bold: true, spacingAfter: 60 }),
      createParagraph(role, { align: AlignmentType.CENTER, spacingAfter: 0 })
    ]
  });
}

function createSignatureTable(landlord: string, tenant: string) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
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
          createSignatureCell(landlord, "La Arrendadora"),
          createSignatureCell(tenant, "El Arrendatario")
        ]
      })
    ]
  });
}

function assertBaseTemplateAvailable() {
  if (!existsSync(fileURLToPath(RENT_UPDATE_BASE_TEMPLATE_URL))) {
    throw new AppError(500, "EXTERNAL_CONTRACT_RENT_UPDATE_TEMPLATE_MISSING", "No se encontro el formato base de actualizacion de renta.");
  }
}

export async function renderRentUpdateFormat(input: RentUpdateFormatInput): Promise<RentUpdateFormatOutput> {
  assertBaseTemplateAvailable();

  const contract = input.contract;
  const renewal = selectRenewal(contract, input.renewalId);
  const documentDate = normalizeText(input.documentDate) || currentDateKey();
  const landlord = textOrFallback(contract.landlordName, "la arrendadora");
  const tenant = textOrFallback(contract.tenantName, "el arrendatario");
  const contractDate = formatLongDate(contract.leaseStartDate);
  const effectiveDate = formatLongDate(renewal.leaseStartDate || renewal.renewalDate || documentDate);
  const rentUpdate = resolveRentUpdate(contract, renewal, input.inpcRecords);
  const basePeriod = formatInpcPeriod(renewal.inpcBasePeriod);
  const targetPeriod = formatInpcPeriod(renewal.inpcTargetPeriod);

  const children: Array<Paragraph | Table> = [
    createParagraph(
      `ESCRITO DE ACEPTACION DE LA ACTUALIZACION DEL MONTO DE LA RENTA PACTADO EN EL CONTRATO DE ARRENDAMIENTO CELEBRADO EL ${contractDate.toUpperCase()}, POR ${landlord.toUpperCase()}, EN CALIDAD DE ARRENDADORA, Y POR LA OTRA ${tenant.toUpperCase()}, EN CALIDAD DE ARRENDATARIO, DE CONFORMIDAD CON LO SENALADO EN DICHO INSTRUMENTO, EN TERMINOS DE LO SENALADO A CONTINUACION.`,
      {
        align: AlignmentType.CENTER,
        bold: true,
        spacingAfter: 300
      }
    ),
    createParagraph(`Monto anterior de la renta: ${formatCurrency(rentUpdate.previousRent)}`),
    createParagraph(`INPC correspondiente a ${basePeriod}: ${formatInpcValue(rentUpdate.baseInpc)}`),
    createParagraph(`INPC correspondiente a ${targetPeriod}: ${formatInpcValue(rentUpdate.targetInpc)}`),
    createParagraph(`Inflacion ocurrida entre ${basePeriod} y ${targetPeriod}: ${formatPercent(rentUpdate.increasePct)}`),
    createParagraph(`Aumento: ${formatCurrency(rentUpdate.increase)}`),
    createParagraph(`Renta anterior mas aumento: ${formatCurrency(rentUpdate.updatedRent)}`),
    createParagraph(`Fecha a partir de la que surtira efectos el nuevo monto de la renta: ${effectiveDate}.`),
    createParagraph("Lo anterior no modifica en ninguna de sus partes el contrato de arrendamiento arriba senalado.", {
      spacingAfter: 520
    }),
    createSignatureTable(landlord, tenant)
  ];

  const doc = new DocxDocument({
    title: `${RENT_UPDATE_TEMPLATE_TITLE} - ${contract.contractNumber}`,
    creator: "SIGE",
    description: "Documento generado con base en el formato de actualizacion de renta del modulo de contratos externos.",
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

  const buffer = await Packer.toBuffer(doc);
  const filename = buildRentUpdateFilename(contract, documentDate, "docx");

  return {
    buffer: Buffer.from(buffer),
    filename,
    contentType: DOCX_MIME_TYPE,
    renewalId: renewal.id,
    templateId: RENT_UPDATE_TEMPLATE_ID,
    templateTitle: RENT_UPDATE_TEMPLATE_TITLE
  };
}
