import { Buffer } from "node:buffer";
import { inflateSync } from "node:zlib";

import JSZip from "jszip";

const LABOR_SALARY_DOCUMENT_TYPES = new Set(["EMPLOYMENT_CONTRACT", "ADDENDUM"]);
const PDF_MIME_TYPE = "application/pdf";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PDF_SCAN_BYTES = 2 * 1024 * 1024;
const MAX_PDF_FALLBACK_BYTES = 256 * 1024;
const MAX_PDF_STRING_CHARS = 32 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 80 * 1024;
export const LABOR_SALARY_EXTRACTION_DETAIL_VERSION = "RI-003 v0.3";

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
    .replace(/(\d)[’'´`](\d{1,2})(?=\s*(?:m\.?\s*n\.?|mxn|pesos?|\())/g, "$1.$2")
    .replace(/(\d)\s+(\d{2})\s*\.\s*(\d{2})(?=\s*(?:m\.?\s*n\.?|mxn|pesos?|\())/g, "$1$2.$3")
    .replace(/(\d)'(\d{1,2})/g, "$1.$2")
    .replace(/\s+/g, " ")
    .trim();
}

const LOOSE_PDF_WORDS = [
  "salario",
  "sueldo",
  "mensual",
  "bruto",
  "diario",
  "ordinario",
  "vigente",
  "trabajador",
  "cantidad",
  "equivale",
  "constar",
  "dividir"
];

function normalizeLoosePdfWords(value: string) {
  return LOOSE_PDF_WORDS.reduce((text, word) => {
    const loosePattern = new RegExp(word.split("").join("\\s*"), "g");
    return text.replace(loosePattern, word);
  }, value);
}

function normalizeDocumentText(value: string) {
  return normalizeLoosePdfWords(normalizeComparableText(value))
    .replace(/\u0000/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\$\s*(\d+(?:\s*,\s*\d{3})*)\s*\.\s*(\d)\s+(\d)/g, "$$$1.$2$3")
    .replace(/\$\s+/g, "$")
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

function looksLikeUtf16Be(bytes: Buffer) {
  if (bytes.length < 4 || bytes.length % 2 !== 0) {
    return false;
  }

  let asciiPairs = 0;
  const pairs = bytes.length / 2;
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const high = bytes[index];
    const low = bytes[index + 1];
    if (high === 0 && low >= 0x20 && low <= 0x7e) {
      asciiPairs += 1;
    }
  }

  return asciiPairs / pairs >= 0.6;
}

function looksLikeUtf16Le(bytes: Buffer) {
  if (bytes.length < 4 || bytes.length % 2 !== 0) {
    return false;
  }

  let asciiPairs = 0;
  const pairs = bytes.length / 2;
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const low = bytes[index];
    const high = bytes[index + 1];
    if (high === 0 && low >= 0x20 && low <= 0x7e) {
      asciiPairs += 1;
    }
  }

  return asciiPairs / pairs >= 0.6;
}

function decodeUtf16Be(bytes: Buffer, start = 0) {
  let decoded = "";
  for (let index = start; index + 1 < bytes.length; index += 2) {
    decoded += String.fromCharCode(bytes.readUInt16BE(index));
  }
  return decoded;
}

function decodePdfTextBytes(bytes: Buffer) {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes, 2);
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return bytes.subarray(2).toString("utf16le");
  }

  if (looksLikeUtf16Be(bytes)) {
    return decodeUtf16Be(bytes);
  }

  if (looksLikeUtf16Le(bytes)) {
    return bytes.toString("utf16le");
  }

  return bytes.toString("latin1");
}

function decodePdfByteString(value: string) {
  if (!value) {
    return "";
  }

  const bytes = Buffer.from(Array.from(value, (character) => character.charCodeAt(0) & 0xff));
  return decodePdfTextBytes(bytes);
}

function decodePdfHexString(value: string) {
  const hex = value.replace(/\s+/g, "");
  if (!hex) {
    return "";
  }

  const normalizedHex = hex.length % 2 === 0 ? hex : `${hex}0`;
  const bytes = Buffer.from(normalizedHex, "hex");
  return decodePdfTextBytes(bytes);
}

function decodePdfObjectStream(pdfText: string, objectNumber: string) {
  const objectPattern = new RegExp(`${objectNumber}\\s+0\\s+obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n?([\\s\\S]*?)\\r?\\n?endstream`);
  const match = pdfText.match(objectPattern);
  if (!match) {
    return "";
  }

  const dictionary = match[1] ?? "";
  let streamBuffer = Buffer.from(match[2] ?? "", "latin1");
  if (dictionary.includes("/FlateDecode")) {
    try {
      streamBuffer = inflateSync(streamBuffer);
    } catch {
      return "";
    }
  }

  return streamBuffer.toString("latin1");
}

function parseHexNumber(value: string) {
  return Number.parseInt(value, 16);
}

function incrementHexValue(value: string, offset: number) {
  if (!value) {
    return "";
  }

  return (parseHexNumber(value) + offset).toString(16).toUpperCase().padStart(value.length, "0");
}

function decodePdfUnicodeHex(value: string) {
  const normalizedHex = value.length % 2 === 0 ? value : `${value}0`;
  return decodePdfTextBytes(Buffer.from(normalizedHex, "hex"));
}

function parsePdfToUnicodeCMap(cmapText: string) {
  const cmap = new Map<string, string>();
  const normalized = cmapText.replace(/\r/g, "");

  for (const blockMatch of normalized.matchAll(/beginbfchar\s*([\s\S]*?)\s*endbfchar/g)) {
    const block = blockMatch[1] ?? "";
    for (const lineMatch of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      cmap.set(lineMatch[1].toUpperCase(), decodePdfUnicodeHex(lineMatch[2]));
    }
  }

  for (const blockMatch of normalized.matchAll(/beginbfrange\s*([\s\S]*?)\s*endbfrange/g)) {
    const block = blockMatch[1] ?? "";
    for (const lineMatch of block.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([^\]]+)\])/gi)) {
      const start = lineMatch[1].toUpperCase();
      const end = lineMatch[2].toUpperCase();
      const startValue = parseHexNumber(start);
      const endValue = parseHexNumber(end);
      const arrayDestinations = lineMatch[5]?.match(/<([0-9a-f]+)>/gi)?.map((entry) => entry.replace(/[<>]/g, "")) ?? [];

      for (let codeValue = startValue; codeValue <= endValue; codeValue += 1) {
        const offset = codeValue - startValue;
        const source = codeValue.toString(16).toUpperCase().padStart(start.length, "0");
        const destination = arrayDestinations[offset] ?? incrementHexValue(lineMatch[4] ?? "", offset);
        if (destination) {
          cmap.set(source, decodePdfUnicodeHex(destination));
        }
      }
    }
  }

  return cmap;
}

function buildPdfToUnicodeCMap(pdfText: string) {
  const combinedMap = new Map<string, string>();
  const references = Array.from(pdfText.matchAll(/\/ToUnicode\s+(\d+)\s+\d+\s+R/g), (match) => match[1]);

  for (const objectNumber of references) {
    const cmapText = decodePdfObjectStream(pdfText, objectNumber);
    if (!cmapText) {
      continue;
    }

    for (const [source, destination] of parsePdfToUnicodeCMap(cmapText)) {
      combinedMap.set(source, destination);
    }
  }

  return combinedMap;
}

function decodePdfHexStringWithCMap(value: string, cmap: Map<string, string>) {
  const hex = value.replace(/\s+/g, "").toUpperCase();
  if (!hex || cmap.size === 0) {
    return decodePdfHexString(value);
  }

  const codeLengths = Array.from(new Set(Array.from(cmap.keys(), (key) => key.length))).sort((left, right) => right - left);
  let decoded = "";
  let cursor = 0;

  while (cursor < hex.length) {
    const codeLength = codeLengths.find((length) => cmap.has(hex.slice(cursor, cursor + length)));
    if (codeLength) {
      decoded += cmap.get(hex.slice(cursor, cursor + codeLength)) ?? "";
      cursor += codeLength;
      continue;
    }

    const fallbackLength = codeLengths.at(-1) ?? 2;
    decoded += decodePdfHexString(hex.slice(cursor, cursor + fallbackLength));
    cursor += fallbackLength;
  }

  return decoded;
}

function extractPdfStrings(streamText: string, cmap = new Map<string, string>()) {
  const parts: string[] = [];
  let index = 0;
  let extractedLength = 0;

  while (index < streamText.length) {
    if (extractedLength >= MAX_EXTRACTED_TEXT_CHARS) {
      break;
    }

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
          if (raw.length < MAX_PDF_STRING_CHARS) {
            raw += current;
          }
        }
        cursor += 1;
      }

      const decoded = decodePdfByteString(decodePdfLiteralString(raw)).trim();
      if (decoded) {
        parts.push(decoded);
        extractedLength += decoded.length;
      }
      index = cursor;
      continue;
    }

    if (character === "<" && streamText[index + 1] !== "<") {
      const end = streamText.indexOf(">", index + 1);
      if (end > index) {
        const decoded = decodePdfHexStringWithCMap(streamText.slice(index + 1, end), cmap).trim();
        if (decoded) {
          parts.push(decoded);
          extractedLength += decoded.length;
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
  const binary = content.subarray(0, MAX_PDF_SCAN_BYTES).toString("latin1");
  const textParts: string[] = [];
  const cmap = buildPdfToUnicodeCMap(binary);
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

    const extracted = extractPdfStrings(streamText, cmap);
    if (extracted) {
      textParts.push(extracted);
    }
  }

  if (content.byteLength <= MAX_PDF_FALLBACK_BYTES) {
    const fallback = extractPdfStrings(binary, cmap);
    if (fallback) {
      textParts.push(fallback);
    }
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

function getLastPatternIndex(value: string, patterns: RegExp[]) {
  let lastIndex = -1;

  for (const pattern of patterns) {
    const source = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of value.matchAll(source)) {
      lastIndex = Math.max(lastIndex, match.index ?? -1);
    }
  }

  return lastIndex;
}

function getFirstPatternIndex(value: string, patterns: RegExp[]) {
  let firstIndex = Number.POSITIVE_INFINITY;

  for (const pattern of patterns) {
    const source = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of value.matchAll(source)) {
      firstIndex = Math.min(firstIndex, match.index ?? Number.POSITIVE_INFINITY);
      break;
    }
  }

  return Number.isFinite(firstIndex) ? firstIndex : -1;
}

const DAILY_SALARY_CONTEXT_PATTERNS = [
  /salario\s+diari[oa]/g,
  /salario\s+base\s+diari[oa]/g,
  /diari[oa]\s+ordinari[oa]/g,
  /\bdiari[oa]\b/g,
  /por\s+dia/g,
  /cada\s+dia/g
];

const MONTHLY_SALARY_CONTEXT_PATTERNS = [
  /salario\s+mensual/g,
  /salario\s+bruto\s+mensual/g,
  /mensual\s+brut[oa]/g,
  /\bmensual(?:es)?\b/g,
  /al\s+mes/g,
  /por\s+mes/g,
  /cada\s+mes/g
];

function getNearestCandidatePeriod(contextBefore: string, contextAfter: string): LaborSalaryPeriod | null {
  const beforeWindow = contextBefore.slice(-160);
  const dailyBeforeIndex = getLastPatternIndex(beforeWindow, DAILY_SALARY_CONTEXT_PATTERNS);
  const monthlyBeforeIndex = getLastPatternIndex(beforeWindow, MONTHLY_SALARY_CONTEXT_PATTERNS);

  if (dailyBeforeIndex >= 0 || monthlyBeforeIndex >= 0) {
    return dailyBeforeIndex >= monthlyBeforeIndex ? "DAILY" : "MONTHLY";
  }

  const afterWindow = contextAfter.slice(0, 80);
  const dailyAfterIndex = getFirstPatternIndex(afterWindow, DAILY_SALARY_CONTEXT_PATTERNS);
  const monthlyAfterIndex = getFirstPatternIndex(afterWindow, MONTHLY_SALARY_CONTEXT_PATTERNS);

  if (dailyAfterIndex >= 0 || monthlyAfterIndex >= 0) {
    if (dailyAfterIndex < 0) {
      return "MONTHLY";
    }

    if (monthlyAfterIndex < 0) {
      return "DAILY";
    }

    return dailyAfterIndex <= monthlyAfterIndex ? "DAILY" : "MONTHLY";
  }

  return null;
}

function getCandidatePeriod(context: string, contextBefore: string, contextAfter: string): LaborSalaryPeriod | null {
  if (!/(salario|sueldo|remuneracion|retribucion|percepcion)/.test(context)) {
    return null;
  }

  if (/(bono|asistencia|puntualidad|aguinaldo|prima|vacacion|vacaciones|fondo|ahorro|imss|isr|retencion|deduccion|comision|vales)/.test(contextBefore.slice(-90))) {
    return null;
  }

  const nearestPeriod = getNearestCandidatePeriod(contextBefore, contextAfter);
  if (nearestPeriod) {
    return nearestPeriod;
  }

  if (/(diario|diaria|por dia|cada dia|salario base diario)/.test(context)) {
    return "DAILY";
  }

  if (/(mensual|mensuales|al mes|por mes|cada mes)/.test(context)) {
    return "MONTHLY";
  }

  if (/(quincenal|quincenales|catorcenal|semanal|semanales|dos pagos|dia 10|dias 10|veinticinco)/.test(contextBefore)) {
    return null;
  }

  return null;
}

function buildSourceText(text: string, index: number) {
  const start = Math.max(0, index - 120);
  const end = Math.min(text.length, index + 160);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function buildMoneyAmountPattern() {
  return /(?:\$|mxn\s*)?\s*\d{1,3}(?:[,\s.]\d{3})*(?:[,.]\d{1,2})?(?:\s*(?:m\.?\s*n\.?|mxn|pesos?))?|(?:\$|mxn\s*)?\s*\d+(?:[,.]\d{1,2})?(?:\s*(?:m\.?\s*n\.?|mxn|pesos?))?/gi;
}

export function extractLaborSalaryCandidatesFromText(text: string) {
  const normalizedText = normalizeDocumentText(text);
  const candidates: LaborSalaryCandidate[] = [];
  const amountPattern = buildMoneyAmountPattern();

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
    const contextAfter = normalizedText.slice(index + rawValue.length, contextEnd);
    if (!hasMoneySignal(rawValue, contextBefore, amountMxn)) {
      continue;
    }

    const period = getCandidatePeriod(context, contextBefore, contextAfter);
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

function extractFallbackMonthlySalaryFromText(text: string) {
  const normalizedText = normalizeDocumentText(text);
  if (!/(salario|sueldo|remuneracion|retribucion|percepcion)/.test(normalizedText)) {
    return null;
  }

  const candidates: LaborSalaryCandidate[] = [];
  const amountPattern = buildMoneyAmountPattern();

  for (const match of normalizedText.matchAll(amountPattern)) {
    const rawValue = match[0];
    const index = match.index ?? 0;
    const amountMxn = parseMoneyAmount(rawValue);
    if (amountMxn === undefined || amountMxn < 1000) {
      continue;
    }

    const contextStart = Math.max(0, index - 250);
    const contextEnd = Math.min(normalizedText.length, index + rawValue.length + 250);
    const context = normalizedText.slice(contextStart, contextEnd);
    const contextBefore = normalizedText.slice(contextStart, index);
    const moneyContext = normalizedText.slice(Math.max(0, index - 60), Math.min(normalizedText.length, index + rawValue.length + 60));

    if (!/(salario|sueldo|remuneracion|retribucion|percepcion)/.test(context)) {
      continue;
    }

    if (!/[$]|mxn|m\.?\s*n\.?|pesos?/i.test(rawValue) && !/(mxn|m\.?\s*n\.?|pesos?)/.test(moneyContext)) {
      continue;
    }

    if (/(bono|asistencia|puntualidad|aguinaldo|prima|vacacion|vacaciones|fondo|ahorro|imss|isr|retencion|deduccion|comision|vales|indemnizacion|liquidacion|finiquito)/.test(contextBefore)) {
      continue;
    }

    if (/(quincenal|quincenales|catorcenal|semanal|semanales)/.test(context) && !/(mensual|mensuales|al mes|por mes|cada mes)/.test(context)) {
      continue;
    }

    candidates.push({
      period: "MONTHLY",
      amountMxn,
      dailySalaryMxn: amountMxn / 30,
      monthlyGrossSalaryMxn: amountMxn,
      position: index,
      sourceText: buildSourceText(normalizedText, index)
    });
  }

  return candidates.sort((left, right) => left.amountMxn - right.amountMxn || left.position - right.position).at(-1) ?? null;
}

export function extractLatestLaborSalaryFromText(text: string) {
  const candidates = extractLaborSalaryCandidatesFromText(text);
  const dailyCandidates = candidates.filter((candidate) => candidate.period === "DAILY");
  if (dailyCandidates.length > 0) {
    return dailyCandidates.at(-1) ?? null;
  }

  const monthlyCandidates = candidates.filter((candidate) => candidate.period === "MONTHLY");
  return monthlyCandidates.at(-1) ?? candidates.at(-1) ?? extractFallbackMonthlySalaryFromText(text);
}

export function formatLaborSalaryExtractionDetail(extraction: Pick<LaborSalaryExtraction, "monthlyGrossSalaryMxn" | "originalFileName">) {
  return extraction.monthlyGrossSalaryMxn
    ? `${LABOR_SALARY_EXTRACTION_DETAIL_VERSION}: Salario mensual extraido y convertido a diario / 30 desde ${extraction.originalFileName}.`
    : `${LABOR_SALARY_EXTRACTION_DETAIL_VERSION}: Salario diario extraido desde ${extraction.originalFileName}.`;
}

export function formatLaborSalaryExtractionFailureDetail(originalFileName: string) {
  return `${LABOR_SALARY_EXTRACTION_DETAIL_VERSION}: Sin salario diario o mensual legible en ${originalFileName}.`;
}

export async function extractLaborSalaryFromDocument(
  document: LaborSalaryDocumentInput
): Promise<LaborSalaryExtraction | null> {
  if (!isLaborSalaryDocumentType(document.documentType)) {
    return null;
  }

  try {
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
  } catch {
    return null;
  }
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

  const extractionEntries = await Promise.all(salaryDocuments.map(async (document) => ({
    document,
    extraction: await extractLaborSalaryFromDocument(document)
  })));

  for (const entry of extractionEntries.slice().reverse()) {
    if (entry.extraction) {
      return entry.extraction;
    }

    if (entry.document.documentType === "ADDENDUM") {
      return null;
    }
  }

  return null;
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
      detail: "Contrato/addenda cargados sin salario diario legible."
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
