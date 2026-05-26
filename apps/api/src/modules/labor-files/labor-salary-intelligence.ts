import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

import JSZip from "jszip";

const LABOR_SALARY_DOCUMENT_TYPES = new Set(["EMPLOYMENT_CONTRACT", "ADDENDUM"]);
const PDF_MIME_TYPE = "application/pdf";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type LaborSalaryPeriod = "DAILY" | "MONTHLY";

export interface LaborSalaryDocumentInput {
  id: string;
  documentType: string;
  originalFileName: string;
  fileMimeType?: string | null;
  uploadedAt: Date | string;
  fileContent?: Buffer | Uint8Array | null;
}

export interface LaborSalaryCandidate {
  documentId?: string;
  documentType?: string;
  originalFileName?: string;
  uploadedAt?: Date | string;
  period: LaborSalaryPeriod;
  amountMxn: number;
  dailySalaryMxn: number;
  monthlyGrossSalaryMxn?: number;
  position: number;
  sourceText: string;
}

export interface LaborSalaryExtraction {
  documentId: string;
  documentType: string;
  originalFileName: string;
  uploadedAt: Date | string;
  period: LaborSalaryPeriod;
  amountMxn: number;
  dailySalaryMxn: number;
  monthlyGrossSalaryMxn?: number;
  sourceText: string;
}

export interface LaborDailySalaryRiStatus {
  verified: boolean;
  detail: string;
  contractDailySalaryMxn?: number;
  contractMonthlyGrossSalaryMxn?: number;
}

export interface LaborDailySalaryRiInput {
  dailySalaryMxn: { toString(): string } | number | string | null;
  documents?: LaborSalaryDocumentInput[];
}

function normalizeComparableText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDocumentText(value: string) {
  return normalizeComparableText(value)
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function inferMimeType(document: Pick<LaborSalaryDocumentInput, "fileMimeType" | "originalFileName">) {
  const configuredMimeType = normalizeComparableText(document.fileMimeType ?? "");
  const filename = normalizeComparableText(document.originalFileName);

  if (configuredMimeType) {
    return configuredMimeType;
  }

  if (filename.endsWith(".pdf")) {
    return PDF_MIME_TYPE;
  }

  if (filename.endsWith(".docx")) {
    return DOCX_MIME_TYPE;
  }

  return "";
}

export function isLaborSalaryDocumentType(documentType: string) {
  return LABOR_SALARY_DOCUMENT_TYPES.has(documentType);
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}

async function extractDocxText(content: Buffer) {
  const zip = await JSZip.loadAsync(content);
  const textParts: string[] = [];
  const xmlFiles = Object.keys(zip.files).filter((name) =>
    /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(name)
  );

  for (const fileName of xmlFiles) {
    const xml = await zip.files[fileName]?.async("string");
    if (!xml) {
      continue;
    }

    textParts.push(
      decodeXmlEntities(
        xml
          .replace(/<w:tab\b[^>]*\/>/gi, " ")
          .replace(/<w:br\b[^>]*\/>/gi, "\n")
          .replace(/<\/w:p>/gi, "\n")
          .replace(/<[^>]+>/g, "")
      )
    );
  }

  return textParts.join("\n");
}

function decodePdfLiteralString(value: string) {
  let decoded = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character !== "\\") {
      decoded += character;
      continue;
    }

    const next = value[index + 1];
    if (!next) {
      continue;
    }

    if (next === "n") {
      decoded += "\n";
      index += 1;
    } else if (next === "r") {
      decoded += "\r";
      index += 1;
    } else if (next === "t") {
      decoded += "\t";
      index += 1;
    } else if (next === "b" || next === "f") {
      index += 1;
    } else if (next === "\\" || next === "(" || next === ")") {
      decoded += next;
      index += 1;
    } else if (/[0-7]/.test(next)) {
      const octal = value.slice(index + 1).match(/^[0-7]{1,3}/)?.[0] ?? "";
      decoded += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
    } else {
      decoded += next;
      index += 1;
    }
  }

  return decoded;
}

function decodePdfHexString(value: string) {
  const hex = value.replace(/\s+/g, "");
  if (!hex) {
    return "";
  }

  const normalizedHex = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = Buffer.from(normalizedHex, "hex");
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let decoded = "";
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      decoded += String.fromCharCode(bytes.readUInt16BE(index));
    }
    return decoded;
  }

  return bytes.toString("latin1");
}

function extractPdfStrings(streamText: string) {
  const parts: string[] = [];
  let index = 0;

  while (index < streamText.length) {
    const character = streamText[index];
    if (character === "(") {
      let depth = 1;
      let cursor = index + 1;
      let raw = "";

      while (cursor < streamText.length && depth > 0) {
        const current = streamText[cursor];
        if (current === "\\") {
          raw += current;
          if (cursor + 1 < streamText.length) {
            raw += streamText[cursor + 1];
          }
          cursor += 2;
          continue;
        }

        if (current === "(") {
          depth += 1;
        } else if (current === ")") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }

        if (depth > 0) {
          raw += current;
        }
        cursor += 1;
      }

      const decoded = decodePdfLiteralString(raw).trim();
      if (decoded) {
        parts.push(decoded);
      }
      index = cursor;
      continue;
    }

    if (character === "<" && streamText[index + 1] !== "<") {
      const end = streamText.indexOf(">", index + 1);
      if (end > index) {
        const decoded = decodePdfHexString(streamText.slice(index + 1, end)).trim();
        if (decoded) {
          parts.push(decoded);
        }
        index = end + 1;
        continue;
      }
    }

    index += 1;
  }

  return parts.join(" ");
}

function extractPdfText(content: Buffer) {
  const binary = content.toString("latin1");
  const textParts: string[] = [];
  const streamPattern = /(<<[\s\S]{0,4000}?>>)\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/g;

  for (const match of binary.matchAll(streamPattern)) {
    const dictionary = match[1] ?? "";
    const streamContent = match[2] ?? "";
    let streamBuffer = Buffer.from(streamContent, "latin1");

    if (dictionary.includes("/FlateDecode")) {
      try {
        streamBuffer = inflateSync(streamBuffer);
      } catch {
        continue;
      }
    }

    const streamText = streamBuffer.toString("latin1");
    if (!streamText.includes("BT") && !streamText.includes("Tj") && !streamText.includes("TJ")) {
      continue;
    }

    const extracted = extractPdfStrings(streamText);
    if (extracted) {
      textParts.push(extracted);
    }
  }

  const fallback = extractPdfStrings(binary);
  if (fallback) {
    textParts.push(fallback);
  }

  return textParts.join("\n");
}

async function extractDocumentText(document: LaborSalaryDocumentInput) {
  if (!document.fileContent) {
    return "";
  }

  const content = Buffer.from(document.fileContent);
  const mimeType = inferMimeType(document);

  if (mimeType === DOCX_MIME_TYPE) {
    return extractDocxText(content);
  }

  if (mimeType === PDF_MIME_TYPE) {
    return extractPdfText(content);
  }

  return content.toString("utf8");
}

function parseMoneyAmount(rawValue: string) {
  let value = rawValue
    .toLowerCase()
    .replace(/\bmxn\b/g, "")
    .replace(/m\.?\s*n\.?/g, "")
    .replace(/pesos?/g, "")
    .replace(/\$/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d.,-]/g, "");

  if (!value) {
    return undefined;
  }

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    value = lastComma > lastDot
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  } else if (lastComma >= 0) {
    value = /,\d{1,2}$/.test(value) ? value.replace(",", ".") : value.replace(/,/g, "");
  } else if (lastDot >= 0 && /\.\d{3}(?:\D|$)/.test(value) && !/\.\d{1,2}$/.test(value)) {
    value = value.replace(/\./g, "");
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function hasMoneySignal(rawValue: string, contextBefore: string, amount: number) {
  if (/[$]|mxn|m\.?\s*n\.?|pesos?/i.test(rawValue)) {
    return true;
  }

  if (/(?:cantidad|monto|importe)\s+de\s*$/i.test(contextBefore.slice(-40))) {
    return true;
  }

  return amount >= 1000 && /(?:salario|sueldo)\s+(?:bruto\s+)?mensual\s+(?:sera(?:\s+de)?|es(?:\s+de)?|asciende\s+a|queda\s+en|por)\s*$/i.test(contextBefore.slice(-80));
}

function getCandidatePeriod(context: string, contextBefore: string): LaborSalaryPeriod | null {
  if (!/(salario|sueldo|remuneracion|retribucion|percepcion)/.test(context)) {
    return null;
  }

  if (/(bono|asistencia|puntualidad|aguinaldo|prima|vacacion|vacaciones|fondo|ahorro|imss|isr|retencion|deduccion|comision|vales)/.test(contextBefore)) {
    return null;
  }

  if (/(quincenal|quincenales|catorcenal|semanal|semanales|dos pagos|dia 10|dias 10|veinticinco)/.test(contextBefore)) {
    return null;
  }

  if (/(mensual|mensuales|al mes|por mes|cada mes)/.test(context)) {
    return "MONTHLY";
  }

  if (/(diario|diaria|por dia|cada dia|salario base diario)/.test(context)) {
    return "DAILY";
  }

  return null;
}

function buildSourceText(text: string, index: number) {
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export function extractLaborSalaryCandidatesFromText(text: string) {
  const normalizedText = normalizeDocumentText(text);
  const candidates: LaborSalaryCandidate[] = [];
  const amountPattern = /(?:\$|mxn\s*)?\s*\d{1,3}(?:[,\s.]\d{3})*(?:[,.]\d{1,2})?(?:\s*(?:m\.?\s*n\.?|mxn|pesos?))?|(?:\$|mxn\s*)?\s*\d+(?:[,.]\d{1,2})?(?:\s*(?:m\.?\s*n\.?|mxn|pesos?))?/gi;

  for (const match of normalizedText.matchAll(amountPattern)) {
    const rawValue = match[0];
    const index = match.index ?? 0;
    const amountMxn = parseMoneyAmount(rawValue);
    if (amountMxn === undefined) {
      continue;
    }

    const contextStart = Math.max(0, index - 120);
    const contextEnd = Math.min(normalizedText.length, index + rawValue.length + 120);
    const context = normalizedText.slice(contextStart, contextEnd);
    const contextBefore = normalizedText.slice(contextStart, index);
    if (!hasMoneySignal(rawValue, contextBefore, amountMxn)) {
      continue;
    }

    const period = getCandidatePeriod(context, contextBefore);
    if (!period) {
      continue;
    }

    if ((period === "MONTHLY" && amountMxn < 1000) || (period === "DAILY" && amountMxn < 50)) {
      continue;
    }

    candidates.push({
      period,
      amountMxn,
      dailySalaryMxn: period === "MONTHLY" ? amountMxn / 30 : amountMxn,
      monthlyGrossSalaryMxn: period === "MONTHLY" ? amountMxn : undefined,
      position: index,
      sourceText: buildSourceText(normalizedText, index)
    });
  }

  return candidates;
}

export function extractLatestLaborSalaryFromText(text: string) {
  const candidates = extractLaborSalaryCandidatesFromText(text);
  const monthlyCandidates = candidates.filter((candidate) => candidate.period === "MONTHLY");
  return (monthlyCandidates.length > 0 ? monthlyCandidates : candidates).at(-1) ?? null;
}

export async function extractLaborSalaryFromDocument(
  document: LaborSalaryDocumentInput
): Promise<LaborSalaryExtraction | null> {
  if (!isLaborSalaryDocumentType(document.documentType)) {
    return null;
  }

  const text = await extractDocumentText(document);
  const candidate = extractLatestLaborSalaryFromText(text);
  if (!candidate) {
    return null;
  }

  return {
    documentId: document.id,
    documentType: document.documentType,
    originalFileName: document.originalFileName,
    uploadedAt: document.uploadedAt,
    period: candidate.period,
    amountMxn: candidate.amountMxn,
    dailySalaryMxn: candidate.dailySalaryMxn,
    monthlyGrossSalaryMxn: candidate.monthlyGrossSalaryMxn,
    sourceText: candidate.sourceText
  } satisfies LaborSalaryExtraction;
}

function getDocumentSortKey(document: Pick<LaborSalaryDocumentInput, "documentType" | "uploadedAt">) {
  const uploadedAt = typeof document.uploadedAt === "string"
    ? new Date(document.uploadedAt).getTime()
    : document.uploadedAt.getTime();
  const typeOrder = document.documentType === "ADDENDUM" ? 1 : 0;
  return [Number.isFinite(uploadedAt) ? uploadedAt : 0, typeOrder] as const;
}

export async function extractLatestLaborSalaryFromDocuments(documents: LaborSalaryDocumentInput[] = []) {
  const salaryDocuments = documents
    .filter((document) => isLaborSalaryDocumentType(document.documentType))
    .sort((left, right) => {
      const leftKey = getDocumentSortKey(left);
      const rightKey = getDocumentSortKey(right);
      return leftKey[0] - rightKey[0] || leftKey[1] - rightKey[1];
    });

  const extractions = (await Promise.all(salaryDocuments.map(extractLaborSalaryFromDocument)))
    .filter((extraction): extraction is LaborSalaryExtraction => Boolean(extraction));

  return extractions.at(-1) ?? null;
}

export async function getLaborDailySalaryRiStatus(laborFile?: LaborDailySalaryRiInput | null): Promise<LaborDailySalaryRiStatus> {
  if (!laborFile) {
    return {
      verified: false,
      detail: "Sin expediente laboral vinculado."
    };
  }

  const dailySalaryMxn = Number(laborFile.dailySalaryMxn ?? 0);
  if (!dailySalaryMxn) {
    return {
      verified: false,
      detail: "Falta salario diario en Expedientes Laborales."
    };
  }

  const documents = laborFile.documents ?? [];
  const hasEmploymentContract = documents.some((document) => document.documentType === "EMPLOYMENT_CONTRACT");
  if (!hasEmploymentContract) {
    return {
      verified: false,
      detail: "Expedientes Laborales no tiene contrato laboral cargado."
    };
  }

  const extraction = await extractLatestLaborSalaryFromDocuments(documents);
  if (!extraction) {
    return {
      verified: false,
      detail: "Contrato/addenda cargados sin salario mensual legible."
    };
  }

  const matches = Math.abs(dailySalaryMxn - extraction.dailySalaryMxn) <= 0.05;
  const sourceLabel = extraction.documentType === "ADDENDUM" ? "addendum" : "contrato";
  const salaryDetail = extraction.monthlyGrossSalaryMxn
    ? `${formatMoney(extraction.dailySalaryMxn)} diario calculado de ${formatMoney(extraction.monthlyGrossSalaryMxn)} mensual / 30`
    : `${formatMoney(extraction.dailySalaryMxn)} diario`;

  return {
    verified: matches,
    detail: matches
      ? `Coincide con el ${sourceLabel} vigente (${salaryDetail}).`
      : `Contrato/addenda vigente: ${salaryDetail}.`,
    contractDailySalaryMxn: extraction.dailySalaryMxn,
    contractMonthlyGrossSalaryMxn: extraction.monthlyGrossSalaryMxn
  };
}
