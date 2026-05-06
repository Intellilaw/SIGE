import { useEffect, useState, type FormEvent } from "react";
import {
  TEAM_OPTIONS,
  type Client,
  type Quote,
  type QuoteLanguage,
  type QuoteLineItem,
  type QuoteStatus,
  type QuoteTemplate,
  type QuoteTemplateAmountColumn,
  type QuoteTemplateAmountMode,
  type QuoteTemplateCell,
  type QuoteTemplateTableRow,
  type QuoteType,
  type Team
} from "@sige/contracts";

import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type ActiveTab = "new-template" | "templates" | "quotes" | "new-quote-template" | "new-quote-generic";
type QuoteSourceMode = "template" | "generic";
type QuoteTemplateLanguage = "es" | "en";
type FlashTone = "success" | "error";
type MergeTargetKind = "amount" | "payment" | "notes";
type QuoteDownloadFormat = "pdf" | "word";
type SavedQuoteDownloadState = {
  quoteId: string;
  format: QuoteDownloadFormat;
} | null;

type QuoteTemplateTranslationResponse = {
  template: QuoteTemplate;
};

type FlashState = {
  tone: FlashTone;
  text: string;
} | null;

type EditableLineItem = {
  id: string;
  concept: string;
  amountMxn: string;
};

type QuoteFormState = {
  clientId: string;
  clientName: string;
  responsibleTeam: Team | "";
  status: QuoteStatus;
  quoteType: QuoteType;
  language: QuoteLanguage;
  quoteDate: string;
  subject: string;
  milestone: string;
  notes: string;
  lineItems: EditableLineItem[];
};

type QuoteTemplateFormState = {
  team: Team | "";
  quoteType: QuoteType;
  milestone: string;
  services: string;
  amountColumns: [QuoteTemplateAmountColumn, QuoteTemplateAmountColumn];
  tableRows: QuoteTemplateTableRow[];
};

type QuoteTemplateDraftState = {
  amountColumns: [QuoteTemplateAmountColumn, QuoteTemplateAmountColumn];
  tableRows: QuoteTemplateTableRow[];
};

const IVA_RATE = 0.16;
const QUOTE_TEAM_OPTIONS = [
  { key: "LITIGATION", label: "Litigio" },
  { key: "CORPORATE_LABOR", label: "Corporativo-compliance laboral" },
  { key: "SETTLEMENTS", label: "Convenios y contratos" },
  { key: "FINANCIAL_LAW", label: "Derecho financiero" },
  { key: "TAX_COMPLIANCE", label: "Compliance fiscal" }
] as const satisfies Array<{ key: Team; label: string }>;

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getSearchWords(value?: string | null) {
  return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}

function matchesAllSearchWords(haystack: string, searchWords: string[]) {
  if (searchWords.length === 0) {
    return true;
  }

  const normalizedHaystack = normalizeComparableText(haystack);
  return searchWords.every((word) => normalizedHaystack.includes(word));
}

const SPANISH_TO_ENGLISH_TERMS: Array<[string, string]> = [
  ["prestacion de servicios", "provision of services"],
  ["prestación de servicios", "provision of services"],
  ["momento de pago", "time of payment"],
  ["asunto unico", "one-time matter"],
  ["asunto único", "one-time matter"],
  ["porcentaje de exito", "success fee"],
  ["porcentaje de éxito", "success fee"],
  ["honorarios", "fees"],
  ["servicios", "services"],
  ["servicio", "service"],
  ["cotizacion", "quotation"],
  ["cotización", "quotation"],
  ["conceptos", "concepts"],
  ["concepto", "concept"],
  ["monto", "amount"],
  ["fijo", "fixed"],
  ["variable", "variable"],
  ["notas", "notes"],
  ["nota", "note"],
  ["pago", "payment"],
  ["pagos", "payments"],
  ["anticipo", "advance payment"],
  ["contra entrega", "upon delivery"],
  ["firma", "signature"],
  ["entrega", "delivery"],
  ["cierre", "closing"],
  ["aprobacion", "approval"],
  ["aprobación", "approval"],
  ["contratacion", "engagement"],
  ["contratación", "engagement"],
  ["cliente", "client"],
  ["clientes", "clients"],
  ["despacho", "firm"],
  ["demanda", "lawsuit"],
  ["juicio", "proceeding"],
  ["procedimiento", "proceeding"],
  ["mediacion", "mediation"],
  ["mediación", "mediation"],
  ["contrato", "agreement"],
  ["contratos", "agreements"],
  ["convenio", "agreement"],
  ["convenios", "agreements"],
  ["cumplimiento", "compliance"],
  ["laboral", "labor"],
  ["fiscal", "tax"],
  ["financiero", "financial"],
  ["corporativo", "corporate"],
  ["litigio", "litigation"],
  ["asesoria", "advisory"],
  ["asesoría", "advisory"],
  ["revision", "review"],
  ["revisión", "review"],
  ["redaccion", "drafting"],
  ["redacción", "drafting"],
  ["elaboracion", "preparation"],
  ["elaboración", "preparation"],
  ["negociacion", "negotiation"],
  ["negociación", "negotiation"],
  ["acompanamiento", "support"],
  ["acompañamiento", "support"],
  ["tramite", "filing"],
  ["trámite", "filing"],
  ["tramites", "filings"],
  ["trámites", "filings"],
  ["mensual", "monthly"],
  ["recuperado", "recovered"],
  ["recuperacion", "recovery"],
  ["recuperación", "recovery"],
  ["redes sociales", "social media"],
  ["impuestos", "taxes"],
  ["derechos", "government fees"],
  ["gastos", "expenses"],
  ["copias", "copies"],
  ["transportacion", "transportation"],
  ["transportación", "transportation"],
  ["ciudad de mexico", "Mexico City"],
  ["Ciudad de Mexico", "Mexico City"],
  ["Ciudad de México", "Mexico City"],
  ["sin titulo", "untitled"],
  ["sin título", "untitled"],
  ["sin definir", "to be defined"],
  ["y", "and"],
  ["o", "or"],
  ["con", "with"],
  ["para", "for"],
  ["por", "by"],
  ["del", "of the"],
  ["de", "of"],
  ["la", "the"],
  ["el", "the"],
  ["los", "the"],
  ["las", "the"]
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchReplacementCase(original: string, replacement: string) {
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }

  if (original[0] === original[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }

  return replacement;
}

function replaceSpanishTerm(source: string, spanish: string, english: string) {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(spanish)})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return source.replace(pattern, (_match, prefix: string, term: string) => `${prefix}${matchReplacementCase(term, english)}`);
}

function translateTextToEnglish(value?: string | null) {
  let translated = normalizeText(value);
  if (!translated) {
    return "";
  }

  SPANISH_TO_ENGLISH_TERMS.forEach(([spanish, english]) => {
    translated = replaceSpanishTerm(translated, spanish, english);
  });

  return translated.replace(/\s+/g, " ").trim();
}

function translateTemplateCellToEnglish(cell: QuoteTemplateCell): QuoteTemplateCell {
  return {
    ...cell,
    value: translateTextToEnglish(cell.value)
  };
}

function translateTemplateRowsToEnglish(rows: QuoteTemplateTableRow[]) {
  return (structuredClone(rows) as QuoteTemplateTableRow[]).map((row) => ({
    ...row,
    conceptDescription: translateTextToEnglish(row.conceptDescription),
    amountCells: row.amountCells.map(translateTemplateCellToEnglish),
    paymentMoment: translateTemplateCellToEnglish(row.paymentMoment),
    notesCell: translateTemplateCellToEnglish(row.notesCell)
  }));
}

function translateQuoteTemplateToEnglish(template: QuoteTemplate): QuoteTemplate {
  return {
    ...template,
    name: translateTextToEnglish(template.name) || template.name,
    subject: translateTextToEnglish(template.subject),
    services: translateTextToEnglish(template.services),
    milestone: template.milestone ? translateTextToEnglish(template.milestone) : undefined,
    notes: template.notes ? translateTextToEnglish(template.notes) : undefined,
    amountColumns: template.amountColumns.map((column) => ({
      ...column,
      title: translateTextToEnglish(column.title) || column.title
    })),
    tableRows: translateTemplateRowsToEnglish(template.tableRows),
    lineItems: template.lineItems.map((item) => ({
      ...item,
      concept: translateTextToEnglish(item.concept)
    }))
  };
}

function parseAmountInput(value: string) {
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = dateMatch
    ? new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]))
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("es-MX");
}

function getTodayDateInputValue() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateInputValue(value?: string) {
  const dateMatch = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  }

  return getTodayDateInputValue();
}

function getQuoteDisplayDate(quote: Quote) {
  return quote.quoteDate ?? quote.createdAt;
}

function downloadBlobFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function getQuoteTypeLabel(type: QuoteType) {
  return type === "RETAINER" ? "Iguala" : "Asunto unico";
}

function getTeamLabel(team?: Team | "" | null) {
  return (
    QUOTE_TEAM_OPTIONS.find((option) => option.key === team)?.label ??
    TEAM_OPTIONS.find((option) => option.key === team)?.label ??
    "Sin equipo"
  );
}

function getTemplateSearchText(template: QuoteTemplate) {
  const rowText = template.tableRows.flatMap((row) => [
    row.conceptDescription,
    ...row.amountCells.map((cell) => cell.value),
    row.paymentMoment.value,
    row.notesCell.value
  ]);

  return [
    template.templateNumber,
    template.name,
    template.subject,
    template.services,
    template.milestone,
    template.notes,
    getTeamLabel(template.team),
    getQuoteTypeLabel(template.quoteType),
    getTemplateAmountPreview(template),
    ...template.amountColumns.flatMap((column) => [column.title, getAmountModeLabel(column.mode)]),
    ...rowText
  ]
    .filter(Boolean)
    .join(" ");
}

function getQuoteSearchText(quote: Quote, clientNumber?: string) {
  const tableRows = quote.tableRows ?? [];
  const rowText = tableRows.flatMap((row) => [
    row.conceptDescription,
    ...row.amountCells.map((cell) => cell.value),
    row.paymentMoment.value,
    row.notesCell.value
  ]);

  return [
    clientNumber,
    quote.clientName,
    quote.quoteNumber,
    getQuoteDisplayDate(quote),
    formatDate(getQuoteDisplayDate(quote)),
    getQuoteTypeLabel(quote.quoteType),
    getTeamLabel(quote.responsibleTeam),
    quote.subject,
    quote.milestone,
    quote.notes,
    quote.language,
    formatCurrency(quote.totalMxn),
    ...quote.lineItems.flatMap((item) => [item.concept, String(item.amountMxn)]),
    ...rowText
  ]
    .filter(Boolean)
    .join(" ");
}

function filterTemplatesForSearch(templates: QuoteTemplate[], wordSearch: string, teamSearch: string) {
  const wordSearchWords = getSearchWords(wordSearch);
  const teamSearchWords = getSearchWords(teamSearch);

  return templates.filter((template) => {
    const templateText = getTemplateSearchText(template);
    const teamText = `${template.team} ${getTeamLabel(template.team)}`;
    return matchesAllSearchWords(templateText, wordSearchWords) && matchesAllSearchWords(teamText, teamSearchWords);
  });
}

function filterQuotesForSearch(quotes: Quote[], clients: Client[], wordSearch: string, clientSearch: string) {
  const wordSearchWords = getSearchWords(wordSearch);
  const clientSearchWords = getSearchWords(clientSearch);
  const clientNumberById = new Map(clients.map((client) => [client.id, client.clientNumber]));
  const clientNumberByName = new Map(
    clients.map((client) => [normalizeComparableText(client.name), client.clientNumber])
  );

  return quotes.filter((quote) => {
    const clientNumber =
      clientNumberById.get(quote.clientId) ?? clientNumberByName.get(normalizeComparableText(quote.clientName));
    const quoteText = getQuoteSearchText(quote, clientNumber);
    const clientText = [clientNumber, quote.clientName].filter(Boolean).join(" ");
    return matchesAllSearchWords(quoteText, wordSearchWords) && matchesAllSearchWords(clientText, clientSearchWords);
  });
}

function resolveDefaultTeam(userTeam?: string) {
  return QUOTE_TEAM_OPTIONS.some((option) => option.key === userTeam) ? (userTeam as Team) : "";
}

function createEditableLineItem(concept = "", amountMxn = ""): EditableLineItem {
  return {
    id: createId("quote-line"),
    concept,
    amountMxn
  };
}

function toEditableLineItems(items?: QuoteLineItem[]) {
  if (!items || items.length === 0) {
    return [createEditableLineItem()];
  }

  return items.map((item) => createEditableLineItem(item.concept, String(item.amountMxn)));
}

function createTemplateCell(value = ""): QuoteTemplateCell {
  return {
    value,
    rowSpan: 1,
    hidden: false
  };
}

function createTemplateRow(): QuoteTemplateTableRow {
  return {
    id: createId("template-row"),
    conceptDescription: "",
    excludeFromIva: false,
    amountCells: [createTemplateCell(), createTemplateCell()],
    paymentMoment: createTemplateCell(),
    notesCell: createTemplateCell()
  };
}

function getDefaultAmountColumnTitle(index: number, language: QuoteLanguage = "es") {
  const amountLabel = language === "en" ? "Amount" : "Monto";
  return `${amountLabel} ${index + 1}`;
}

function createDefaultAmountColumns(language: QuoteLanguage = "es"): [QuoteTemplateAmountColumn, QuoteTemplateAmountColumn] {
  return [
    { id: "primary", title: getDefaultAmountColumnTitle(0, language), enabled: true, mode: "FIXED" },
    { id: "secondary", title: getDefaultAmountColumnTitle(1, language), enabled: false, mode: "FIXED" }
  ];
}

function buildEmptyTemplateForm(defaultTeam?: string): QuoteTemplateFormState {
  return {
    team: resolveDefaultTeam(defaultTeam),
    quoteType: "ONE_TIME",
    milestone: "",
    services: "",
    amountColumns: createDefaultAmountColumns(),
    tableRows: [createTemplateRow()]
  };
}

function buildEmptyQuoteForm(defaultTeam?: string, language: QuoteLanguage = "es"): QuoteFormState {
  return {
    clientId: "",
    clientName: "",
    responsibleTeam: resolveDefaultTeam(defaultTeam),
    status: "DRAFT",
    quoteType: "ONE_TIME",
    language,
    quoteDate: getTodayDateInputValue(),
    subject: "",
    milestone: "",
    notes: "",
    lineItems: [createEditableLineItem()]
  };
}

function buildEmptyQuoteTemplateDraft(language: QuoteLanguage = "es"): QuoteTemplateDraftState {
  return {
    amountColumns: createDefaultAmountColumns(language),
    tableRows: [createTemplateRow()]
  };
}

function buildTemplateFormFromTemplate(template: QuoteTemplate): QuoteTemplateFormState {
  return {
    team: template.team,
    quoteType: template.quoteType,
    milestone: template.milestone ?? "",
    services: template.services,
    amountColumns: structuredClone(template.amountColumns) as [QuoteTemplateAmountColumn, QuoteTemplateAmountColumn],
    tableRows: structuredClone(template.tableRows) as QuoteTemplateTableRow[]
  };
}

function buildQuoteTemplateDraftFromTemplate(template: QuoteTemplate): QuoteTemplateDraftState {
  return {
    amountColumns: structuredClone(template.amountColumns) as [QuoteTemplateAmountColumn, QuoteTemplateAmountColumn],
    tableRows: structuredClone(template.tableRows) as QuoteTemplateTableRow[]
  };
}

function buildQuoteTemplateDraftFromQuote(quote: Quote): QuoteTemplateDraftState {
  if (quote.amountColumns?.length && quote.tableRows?.length) {
    return {
      amountColumns: structuredClone(quote.amountColumns) as [QuoteTemplateAmountColumn, QuoteTemplateAmountColumn],
      tableRows: structuredClone(quote.tableRows) as QuoteTemplateTableRow[]
    };
  }

  if (!quote.lineItems.length) {
    return buildEmptyQuoteTemplateDraft(quote.language ?? "es");
  }

  return {
    amountColumns: createDefaultAmountColumns(quote.language ?? "es"),
    tableRows: quote.lineItems.map((item, index) => ({
      id: `quote-row-${index + 1}`,
      conceptDescription: item.concept,
      excludeFromIva: false,
      amountCells: [
        createTemplateCell(String(item.amountMxn)),
        createTemplateCell("")
      ],
      paymentMoment: createTemplateCell(""),
      notesCell: createTemplateCell("")
    }))
  };
}

function buildQuoteFormFromTemplate(template: QuoteTemplate, defaultTeam?: string, language: QuoteLanguage = "es"): QuoteFormState {
  return {
    clientId: "",
    clientName: "",
    responsibleTeam: resolveDefaultTeam(template.team ?? defaultTeam),
    status: "DRAFT",
    quoteType: template.quoteType,
    language,
    quoteDate: getTodayDateInputValue(),
    subject: normalizeText(template.subject) || normalizeText(template.services).slice(0, 120),
    milestone: template.milestone ?? "",
    notes: normalizeText(template.services),
    lineItems: toEditableLineItems(template.lineItems)
  };
}

function buildQuoteFormFromQuote(quote: Quote): QuoteFormState {
  return {
    clientId: quote.clientId,
    clientName: quote.clientName,
    responsibleTeam: quote.responsibleTeam ?? "",
    status: quote.status,
    quoteType: quote.quoteType,
    language: quote.language ?? "es",
    quoteDate: toDateInputValue(quote.quoteDate ?? quote.createdAt),
    subject: quote.subject,
    milestone: quote.milestone ?? "",
    notes: quote.notes ?? "",
    lineItems: toEditableLineItems(quote.lineItems)
  };
}

function buildTemplatePayload(form: QuoteTemplateFormState) {
  return {
    team: form.team,
    quoteType: form.quoteType,
    services: normalizeText(form.services),
    amountColumns: form.amountColumns,
    tableRows: form.tableRows,
    milestone: normalizeText(form.milestone) || undefined
  };
}

function buildLineItemsPayload(items: EditableLineItem[]) {
  const populated = items.filter((item) => normalizeText(item.concept) || normalizeText(item.amountMxn));

  if (populated.length === 0) {
    throw new Error("Agrega al menos un concepto a la cotizacion.");
  }

  return populated.map((item) => {
    const concept = normalizeText(item.concept);
    if (concept.length < 2) {
      throw new Error("Cada concepto debe tener al menos 2 caracteres.");
    }

    return {
      concept,
      amountMxn: parseAmountInput(item.amountMxn)
    };
  });
}

function buildLineItemsFromTemplateDraft(draft: QuoteTemplateDraftState) {
  const enabledColumns = draft.amountColumns
    .map((column, index) => ({ ...column, index }))
    .filter((column) => column.enabled && column.mode === "FIXED");

  const lineItems = draft.tableRows.flatMap((row, rowIndex) =>
    enabledColumns.flatMap((column) => {
      const cell = row.amountCells[column.index];
      if (!cell || cell.hidden) {
        return [];
      }

      const amountMxn = parseAmountInput(String(cell.value ?? ""));
      if (amountMxn <= 0) {
        return [];
      }

      const conceptBase = normalizeText(row.conceptDescription) || getTemplateRowLabel(rowIndex);
      const concept =
        enabledColumns.length > 1 ? `${conceptBase} (${column.title})` : conceptBase;

      return [{ concept, amountMxn }];
    })
  );

  if (lineItems.length === 0) {
    throw new Error("La cotizacion tipo necesita al menos un monto fijo mayor a 0 para poder guardarse.");
  }

  return lineItems;
}

function sortQuotes(items: Quote[]) {
  return [...items].sort((left, right) => {
    const quoteDateDelta = getQuoteDisplayDate(right).localeCompare(getQuoteDisplayDate(left));
    if (quoteDateDelta !== 0) {
      return quoteDateDelta;
    }

    const createdDelta = (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
    if (createdDelta !== 0) {
      return createdDelta;
    }

    return right.quoteNumber.localeCompare(left.quoteNumber, "es-MX", { numeric: true });
  });
}

function getQuoteSequence(quoteNumber: string) {
  const match = normalizeText(quoteNumber).match(/^E-(\d+)$/i);
  if (!match) {
    return 0;
  }

  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function buildNextQuoteNumber(quotes: Quote[]) {
  const maxSequence = quotes.reduce(
    (currentMax, quote) => Math.max(currentMax, getQuoteSequence(quote.quoteNumber)),
    0
  );

  const nextSequence = Math.max(maxSequence, quotes.length) + 1;
  return `E-${String(nextSequence).padStart(3, "0")}`;
}

function getTemplateSequence(templateNumber: string) {
  const match = normalizeText(templateNumber).match(/^T-(\d+)$/i);
  if (!match) {
    return 0;
  }

  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : 0;
}

function sortTemplates(items: QuoteTemplate[]) {
  const teamOrder = new Map<Team, number>(QUOTE_TEAM_OPTIONS.map((option, index) => [option.key, index]));

  return [...items].sort((left, right) => {
    const teamDelta = (teamOrder.get(left.team) ?? 999) - (teamOrder.get(right.team) ?? 999);
    if (teamDelta !== 0) {
      return teamDelta;
    }

    return getTemplateSequence(right.templateNumber) - getTemplateSequence(left.templateNumber);
  });
}

function buildNextTemplateNumber(templates: QuoteTemplate[]) {
  const maxSequence = templates.reduce(
    (currentMax, template) => Math.max(currentMax, getTemplateSequence(template.templateNumber)),
    0
  );

  return `T-${String(maxSequence + 1).padStart(3, "0")}`;
}

function groupTemplatesByTeam(templates: QuoteTemplate[]) {
  const grouped = new Map<Team, QuoteTemplate[]>();

  sortTemplates(templates).forEach((template) => {
    const current = grouped.get(template.team) ?? [];
    current.push(template);
    grouped.set(template.team, current);
  });

  return Array.from(grouped.entries()).map(([team, items]) => ({
    team,
    label: getTeamLabel(team),
    items
  }));
}

function groupQuotesByClient(quotes: Quote[], clients: Client[]) {
  const clientNumberById = new Map(clients.map((client) => [client.id, client.clientNumber]));
  const clientNumberByName = new Map(
    clients.map((client) => [normalizeComparableText(client.name), client.clientNumber])
  );
  const grouped = new Map<string, { clientId?: string; clientName: string; clientNumber?: string; items: Quote[] }>();

  sortQuotes(quotes).forEach((quote) => {
    const key = quote.clientId || normalizeComparableText(quote.clientName);
    const current = grouped.get(key) ?? {
      clientId: quote.clientId,
      clientName: quote.clientName,
      clientNumber:
        clientNumberById.get(quote.clientId) ??
        clientNumberByName.get(normalizeComparableText(quote.clientName)),
      items: []
    };

    current.items.push(quote);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .sort((left, right) => left.clientName.localeCompare(right.clientName, "es-MX"))
    .map((group) => ({
      ...group,
      totalMxn: group.items.reduce((sum, item) => sum + item.totalMxn, 0)
    }));
}

function summarizeTemplateServices(services: string, maxLength = 180) {
  const compact = normalizeText(services).replace(/\s+/g, " ");
  if (!compact) {
    return "Sin descripcion de servicios.";
  }

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function getTemplateAmountPreview(template: QuoteTemplate) {
  const hasFixedColumn = template.amountColumns.some((column) => column.enabled && column.mode === "FIXED");
  return hasFixedColumn ? formatCurrency(template.totalMxn) : "Monto variable";
}

function getCellFromRow(
  row: QuoteTemplateTableRow,
  kind: MergeTargetKind,
  amountIndex: 0 | 1 = 0
) {
  if (kind === "payment") {
    return row.paymentMoment;
  }

  if (kind === "notes") {
    return row.notesCell;
  }

  return row.amountCells[amountIndex];
}

function findMasterRowIndex(
  rows: QuoteTemplateTableRow[],
  rowIndex: number,
  kind: MergeTargetKind,
  amountIndex: 0 | 1 = 0
) {
  for (let index = rowIndex; index >= 0; index -= 1) {
    const candidate = getCellFromRow(rows[index], kind, amountIndex);
    if (!candidate.hidden && index + candidate.rowSpan > rowIndex) {
      return index;
    }
  }

  return rowIndex;
}

function mergeTemplateCellDown(
  rows: QuoteTemplateTableRow[],
  rowIndex: number,
  kind: MergeTargetKind,
  amountIndex: 0 | 1 = 0
) {
  const nextRows = structuredClone(rows) as QuoteTemplateTableRow[];
  const sourceCell = getCellFromRow(nextRows[rowIndex], kind, amountIndex);
  if (sourceCell.hidden) {
    return nextRows;
  }

  const nextIndex = rowIndex + sourceCell.rowSpan;
  if (nextIndex >= nextRows.length) {
    return nextRows;
  }

  const nextCell = getCellFromRow(nextRows[nextIndex], kind, amountIndex);
  if (nextCell.hidden) {
    return nextRows;
  }

  sourceCell.rowSpan += nextCell.rowSpan;
  nextCell.hidden = true;
  nextCell.rowSpan = 1;
  return nextRows;
}

function mergeTemplateCellUp(
  rows: QuoteTemplateTableRow[],
  rowIndex: number,
  kind: MergeTargetKind,
  amountIndex: 0 | 1 = 0
) {
  if (rowIndex <= 0) {
    return rows;
  }

  for (let index = rowIndex - 1; index >= 0; index -= 1) {
    const candidate = getCellFromRow(rows[index], kind, amountIndex);
    if (candidate.hidden) {
      continue;
    }

    if (index + candidate.rowSpan === rowIndex) {
      return mergeTemplateCellDown(rows, index, kind, amountIndex);
    }

    break;
  }

  return rows;
}

function unmergeTemplateCell(
  rows: QuoteTemplateTableRow[],
  rowIndex: number,
  kind: MergeTargetKind,
  amountIndex: 0 | 1 = 0
) {
  const nextRows = structuredClone(rows) as QuoteTemplateTableRow[];
  const sourceCell = getCellFromRow(nextRows[rowIndex], kind, amountIndex);
  if (sourceCell.hidden || sourceCell.rowSpan <= 1) {
    return nextRows;
  }

  const coveredRows = sourceCell.rowSpan;
  sourceCell.rowSpan = 1;

  for (let offset = 1; offset < coveredRows; offset += 1) {
    const targetIndex = rowIndex + offset;
    if (targetIndex >= nextRows.length) {
      break;
    }

    const targetCell = getCellFromRow(nextRows[targetIndex], kind, amountIndex);
    targetCell.hidden = false;
    targetCell.rowSpan = 1;
  }

  return nextRows;
}

function insertTemplateRowAfter(rows: QuoteTemplateTableRow[], rowIndex: number) {
  const nextRows = structuredClone(rows) as QuoteTemplateTableRow[];
  nextRows.splice(rowIndex + 1, 0, createTemplateRow());
  return nextRows;
}

function removeTemplateRow(rows: QuoteTemplateTableRow[], rowIndex: number) {
  if (rows.length === 1) {
    return [createTemplateRow()];
  }

  const nextRows = structuredClone(rows) as QuoteTemplateTableRow[];
  const targets: Array<{ kind: MergeTargetKind; amountIndex?: 0 | 1 }> = [
    { kind: "amount", amountIndex: 0 },
    { kind: "amount", amountIndex: 1 },
    { kind: "payment" },
    { kind: "notes" }
  ];

  targets.forEach((target) => {
    const cell = getCellFromRow(nextRows[rowIndex], target.kind, target.amountIndex ?? 0);
    if (cell.hidden) {
      const masterIndex = findMasterRowIndex(nextRows, rowIndex, target.kind, target.amountIndex ?? 0);
      const masterCell = getCellFromRow(nextRows[masterIndex], target.kind, target.amountIndex ?? 0);
      masterCell.rowSpan = Math.max(1, masterCell.rowSpan - 1);
      return;
    }

    if (cell.rowSpan > 1) {
      const coveredRows = cell.rowSpan;
      cell.rowSpan = 1;

      for (let offset = 1; offset < coveredRows; offset += 1) {
        const targetIndex = rowIndex + offset;
        if (targetIndex >= nextRows.length) {
          break;
        }

        const targetCell = getCellFromRow(nextRows[targetIndex], target.kind, target.amountIndex ?? 0);
        targetCell.hidden = false;
        targetCell.rowSpan = 1;
      }
    }
  });

  nextRows.splice(rowIndex, 1);
  return nextRows;
}

function resetSecondaryAmountColumn(rows: QuoteTemplateTableRow[]) {
  return rows.map((row) => ({
    ...row,
    amountCells: [
      row.amountCells[0],
      {
        value: row.amountCells[1]?.value ?? "",
        rowSpan: 1,
        hidden: false
      }
    ]
  }));
}

function getAmountColumnSummary(rows: QuoteTemplateTableRow[], column: QuoteTemplateAmountColumn, amountIndex: 0 | 1) {
  if (!column.enabled || column.mode === "VARIABLE") {
    return null;
  }

  const subtotal = rows.reduce((sum, row) => {
    const cell = row.amountCells[amountIndex];
    if (!cell || cell.hidden) {
      return sum;
    }

    return sum + parseAmountInput(cell.value);
  }, 0);
  const taxableSubtotal = rows.reduce((sum, row) => {
    const cell = row.amountCells[amountIndex];
    if (!cell || cell.hidden || row.excludeFromIva) {
      return sum;
    }

    return sum + parseAmountInput(cell.value);
  }, 0);

  const iva = taxableSubtotal * IVA_RATE;
  return {
    subtotal,
    taxableSubtotal,
    iva,
    total: subtotal + iva
  };
}

function getTemplateRowLabel(index: number) {
  return `Concepto ${index + 1}`;
}

function getAmountModeLabel(mode: QuoteTemplateAmountMode) {
  return mode === "VARIABLE" ? "Variable" : "Fijo";
}

function getMergedCaption(
  rows: QuoteTemplateTableRow[],
  rowIndex: number,
  kind: MergeTargetKind,
  amountIndex: 0 | 1 = 0
) {
  const masterIndex = findMasterRowIndex(rows, rowIndex, kind, amountIndex);
  return `Fusionado con ${getTemplateRowLabel(masterIndex)}`;
}

function getEnabledAmountColumns(amountColumns: QuoteTemplateAmountColumn[]) {
  return amountColumns
    .map((column, amountIndex) => ({ column, amountIndex: amountIndex as 0 | 1 }))
    .filter(({ column }) => column.enabled);
}

function getPreviewCellValue(cell: QuoteTemplateCell, amountMode?: QuoteTemplateAmountMode) {
  const cleanValue = normalizeText(cell.value);
  if (!cleanValue) {
    return "Sin definir";
  }

  if (amountMode === "FIXED") {
    return formatCurrency(parseAmountInput(cleanValue));
  }

  return cleanValue;
}

function LineItemsEditor(props: {
  title: string;
  items: EditableLineItem[];
  onChange: (items: EditableLineItem[]) => void;
}) {
  const total = props.items.reduce((sum, item) => sum + parseAmountInput(item.amountMxn), 0);

  function updateLineItem(itemId: string, field: "concept" | "amountMxn", value: string) {
    props.onChange(props.items.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)));
  }

  function addLineItem() {
    props.onChange([...props.items, createEditableLineItem()]);
  }

  function removeLineItem(itemId: string) {
    if (props.items.length === 1) {
      props.onChange([createEditableLineItem()]);
      return;
    }

    props.onChange(props.items.filter((item) => item.id !== itemId));
  }

  return (
    <div className="quotes-line-editor">
      <div className="panel-header quotes-line-editor-header">
        <h3>{props.title}</h3>
        <span>{formatCurrency(total)}</span>
      </div>

      <div className="quotes-line-editor-body">
        {props.items.map((item, index) => (
          <div key={item.id} className="quotes-line-item-row">
            <label className="form-field">
              <span>{getTemplateRowLabel(index)}</span>
              <input
                type="text"
                value={item.concept}
                onChange={(event) => updateLineItem(item.id, "concept", event.target.value)}
                placeholder="Honorarios, anticipo, tramite, etc."
              />
            </label>

            <label className="form-field">
              <span>Monto MXN</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.amountMxn}
                onChange={(event) => updateLineItem(item.id, "amountMxn", event.target.value)}
                placeholder="0.00"
              />
            </label>

            <div className="quotes-line-item-actions">
              <button type="button" className="secondary-button" onClick={addLineItem}>
                + Concepto
              </button>
              <button type="button" className="danger-button" onClick={() => removeLineItem(item.id)}>
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateAmountColumnConfig(props: {
  column: QuoteTemplateAmountColumn;
  secondary?: boolean;
  onToggleSecondary?: (enabled: boolean) => void;
  onModeChange: (mode: QuoteTemplateAmountMode) => void;
}) {
  return (
    <div className="quote-template-amount-config">
      <div className="quote-template-amount-config-head">
        <strong>{props.column.title}</strong>
        {props.secondary ? (
          <label className="quote-template-checkbox">
            <input
              type="checkbox"
              checked={props.column.enabled}
              onChange={(event) => props.onToggleSecondary?.(event.target.checked)}
            />
            <span>Habilitar segunda columna de monto</span>
          </label>
        ) : (
          <span className="muted">Columna principal obligatoria</span>
        )}
      </div>

      {props.column.enabled ? (
        <div className="quote-template-mode-toggle">
          <label className={`quote-template-mode-pill ${props.column.mode === "FIXED" ? "is-active" : ""}`}>
            <input
              type="checkbox"
              checked={props.column.mode === "FIXED"}
              onChange={() => props.onModeChange("FIXED")}
            />
            <span>Monto fijo</span>
          </label>
          <label className={`quote-template-mode-pill ${props.column.mode === "VARIABLE" ? "is-active" : ""}`}>
            <input
              type="checkbox"
              checked={props.column.mode === "VARIABLE"}
              onChange={() => props.onModeChange("VARIABLE")}
            />
            <span>Monto variable</span>
          </label>
        </div>
      ) : (
        <p className="muted">Activa esta columna para usar una segunda via de cobro o presupuesto.</p>
      )}
    </div>
  );
}

function TemplateCellMergeControls(props: {
  disabled?: boolean;
  canMergeUp: boolean;
  canMergeDown: boolean;
  canUnmerge: boolean;
  onMergeUp: () => void;
  onMergeDown: () => void;
  onUnmerge: () => void;
}) {
  if (props.disabled) {
    return null;
  }

  return (
    <div className="quote-template-merge-controls">
      <button type="button" className="secondary-button" disabled={!props.canMergeUp} onClick={props.onMergeUp}>
        Fusionar arriba
      </button>
      <button type="button" className="secondary-button" disabled={!props.canMergeDown} onClick={props.onMergeDown}>
        Fusionar abajo
      </button>
      <button type="button" className="danger-button" disabled={!props.canUnmerge} onClick={props.onUnmerge}>
        Deshacer
      </button>
    </div>
  );
}

function TemplateSummaryGrid(props: {
  amountColumns: QuoteTemplateAmountColumn[];
  tableRows: QuoteTemplateTableRow[];
}) {
  return (
    <div className="quote-template-summary-grid">
      {props.amountColumns
        .map((column, amountIndex) => ({
          column,
          amountIndex: amountIndex as 0 | 1,
          summary: getAmountColumnSummary(props.tableRows, column, amountIndex as 0 | 1)
        }))
        .filter(({ column }) => column.enabled)
        .map(({ column, amountIndex, summary }) => (
          <article key={column.id} className="quote-template-summary-card">
            <div className="quote-template-summary-head">
              <strong>{column.title}</strong>
              <span>{getAmountModeLabel(column.mode)}</span>
            </div>

            {summary ? (
              <>
                <div className="quote-template-summary-row">
                  <span>Subtotal</span>
                  <strong>{formatCurrency(summary.subtotal)}</strong>
                </div>
                {summary.taxableSubtotal !== summary.subtotal ? (
                  <div className="quote-template-summary-row">
                    <span>Base IVA</span>
                    <strong>{formatCurrency(summary.taxableSubtotal)}</strong>
                  </div>
                ) : null}
                <div className="quote-template-summary-row">
                  <span>IVA</span>
                  <strong>{formatCurrency(summary.iva)}</strong>
                </div>
                <div className="quote-template-summary-row quote-template-summary-total">
                  <span>Total con IVA</span>
                  <strong>{formatCurrency(summary.total)}</strong>
                </div>
              </>
            ) : (
              <p className="muted">
                Esta columna usa monto variable, asi que no se calcula sumatoria final.
              </p>
            )}

            {amountIndex === 0 ? null : <small className="muted">Resumen independiente por columna.</small>}
          </article>
        ))}
    </div>
  );
}

function TemplateVisualPreview(props: {
  heading: string;
  templateNumber: string;
  team?: Team | "";
  quoteType: QuoteType;
  milestone?: string;
  services: string;
  servicesLabel?: string;
  emptyServicesText?: string;
  amountColumns: QuoteTemplateAmountColumn[];
  tableRows: QuoteTemplateTableRow[];
}) {
  const enabledAmountColumns = getEnabledAmountColumns(props.amountColumns);
  const servicesLabel = props.servicesLabel ?? "Servicios";
  const emptyServicesText = props.emptyServicesText ?? "Sin servicios capturados.";

  return (
    <section className="quote-template-visual-preview">
      <div className="quote-template-visual-header">
        <div>
          <p className="eyebrow">{props.heading}</p>
          <h3>{props.templateNumber}</h3>
        </div>
        <div className="quote-template-visual-meta">
          <span>{getTeamLabel(props.team)}</span>
          <span>{getQuoteTypeLabel(props.quoteType)}</span>
          <span>Hito: {normalizeText(props.milestone) || "-"}</span>
        </div>
      </div>

      <div className="quotes-template-services">
        <strong>{servicesLabel}</strong>
        <p>{normalizeText(props.services) || emptyServicesText}</p>
      </div>

      <div className="quote-template-preview-table-shell">
        <table className="quote-template-preview-table">
          <thead>
            <tr>
              <th>Sin titulo</th>
              <th>Conceptos</th>
              {enabledAmountColumns.map(({ column }) => (
                <th key={column.id}>
                  {column.title}
                  <small>{getAmountModeLabel(column.mode)}</small>
                </th>
              ))}
              <th>Momento de pago</th>
              <th>Notas</th>
            </tr>
          </thead>
          <tbody>
            {props.tableRows.map((row, rowIndex) => (
              <tr key={row.id}>
                <td className="quote-template-preview-index">
                  <div className="quote-template-preview-cell-content">
                    <span>{getTemplateRowLabel(rowIndex)}</span>
                  </div>
                </td>
                <td>
                  <div className="quote-template-preview-cell-content">
                    {normalizeText(row.conceptDescription) || "Sin descripcion"}
                  </div>
                </td>

                {enabledAmountColumns.map(({ column, amountIndex }) => {
                  const cell = row.amountCells[amountIndex];
                  if (cell.hidden) {
                    return null;
                  }

                  return (
                    <td
                      key={column.id}
                      rowSpan={cell.rowSpan}
                      className={cell.rowSpan > 1 ? "quote-template-preview-merged-cell" : undefined}
                    >
                      <div className="quote-template-preview-cell-content">
                        {getPreviewCellValue(cell, column.mode)}
                      </div>
                    </td>
                  );
                })}

                {row.paymentMoment.hidden ? null : (
                  <td
                    rowSpan={row.paymentMoment.rowSpan}
                    className={row.paymentMoment.rowSpan > 1 ? "quote-template-preview-merged-cell" : undefined}
                  >
                    <div className="quote-template-preview-cell-content">
                      {getPreviewCellValue(row.paymentMoment)}
                    </div>
                  </td>
                )}

                {row.notesCell.hidden ? null : (
                  <td
                    rowSpan={row.notesCell.rowSpan}
                    className={row.notesCell.rowSpan > 1 ? "quote-template-preview-merged-cell" : undefined}
                  >
                    <div className="quote-template-preview-cell-content">
                      {getPreviewCellValue(row.notesCell)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TemplateSummaryGrid amountColumns={props.amountColumns} tableRows={props.tableRows} />
    </section>
  );
}

function TemplateConceptCard(props: {
  row: QuoteTemplateTableRow;
  rowIndex: number;
  rows: QuoteTemplateTableRow[];
  amountColumns: QuoteTemplateAmountColumn[];
  readOnly?: boolean;
  onRowChange?: (rowIndex: number, updater: (row: QuoteTemplateTableRow) => QuoteTemplateTableRow) => void;
  onInsertAfter?: (rowIndex: number) => void;
  onRemove?: (rowIndex: number) => void;
  onMerge?: (direction: "up" | "down", kind: MergeTargetKind, rowIndex: number, amountIndex?: 0 | 1) => void;
  onUnmerge?: (kind: MergeTargetKind, rowIndex: number, amountIndex?: 0 | 1) => void;
}) {
  function renderAmountField(amountIndex: 0 | 1) {
    const column = props.amountColumns[amountIndex];
    if (!column.enabled) {
      return null;
    }

    const cell = props.row.amountCells[amountIndex];
    const masterIndex = findMasterRowIndex(props.rows, props.rowIndex, "amount", amountIndex);
    const isMaster = !cell.hidden;

    return (
      <div key={column.id} className="quote-template-field">
        <div className="quote-template-field-head">
          <span>{column.title}</span>
          <small>{getAmountModeLabel(column.mode)}</small>
        </div>

        {isMaster ? (
          <>
            {column.mode === "FIXED" ? (
              <input
                type="number"
                min="0"
                step="0.01"
                value={cell.value}
                disabled={props.readOnly}
                onChange={(event) =>
                  props.onRowChange?.(props.rowIndex, (row) => ({
                    ...row,
                    amountCells: row.amountCells.map((amountCell, index) =>
                      index === amountIndex ? { ...amountCell, value: event.target.value } : amountCell
                    )
                  }))
                }
                placeholder="0.00"
              />
            ) : (
              <input
                type="text"
                value={cell.value}
                disabled={props.readOnly}
                onChange={(event) =>
                  props.onRowChange?.(props.rowIndex, (row) => ({
                    ...row,
                    amountCells: row.amountCells.map((amountCell, index) =>
                      index === amountIndex ? { ...amountCell, value: event.target.value } : amountCell
                    )
                  }))
                }
                placeholder="Texto variable"
              />
            )}

            {cell.rowSpan > 1 ? (
              <span className="quote-template-merge-badge">Abarca {cell.rowSpan} conceptos</span>
            ) : null}

            <TemplateCellMergeControls
              disabled={props.readOnly}
              canMergeUp={props.rowIndex > 0}
              canMergeDown={props.rowIndex < props.rows.length - 1}
              canUnmerge={cell.rowSpan > 1}
              onMergeUp={() => props.onMerge?.("up", "amount", props.rowIndex, amountIndex)}
              onMergeDown={() => props.onMerge?.("down", "amount", props.rowIndex, amountIndex)}
              onUnmerge={() => props.onUnmerge?.("amount", props.rowIndex, amountIndex)}
            />
          </>
        ) : (
          <div className="quote-template-merged-note">{getMergedCaption(props.rows, props.rowIndex, "amount", amountIndex)}</div>
        )}
      </div>
    );
  }

  const paymentCell = props.row.paymentMoment;
  const paymentIsMaster = !paymentCell.hidden;
  const notesCell = props.row.notesCell;
  const notesIsMaster = !notesCell.hidden;

  return (
    <article className="quote-template-row-card">
      <div className="quote-template-row-head">
        <div>
          <p className="eyebrow">Sin titulo</p>
          <h3>{getTemplateRowLabel(props.rowIndex)}</h3>
        </div>
        <div className="quote-template-row-actions">
          {!props.readOnly ? (
            <>
              <button type="button" className="secondary-button" onClick={() => props.onInsertAfter?.(props.rowIndex)}>
                + Concepto
              </button>
              <button type="button" className="danger-button" onClick={() => props.onRemove?.(props.rowIndex)}>
                Quitar
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="quote-template-row-grid">
        <label className="form-field quote-template-field quote-template-field-wide">
          <span>Conceptos</span>
          <textarea
            rows={3}
            value={props.row.conceptDescription}
            readOnly={props.readOnly}
            onChange={(event) =>
              props.onRowChange?.(props.rowIndex, (row) => ({
                ...row,
                conceptDescription: event.target.value
              }))
            }
            placeholder="Describe el alcance o concepto de este servicio"
          />
          <label className="quote-template-checkbox quote-template-tax-checkbox">
            <input
              type="checkbox"
              checked={Boolean(props.row.excludeFromIva)}
              disabled={props.readOnly}
              onChange={(event) =>
                props.onRowChange?.(props.rowIndex, (row) => ({
                  ...row,
                  excludeFromIva: event.target.checked
                }))
              }
            />
            <span>No cuenta para IVA</span>
          </label>
        </label>

        {renderAmountField(0)}
        {renderAmountField(1)}

        <div className="quote-template-field">
          <div className="quote-template-field-head">
            <span>Momento de pago</span>
            <small>Fusionable</small>
          </div>

          {paymentIsMaster ? (
            <>
              <textarea
                rows={3}
                value={paymentCell.value}
                readOnly={props.readOnly}
                onChange={(event) =>
                  props.onRowChange?.(props.rowIndex, (row) => ({
                    ...row,
                    paymentMoment: {
                      ...row.paymentMoment,
                      value: event.target.value
                    }
                  }))
                }
                placeholder="Ej. Anticipo, contra entrega, parcialidad"
              />

              {paymentCell.rowSpan > 1 ? (
                <span className="quote-template-merge-badge">Abarca {paymentCell.rowSpan} conceptos</span>
              ) : null}

              <TemplateCellMergeControls
                disabled={props.readOnly}
                canMergeUp={props.rowIndex > 0}
                canMergeDown={props.rowIndex < props.rows.length - 1}
                canUnmerge={paymentCell.rowSpan > 1}
                onMergeUp={() => props.onMerge?.("up", "payment", props.rowIndex)}
                onMergeDown={() => props.onMerge?.("down", "payment", props.rowIndex)}
                onUnmerge={() => props.onUnmerge?.("payment", props.rowIndex)}
              />
            </>
          ) : (
            <div className="quote-template-merged-note">{getMergedCaption(props.rows, props.rowIndex, "payment")}</div>
          )}
        </div>

        <div className="quote-template-field">
          <div className="quote-template-field-head">
            <span>Notas</span>
            <small>Fusionable</small>
          </div>

          {notesIsMaster ? (
            <>
              <textarea
                rows={3}
                value={notesCell.value}
                readOnly={props.readOnly}
                onChange={(event) =>
                  props.onRowChange?.(props.rowIndex, (row) => ({
                    ...row,
                    notesCell: {
                      ...row.notesCell,
                      value: event.target.value
                    }
                  }))
                }
                placeholder="Texto libre"
              />

              {notesCell.rowSpan > 1 ? (
                <span className="quote-template-merge-badge">Abarca {notesCell.rowSpan} conceptos</span>
              ) : null}

              <TemplateCellMergeControls
                disabled={props.readOnly}
                canMergeUp={props.rowIndex > 0}
                canMergeDown={props.rowIndex < props.rows.length - 1}
                canUnmerge={notesCell.rowSpan > 1}
                onMergeUp={() => props.onMerge?.("up", "notes", props.rowIndex)}
                onMergeDown={() => props.onMerge?.("down", "notes", props.rowIndex)}
                onUnmerge={() => props.onUnmerge?.("notes", props.rowIndex)}
              />
            </>
          ) : (
            <div className="quote-template-merged-note">{getMergedCaption(props.rows, props.rowIndex, "notes")}</div>
          )}
        </div>
      </div>
    </article>
  );
}

export function QuotesPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("new-template");
  const [sourceMode, setSourceMode] = useState<QuoteSourceMode>("template");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<QuoteDownloadFormat | null>(null);
  const [savedQuoteDownload, setSavedQuoteDownload] = useState<SavedQuoteDownloadState>(null);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [translatingTemplateId, setTranslatingTemplateId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [viewingQuote, setViewingQuote] = useState<Quote | null>(null);
  const [quotePendingDelete, setQuotePendingDelete] = useState<Quote | null>(null);
  const [templatePendingDelete, setTemplatePendingDelete] = useState<QuoteTemplate | null>(null);
  const [preparedQuote, setPreparedQuote] = useState<Quote | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState<QuoteTemplateFormState>(() => buildEmptyTemplateForm(user?.team));
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>(() => buildEmptyQuoteForm(user?.team));
  const [quoteTemplateDraft, setQuoteTemplateDraft] = useState<QuoteTemplateDraftState | null>(null);
  const [templateWordSearch, setTemplateWordSearch] = useState("");
  const [templateTeamSearch, setTemplateTeamSearch] = useState("");
  const [quoteWordSearch, setQuoteWordSearch] = useState("");
  const [quoteClientSearch, setQuoteClientSearch] = useState("");

  useEffect(() => {
    void loadBoard();
  }, []);

  async function loadBoard() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [quoteRows, templateRows, clientRows] = await Promise.all([
        apiGet<Quote[]>("/quotes"),
        apiGet<QuoteTemplate[]>("/quotes/templates"),
        apiGet<Client[]>("/clients")
      ]);

      setQuotes(sortQuotes(quoteRows));
      setTemplates(sortTemplates(templateRows));
      setClients([...clientRows].sort((left, right) => left.name.localeCompare(right.name, "es-MX")));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  function updateTemplateRow(rowIndex: number, updater: (row: QuoteTemplateTableRow) => QuoteTemplateTableRow) {
    setTemplateForm((current) => ({
      ...current,
      tableRows: current.tableRows.map((row, index) => (index === rowIndex ? updater(row) : row))
    }));
  }

  function updateQuoteForm(next: QuoteFormState | ((current: QuoteFormState) => QuoteFormState)) {
    setPreparedQuote(null);
    setQuoteForm((current) => (typeof next === "function" ? next(current) : next));
  }

  function updateQuoteTemplateDraft(
    next:
      | QuoteTemplateDraftState
      | null
      | ((current: QuoteTemplateDraftState) => QuoteTemplateDraftState)
  ) {
    setPreparedQuote(null);
    setQuoteTemplateDraft((current) => {
      if (typeof next !== "function") {
        return next;
      }

      if (!current) {
        return current;
      }

      return next(current);
    });
  }

  function resetQuoteComposer(nextMode: QuoteSourceMode = sourceMode) {
    const template = nextMode === "template" ? templates.find((item) => item.id === selectedTemplateId) : undefined;
    setEditingQuoteId(null);
    setPreparedQuote(null);
    setQuoteForm(template ? buildQuoteFormFromTemplate(template, user?.team) : buildEmptyQuoteForm(user?.team));
    setQuoteTemplateDraft(
      nextMode === "generic"
        ? buildEmptyQuoteTemplateDraft()
        : template
          ? buildQuoteTemplateDraftFromTemplate(template)
          : null
    );
  }

  function startNewTemplate() {
    setFlash(null);
    setEditingTemplateId(null);
    setTemplateForm(buildEmptyTemplateForm(user?.team));
    setActiveTab("new-template");
  }

  function applyTemplateToQuoteForm(template: QuoteTemplate, language: QuoteTemplateLanguage = "es") {
    setSourceMode("template");
    setSelectedTemplateId(template.id);
    updateQuoteForm(buildQuoteFormFromTemplate(template, user?.team, language));
    updateQuoteTemplateDraft(buildQuoteTemplateDraftFromTemplate(template));
  }

  async function handleTemplateUse(template: QuoteTemplate, language: QuoteTemplateLanguage) {
    setFlash(null);
    setEditingQuoteId(null);
    setPreparedQuote(null);

    if (language === "en") {
      setTranslatingTemplateId(template.id);

      try {
        const response = await apiPost<QuoteTemplateTranslationResponse>("/quotes/templates/translate", { template });
        window.alert("La plantilla fue traducida exitosamente.");
        applyTemplateToQuoteForm(response.template, "en");
        setActiveTab("new-quote-template");
      } catch (error) {
        window.alert("La plantilla no pudo ser traducida.");
        setFlash({
          tone: "error",
          text: `La plantilla no pudo ser traducida. ${toErrorMessage(error)}`
        });
      } finally {
        setTranslatingTemplateId(null);
      }

      return;
    }

    applyTemplateToQuoteForm(template, language);
    setActiveTab("new-quote-template");
  }

  function handleTemplateEdit(template: QuoteTemplate) {
    setFlash(null);
    setEditingTemplateId(template.id);
    setTemplateForm(buildTemplateFormFromTemplate(template));
    setActiveTab("new-template");
  }

  function handleTemplateDeleteRequest(template: QuoteTemplate) {
    setFlash(null);
    setTemplatePendingDelete(template);
  }

  function handleQuoteView(quote: Quote) {
    setViewingQuote(quote);
  }

  function handleQuoteEdit(quote: Quote) {
    setFlash(null);
    setEditingQuoteId(quote.id);
    setPreparedQuote(null);
    setSourceMode("generic");
    setSelectedTemplateId("");
    setQuoteForm(buildQuoteFormFromQuote(quote));
    setQuoteTemplateDraft(buildQuoteTemplateDraftFromQuote(quote));
    setActiveTab("new-quote-generic");
  }

  function handleQuoteDeleteRequest(quote: Quote) {
    setFlash(null);
    setQuotePendingDelete(quote);
  }

  async function handleQuoteDeleteConfirm() {
    if (!quotePendingDelete) {
      return;
    }

    const quoteId = quotePendingDelete.id;
    const quoteNumber = quotePendingDelete.quoteNumber;
    setDeletingQuoteId(quoteId);

    try {
      await apiDelete(`/quotes/${quoteId}`);
      setQuotes((current) => current.filter((quote) => quote.id !== quoteId));
      setViewingQuote((current) => (current?.id === quoteId ? null : current));

      if (editingQuoteId === quoteId) {
        setEditingQuoteId(null);
        setPreparedQuote(null);
        setQuoteForm(buildEmptyQuoteForm(user?.team));
        setQuoteTemplateDraft(null);
      }

      if (preparedQuote?.id === quoteId) {
        setPreparedQuote(null);
      }

      setQuotePendingDelete(null);
      setFlash({
        tone: "success",
        text: `La cotizacion ${quoteNumber} fue eliminada correctamente.`
      });
    } catch (error) {
      setFlash({
        tone: "error",
        text: toErrorMessage(error)
      });
    } finally {
      setDeletingQuoteId(null);
    }
  }

  async function handleTemplateDeleteConfirm() {
    if (!templatePendingDelete) {
      return;
    }

    const templateId = templatePendingDelete.id;
    const templateNumber = templatePendingDelete.templateNumber;
    setDeletingTemplateId(templateId);

    try {
      await apiDelete(`/quotes/templates/${templateId}`);
      setTemplates((current) => current.filter((template) => template.id !== templateId));
      setExpandedTemplateId((current) => (current === templateId ? null : current));
      setSelectedTemplateId((current) => (current === templateId ? "" : current));

      if (editingTemplateId === templateId) {
        setEditingTemplateId(null);
        setTemplateForm(buildEmptyTemplateForm(user?.team));
      }

      setTemplatePendingDelete(null);
      setFlash({
        tone: "success",
        text: `La cotizacion tipo ${templateNumber} fue eliminada correctamente.`
      });
    } catch (error) {
      setFlash({
        tone: "error",
        text: toErrorMessage(error)
      });
    } finally {
      setDeletingTemplateId(null);
    }
  }

  function handleSourceModeChange(nextMode: QuoteSourceMode) {
    setSourceMode(nextMode);
    setFlash(null);
    setEditingQuoteId(null);
    setPreparedQuote(null);

    if (nextMode === "generic") {
      setSelectedTemplateId("");
      setQuoteForm(buildEmptyQuoteForm(user?.team));
      setQuoteTemplateDraft(buildEmptyQuoteTemplateDraft());
      return;
    }

    if (!selectedTemplateId) {
      setQuoteForm(buildEmptyQuoteForm(user?.team));
      setQuoteTemplateDraft(null);
      return;
    }

    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template) {
      setQuoteForm(buildEmptyQuoteForm(user?.team));
      setQuoteTemplateDraft(null);
      return;
    }

    setQuoteForm(buildQuoteFormFromTemplate(template, user?.team));
    setQuoteTemplateDraft(buildQuoteTemplateDraftFromTemplate(template));
  }

  function handleQuoteComposerTab(nextMode: QuoteSourceMode) {
    handleSourceModeChange(nextMode);
    setActiveTab(nextMode === "template" ? "new-quote-template" : "new-quote-generic");
  }

  function handleGenericQuoteLanguageChange(language: QuoteLanguage) {
    updateQuoteForm((current) => ({
      ...current,
      language
    }));
  }

  function handleTemplateSelection(templateId: string) {
    setSelectedTemplateId(templateId);
    setEditingQuoteId(null);
    setPreparedQuote(null);
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setQuoteForm(buildEmptyQuoteForm(user?.team));
      setQuoteTemplateDraft(null);
      return;
    }

    setQuoteForm(buildQuoteFormFromTemplate(template, user?.team));
    setQuoteTemplateDraft(buildQuoteTemplateDraftFromTemplate(template));
  }

  function handleClientSelection(clientId: string) {
    const client = clients.find((item) => item.id === clientId);
    updateQuoteForm((current) => ({
      ...current,
      clientId,
      clientName: client?.name ?? ""
    }));
  }

  function updateQuoteTemplateRow(rowIndex: number, updater: (row: QuoteTemplateTableRow) => QuoteTemplateTableRow) {
    updateQuoteTemplateDraft((current) => ({
      ...current,
      tableRows: current.tableRows.map((row, index) => (index === rowIndex ? updater(row) : row))
    }));
  }

  function handleQuoteTemplateMerge(direction: "up" | "down", kind: MergeTargetKind, rowIndex: number, amountIndex?: 0 | 1) {
    updateQuoteTemplateDraft((current) => ({
      ...current,
      tableRows:
        direction === "up"
          ? mergeTemplateCellUp(current.tableRows, rowIndex, kind, amountIndex ?? 0)
          : mergeTemplateCellDown(current.tableRows, rowIndex, kind, amountIndex ?? 0)
    }));
  }

  function handleQuoteTemplateUnmerge(kind: MergeTargetKind, rowIndex: number, amountIndex?: 0 | 1) {
    updateQuoteTemplateDraft((current) => ({
      ...current,
      tableRows: unmergeTemplateCell(current.tableRows, rowIndex, kind, amountIndex ?? 0)
    }));
  }

  function handleMerge(direction: "up" | "down", kind: MergeTargetKind, rowIndex: number, amountIndex?: 0 | 1) {
    setTemplateForm((current) => ({
      ...current,
      tableRows:
        direction === "up"
          ? mergeTemplateCellUp(current.tableRows, rowIndex, kind, amountIndex ?? 0)
          : mergeTemplateCellDown(current.tableRows, rowIndex, kind, amountIndex ?? 0)
    }));
  }

  function handleUnmerge(kind: MergeTargetKind, rowIndex: number, amountIndex?: 0 | 1) {
    setTemplateForm((current) => ({
      ...current,
      tableRows: unmergeTemplateCell(current.tableRows, rowIndex, kind, amountIndex ?? 0)
    }));
  }

  async function persistQuoteIfNeeded() {
    if (!quoteForm.clientId) {
      throw new Error("Selecciona el cliente para guardar la cotizacion.");
    }

    const client = clients.find((entry) => entry.id === quoteForm.clientId);
    if (!client) {
      throw new Error("No se encontro el cliente seleccionado.");
    }

    if (sourceMode === "template" && !quoteTemplateDraft) {
      throw new Error("Selecciona una cotizacion tipo para generar esta cotizacion.");
    }

    const lineItems = quoteTemplateDraft
      ? buildLineItemsFromTemplateDraft(quoteTemplateDraft)
      : buildLineItemsPayload(quoteForm.lineItems);

    const payload = {
      clientId: client.id,
      clientName: client.name,
      responsibleTeam: quoteForm.responsibleTeam || undefined,
      subject: normalizeText(quoteForm.subject),
      status: quoteForm.status,
      quoteType: quoteForm.quoteType,
      language: quoteForm.language,
      quoteDate: quoteForm.quoteDate || getTodayDateInputValue(),
      amountColumns: quoteTemplateDraft?.amountColumns,
      tableRows: quoteTemplateDraft?.tableRows,
      lineItems,
      milestone: normalizeText(quoteForm.milestone) || undefined,
      notes: normalizeText(quoteForm.notes) || undefined
    };

    if (payload.subject.length < 3) {
      throw new Error("El asunto debe tener al menos 3 caracteres.");
    }

    if (editingQuoteId) {
      const updatedQuote = await apiPatch<Quote>(`/quotes/${editingQuoteId}`, payload);
      setQuotes((current) => sortQuotes(current.map((quote) => (quote.id === updatedQuote.id ? updatedQuote : quote))));
      setViewingQuote((current) => (current?.id === updatedQuote.id ? updatedQuote : current));
      return updatedQuote;
    }

    if (preparedQuote) {
      return preparedQuote;
    }

    const createdQuote = await apiPost<Quote>("/quotes", payload);
    setQuotes((current) => sortQuotes([createdQuote, ...current]));
    setEditingQuoteId(createdQuote.id);
    setPreparedQuote(createdQuote);
    return createdQuote;
  }

  async function handleTemplateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTemplate(true);
    setFlash(null);

    try {
      if (!templateForm.team) {
        throw new Error("Selecciona el equipo al que pertenece la cotizacion tipo.");
      }

      if (normalizeText(templateForm.services).length < 2) {
        throw new Error("Agrega el texto libre de servicios para la cotizacion tipo.");
      }

      if (templateForm.tableRows.length === 0) {
        throw new Error("Agrega al menos un concepto a la tabla de la cotizacion tipo.");
      }

      const payload = buildTemplatePayload(templateForm);
      const savedTemplate = editingTemplateId
        ? await apiPatch<QuoteTemplate>(`/quotes/templates/${editingTemplateId}`, payload)
        : await apiPost<QuoteTemplate>("/quotes/templates", payload);

      setTemplates((current) =>
        sortTemplates(
          editingTemplateId
            ? current.map((template) => (template.id === savedTemplate.id ? savedTemplate : template))
            : [savedTemplate, ...current]
        )
      );

      if (selectedTemplateId === savedTemplate.id && sourceMode === "template") {
        applyTemplateToQuoteForm(savedTemplate);
      }

      setEditingTemplateId(null);
      setExpandedTemplateId(savedTemplate.id);
      setTemplateForm(buildEmptyTemplateForm(user?.team));
      setFlash({
        tone: "success",
        text: editingTemplateId
          ? `La cotizacion tipo ${savedTemplate.templateNumber} se actualizo correctamente.`
          : `La cotizacion tipo ${savedTemplate.templateNumber} ya quedo guardada y disponible para reutilizarse.`
      });
      setActiveTab("templates");
    } catch (error) {
      setFlash({
        tone: "error",
        text: toErrorMessage(error)
      });
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleQuoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingQuote(true);
    setFlash(null);

    try {
      const isEditing = Boolean(editingQuoteId);
      const savedQuote = await persistQuoteIfNeeded();

      const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
      setEditingQuoteId(null);
      setPreparedQuote(null);
      setQuoteForm(
        sourceMode === "template" && selectedTemplate
          ? buildQuoteFormFromTemplate(selectedTemplate, user?.team)
          : buildEmptyQuoteForm(user?.team)
      );
      setQuoteTemplateDraft(
        sourceMode === "template" && selectedTemplate
          ? buildQuoteTemplateDraftFromTemplate(selectedTemplate)
          : buildEmptyQuoteTemplateDraft()
      );

      setFlash({
        tone: "success",
        text: isEditing
          ? `La cotizacion ${savedQuote.quoteNumber} se actualizo correctamente.`
          : `La cotizacion ${savedQuote.quoteNumber} ya quedo guardada para ${savedQuote.clientName}.`
      });
      setActiveTab("quotes");
    } catch (error) {
      setFlash({
        tone: "error",
        text: toErrorMessage(error)
      });
    } finally {
      setSavingQuote(false);
    }
  }

  async function handleQuoteDownload(format: QuoteDownloadFormat) {
    setExportingFormat(format);
    setFlash(null);

    try {
      const quote = await persistQuoteIfNeeded();
      const { blob, filename } = await apiDownload(`/quotes/${quote.id}/export/${format}`);
      downloadBlobFile(blob, filename ?? `${quote.quoteNumber}.${format === "pdf" ? "pdf" : "docx"}`);
      setFlash({
        tone: "success",
        text: `La cotizacion ${quote.quoteNumber} se descargo en ${format === "pdf" ? "PDF" : "Word"}.`
      });
    } catch (error) {
      setFlash({
        tone: "error",
        text: toErrorMessage(error)
      });
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleSavedQuoteDownload(quote: Quote, format: QuoteDownloadFormat) {
    setSavedQuoteDownload({ quoteId: quote.id, format });
    setFlash(null);

    try {
      const { blob, filename } = await apiDownload(`/quotes/${quote.id}/export/${format}`);
      downloadBlobFile(blob, filename ?? `${quote.quoteNumber}.${format === "pdf" ? "pdf" : "docx"}`);
      setFlash({
        tone: "success",
        text: `La cotizacion ${quote.quoteNumber} se descargo en ${format === "pdf" ? "PDF" : "Word"}.`
      });
    } catch (error) {
      setFlash({
        tone: "error",
        text: toErrorMessage(error)
      });
    } finally {
      setSavedQuoteDownload(null);
    }
  }

  const filteredTemplates = filterTemplatesForSearch(templates, templateWordSearch, templateTeamSearch);
  const filteredQuotes = filterQuotesForSearch(quotes, clients, quoteWordSearch, quoteClientSearch);
  const templateGroups = groupTemplatesByTeam(filteredTemplates);
  const quoteGroups = groupQuotesByClient(filteredQuotes, clients);
  const editingQuote = quotes.find((item) => item.id === editingQuoteId);
  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
  const editingTemplate = templates.find((item) => item.id === editingTemplateId);
  const viewingQuoteDraft = viewingQuote ? buildQuoteTemplateDraftFromQuote(viewingQuote) : null;
  const suggestedQuoteNumber = editingQuote?.quoteNumber ?? preparedQuote?.quoteNumber ?? buildNextQuoteNumber(quotes);
  const suggestedTemplateNumber = buildNextTemplateNumber(templates);
  const templateFormNumber = editingTemplate?.templateNumber ?? suggestedTemplateNumber;

  return (
    <section className="page-stack quotes-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Cot
          </span>
          <div>
            <h2>Cotizaciones</h2>
          </div>
        </div>
        <p className="muted">
          El modulo ahora separa cotizaciones tipo por equipo, permite guardarlas como plantillas reutilizables y
          mantiene la consulta de cotizaciones guardadas por cliente.
        </p>
      </header>

      <section className="panel">
        <div className="leads-tabs" role="tablist" aria-label="Vistas de cotizaciones">
          <button type="button" className={`lead-tab ${activeTab === "new-template" ? "is-active" : ""}`} onClick={startNewTemplate}>
            1. Guardar nueva tipo
          </button>
          <button type="button" className={`lead-tab ${activeTab === "templates" ? "is-active" : ""}`} onClick={() => setActiveTab("templates")}>
            2. Cotizaciones tipo
          </button>
          <button type="button" className={`lead-tab ${activeTab === "quotes" ? "is-active" : ""}`} onClick={() => setActiveTab("quotes")}>
            3. Cotizaciones por cliente
          </button>
          <button type="button" className={`lead-tab ${activeTab === "new-quote-template" ? "is-active" : ""}`} onClick={() => handleQuoteComposerTab("template")}>
            4. Generar nueva desde plantilla
          </button>
          <button type="button" className={`lead-tab ${activeTab === "new-quote-generic" ? "is-active" : ""}`} onClick={() => handleQuoteComposerTab("generic")}>
            5. Generar nueva desde plantilla en blanco (no se guarda la plantilla)
          </button>
        </div>
      </section>

      {flash ? <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>{flash.text}</div> : null}
      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      {loading ? (
        <section className="panel">
          <div className="centered-inline-message">Cargando modulo de cotizaciones...</div>
        </section>
      ) : null}

      {!loading && activeTab === "templates" ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Cotizaciones tipo</h2>
              <span>{filteredTemplates.length} plantillas</span>
            </div>

            <div className="matters-toolbar execution-search-toolbar">
              <div className="matters-filters leads-search-filters matters-active-search-filters execution-search-filters">
                <label className="form-field matters-search-field">
                  <span>Buscar por palabra</span>
                  <input
                    type="text"
                    value={templateWordSearch}
                    onChange={(event) => setTemplateWordSearch(event.target.value)}
                    placeholder="No., servicios, concepto, hito..."
                  />
                </label>

                <label className="form-field matters-search-field">
                  <span>Buscador por equipo</span>
                  <input
                    type="text"
                    value={templateTeamSearch}
                    onChange={(event) => setTemplateTeamSearch(event.target.value)}
                    placeholder="Buscar palabra del equipo..."
                  />
                </label>
              </div>

              <div className="matters-toolbar-actions">
                <span className="muted">Filtra por equipo o por contenido para encontrar una plantilla reutilizable.</span>
              </div>
            </div>
          </section>

          {templates.length === 0 ? (
            <section className="panel">
              <div className="centered-inline-message">Aun no hay cotizaciones tipo guardadas.</div>
            </section>
          ) : templateGroups.length === 0 ? (
            <section className="panel">
              <div className="centered-inline-message">No hay cotizaciones tipo que coincidan con la busqueda.</div>
            </section>
          ) : (
            templateGroups.map((group) => (
              <section key={group.team} className="panel">
                <div className="panel-header">
                  <h2>{group.label}</h2>
                  <span>{group.items.length} plantillas</span>
                </div>

                <div className="quotes-template-list">
                  {group.items.map((template) => {
                    const isExpanded = expandedTemplateId === template.id;

                    return (
                      <article key={template.id} className={`quotes-template-list-item ${isExpanded ? "is-expanded" : ""}`}>
                        <div className="quotes-template-list-row">
                          <div className="quotes-template-list-main">
                            <div className="quotes-template-list-head">
                              <div>
                                <p className="eyebrow">Cotizacion tipo</p>
                                <h3>{template.templateNumber}</h3>
                              </div>
                              <span className={`lead-type-pill ${template.quoteType === "RETAINER" ? "is-retainer" : ""}`}>
                                {getQuoteTypeLabel(template.quoteType)}
                              </span>
                            </div>

                            <p className="quotes-template-list-subject">{normalizeText(template.subject) || "Sin titulo"}</p>
                            <p className="quotes-template-list-summary">{summarizeTemplateServices(template.services)}</p>

                            <div className="quotes-template-list-meta">
                              <span>{template.tableRows.length} conceptos</span>
                              <span>Total: {getTemplateAmountPreview(template)}</span>
                              <span>Hito: {template.milestone || "-"}</span>
                              <span>Actualizada: {formatDate(template.updatedAt)}</span>
                            </div>
                          </div>

                          <div className="quotes-template-list-actions">
                            <button
                              type="button"
                              className="secondary-button"
                              aria-expanded={isExpanded}
                              aria-controls={`template-preview-${template.id}`}
                              onClick={() => setExpandedTemplateId((current) => (current === template.id ? null : template.id))}
                            >
                              {isExpanded ? "Ocultar" : "Ver"}
                            </button>
                            <button type="button" className="secondary-button" onClick={() => handleTemplateEdit(template)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="danger-button"
                              disabled={deletingTemplateId === template.id}
                              onClick={() => handleTemplateDeleteRequest(template)}
                            >
                              Borrar
                            </button>
                            <button
                              type="button"
                              className="primary-button"
                              disabled={translatingTemplateId === template.id}
                              onClick={() => void handleTemplateUse(template, "es")}
                            >
                              Usar plantilla en español
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={translatingTemplateId === template.id}
                              onClick={() => void handleTemplateUse(template, "en")}
                            >
                              {translatingTemplateId === template.id ? "Traduciendo..." : "Usar plantilla en inglés"}
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div id={`template-preview-${template.id}`} className="quotes-template-detail">
                            <TemplateVisualPreview
                              heading="Vista previa"
                              templateNumber={template.templateNumber}
                              team={template.team}
                              quoteType={template.quoteType}
                              milestone={template.milestone}
                              services={template.services}
                              amountColumns={template.amountColumns}
                              tableRows={template.tableRows}
                            />
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </>
      ) : null}

      {!loading && activeTab === "new-template" ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>{editingTemplate ? `Editar cotizacion tipo ${editingTemplate.templateNumber}` : "Guardar nueva cotizacion tipo"}</h2>
              {editingTemplate ? <p className="muted">Los cambios se guardaran sobre la plantilla existente.</p> : null}
            </div>
            <button type="button" className="secondary-button" onClick={startNewTemplate}>
              {editingTemplate ? "Cancelar edicion" : "Limpiar formulario"}
            </button>
          </div>

          <form className="quotes-form" onSubmit={handleTemplateSubmit}>
            <div className="quotes-form-grid quote-template-meta-grid">
              <label className="form-field">
                <span>Equipo</span>
                <select value={templateForm.team} onChange={(event) => setTemplateForm((current) => ({ ...current, team: event.target.value as Team | "" }))}>
                  <option value="">Seleccionar...</option>
                  {QUOTE_TEAM_OPTIONS.map((team) => (
                    <option key={team.key} value={team.key}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Numero de cotizacion</span>
                <input type="text" value={templateFormNumber} readOnly />
              </label>

              <label className="form-field">
                <span>Tipo de cotizacion</span>
                <select value={templateForm.quoteType} onChange={(event) => setTemplateForm((current) => ({ ...current, quoteType: event.target.value as QuoteType }))}>
                  <option value="ONE_TIME">Asunto unico</option>
                  <option value="RETAINER">Iguala</option>
                </select>
              </label>

              <label className="form-field">
                <span>Hito de conclusion</span>
                <input type="text" value={templateForm.milestone} onChange={(event) => setTemplateForm((current) => ({ ...current, milestone: event.target.value }))} placeholder="Ej. Firma, entrega, cierre, aprobacion" />
              </label>
            </div>

            <label className="form-field">
              <span>Servicios</span>
              <textarea rows={4} value={templateForm.services} onChange={(event) => setTemplateForm((current) => ({ ...current, services: event.target.value }))} placeholder="Texto libre para describir el servicio o alcance de la cotizacion tipo" />
            </label>

            <section className="quote-template-sheet">
              <div className="panel-header quote-template-sheet-head">
                <div>
                  <h3>Sin titulo</h3>
                  <p className="muted">Los conceptos se capturan como bloques independientes. Puedes fusionar monto, momento de pago y notas entre conceptos contiguos.</p>
                </div>
              </div>

              <div className="quote-template-amount-config-grid">
                <TemplateAmountColumnConfig
                  column={templateForm.amountColumns[0]}
                  onModeChange={(mode) =>
                    setTemplateForm((current) => ({
                      ...current,
                      amountColumns: [{ ...current.amountColumns[0], mode }, current.amountColumns[1]]
                    }))
                  }
                />
                <TemplateAmountColumnConfig
                  column={templateForm.amountColumns[1]}
                  secondary
                  onToggleSecondary={(enabled) =>
                    setTemplateForm((current) => ({
                      ...current,
                      amountColumns: [
                        current.amountColumns[0],
                        { ...current.amountColumns[1], enabled }
                      ],
                      tableRows: enabled ? current.tableRows : resetSecondaryAmountColumn(current.tableRows)
                    }))
                  }
                  onModeChange={(mode) =>
                    setTemplateForm((current) => ({
                      ...current,
                      amountColumns: [current.amountColumns[0], { ...current.amountColumns[1], mode }]
                    }))
                  }
                />
              </div>

              <div className="quote-template-rows-shell">
                {templateForm.tableRows.map((row, rowIndex) => (
                  <TemplateConceptCard
                    key={row.id}
                    row={row}
                    rowIndex={rowIndex}
                    rows={templateForm.tableRows}
                    amountColumns={templateForm.amountColumns}
                    onRowChange={updateTemplateRow}
                    onInsertAfter={(index) =>
                      setTemplateForm((current) => ({
                        ...current,
                        tableRows: insertTemplateRowAfter(current.tableRows, index)
                      }))
                    }
                    onRemove={(index) =>
                      setTemplateForm((current) => ({
                        ...current,
                        tableRows: removeTemplateRow(current.tableRows, index)
                      }))
                    }
                    onMerge={handleMerge}
                    onUnmerge={handleUnmerge}
                  />
                ))}
              </div>

              <TemplateSummaryGrid amountColumns={templateForm.amountColumns} tableRows={templateForm.tableRows} />
            </section>

            <TemplateVisualPreview
              heading="Preview visual"
              templateNumber={templateFormNumber}
              team={templateForm.team}
              quoteType={templateForm.quoteType}
              milestone={templateForm.milestone}
              services={templateForm.services}
              amountColumns={templateForm.amountColumns}
              tableRows={templateForm.tableRows}
            />

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={savingTemplate}>
                {savingTemplate ? "Guardando..." : editingTemplate ? "Guardar cambios" : "Guardar cotizacion tipo"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {!loading && activeTab === "quotes" ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <h2>Cotizaciones por cliente</h2>
              <span>{filteredQuotes.length} registros</span>
            </div>

            <div className="matters-toolbar execution-search-toolbar">
              <div className="matters-filters leads-search-filters matters-active-search-filters execution-search-filters">
                <label className="form-field matters-search-field">
                  <span>Buscar por palabra</span>
                  <input
                    type="text"
                    value={quoteWordSearch}
                    onChange={(event) => setQuoteWordSearch(event.target.value)}
                    placeholder="No., asunto, equipo, hito, concepto..."
                  />
                </label>

                <label className="form-field matters-search-field">
                  <span>Buscador por cliente</span>
                  <input
                    type="text"
                    value={quoteClientSearch}
                    onChange={(event) => setQuoteClientSearch(event.target.value)}
                    placeholder="Buscar palabra del cliente..."
                  />
                </label>
              </div>

              <div className="matters-toolbar-actions">
                <span className="muted">Filtra por cliente y por contenido de la cotizacion antes de abrirla o descargarla.</span>
              </div>
            </div>
          </section>

          {quotes.length === 0 ? (
            <section className="panel">
              <div className="centered-inline-message">Todavia no hay cotizaciones guardadas.</div>
            </section>
          ) : quoteGroups.length === 0 ? (
            <section className="panel">
              <div className="centered-inline-message">No hay cotizaciones que coincidan con la busqueda.</div>
            </section>
          ) : (
            quoteGroups.map((group) => (
              <section key={group.clientId ?? group.clientName} className="panel">
                <div className="panel-header">
                  <div>
                    <h2>{group.clientName}</h2>
                    <p className="muted">{group.clientNumber ? `No. cliente ${group.clientNumber}` : "Cliente sin numero ligado"}</p>
                  </div>
                  <span>
                    {group.items.length} cotizaciones | {formatCurrency(group.totalMxn)}
                  </span>
                </div>

                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>No. cotizacion</th>
                        <th>Fecha</th>
                        <th>Tipo de cotizacion</th>
                        <th>Equipo</th>
                        <th>Asunto</th>
                        <th>Total</th>
                        <th>Hito de conclusion</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((quote) => {
                        const isDownloadingSavedQuote = savedQuoteDownload?.quoteId === quote.id;

                        return (
                          <tr key={quote.id}>
                            <td>{quote.quoteNumber}</td>
                            <td>{formatDate(getQuoteDisplayDate(quote))}</td>
                            <td>{getQuoteTypeLabel(quote.quoteType)}</td>
                            <td>{getTeamLabel(quote.responsibleTeam)}</td>
                            <td>{quote.subject}</td>
                            <td>{formatCurrency(quote.totalMxn)}</td>
                            <td>{quote.milestone || "-"}</td>
                            <td>
                              <div className="quotes-table-actions">
                                <button type="button" className="secondary-button" onClick={() => handleQuoteView(quote)}>
                                  Ver
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={isDownloadingSavedQuote}
                                  onClick={() => void handleSavedQuoteDownload(quote, "pdf")}
                                >
                                  {savedQuoteDownload?.quoteId === quote.id && savedQuoteDownload.format === "pdf" ? "PDF..." : "PDF"}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={isDownloadingSavedQuote}
                                  onClick={() => void handleSavedQuoteDownload(quote, "word")}
                                >
                                  {savedQuoteDownload?.quoteId === quote.id && savedQuoteDownload.format === "word" ? "Word..." : "Word"}
                                </button>
                                <button type="button" className="secondary-button" onClick={() => handleQuoteEdit(quote)}>
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="danger-button"
                                  disabled={deletingQuoteId === quote.id}
                                  onClick={() => handleQuoteDeleteRequest(quote)}
                                >
                                  Borrar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </>
      ) : null}

      {!loading && (activeTab === "new-quote-template" || activeTab === "new-quote-generic") ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>
                {editingQuote
                  ? `Editar cotizacion ${editingQuote.quoteNumber}`
                  : sourceMode === "template"
                    ? "Generar nueva desde plantilla"
                    : "Generar nueva desde plantilla en blanco"}
              </h2>
              {editingQuote ? <p className="muted">Los cambios se guardaran sobre la cotizacion existente.</p> : null}
            </div>
            {editingQuote ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditingQuoteId(null);
                  setPreparedQuote(null);
                  setSourceMode("template");
                  setSelectedTemplateId("");
                  setQuoteForm(buildEmptyQuoteForm(user?.team));
                  setQuoteTemplateDraft(null);
                  setActiveTab("quotes");
                }}
              >
                Cancelar edicion
              </button>
            ) : (
              <button type="button" className="secondary-button" onClick={() => resetQuoteComposer()}>
                Reiniciar captura
              </button>
            )}
          </div>

          {sourceMode === "template" ? (
            <div className="quotes-template-picker">
              <label className="form-field">
                <span>Cotizacion tipo base</span>
                <select value={selectedTemplateId} onChange={(event) => handleTemplateSelection(event.target.value)}>
                  <option value="">Seleccionar plantilla...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.templateNumber} - {getTeamLabel(template.team)}
                    </option>
                  ))}
                </select>
              </label>

              <p className="muted">
                {selectedTemplate
                  ? "La tabla editable de esta cotizacion tipo aparece debajo de los campos de captura."
                  : "Selecciona una cotizacion tipo para precargar el layout y mostrar su tabla editable debajo de los campos."}
              </p>
            </div>
          ) : (
            <p className="muted">El layout generico empieza en blanco para capturar una propuesta desde cero.</p>
          )}

          <form className="quotes-form" onSubmit={handleQuoteSubmit}>
            <div className="quotes-form-grid">
              <label className="form-field">
                <span>Cliente</span>
                <select value={quoteForm.clientId} onChange={(event) => handleClientSelection(event.target.value)}>
                  <option value="">Seleccionar cliente...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.clientNumber} - {client.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Equipo responsable</span>
                <select value={quoteForm.responsibleTeam} onChange={(event) => updateQuoteForm((current) => ({ ...current, responsibleTeam: event.target.value as Team | "" }))}>
                  <option value="">Sin equipo</option>
                  {QUOTE_TEAM_OPTIONS.map((team) => (
                    <option key={team.key} value={team.key}>
                      {team.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Tipo de cotizacion</span>
                <select value={quoteForm.quoteType} onChange={(event) => updateQuoteForm((current) => ({ ...current, quoteType: event.target.value as QuoteType }))}>
                  <option value="ONE_TIME">Asunto unico</option>
                  <option value="RETAINER">Iguala</option>
                </select>
              </label>

              {sourceMode === "generic" ? (
                <div className="form-field quote-language-field">
                  <span>Idioma de la cotización</span>
                  <label className="quote-language-checkbox">
                    <input
                      type="checkbox"
                      checked={quoteForm.language === "en"}
                      onChange={(event) => handleGenericQuoteLanguageChange(event.target.checked ? "en" : "es")}
                    />
                    <span>{quoteForm.language === "en" ? "Inglés" : "Español"}</span>
                  </label>
                  <small>Desmarcado: español. Marcado: inglés.</small>
                </div>
              ) : null}

              <label className="form-field">
                <span>Numero de cotizacion</span>
                <input type="text" value={suggestedQuoteNumber} readOnly />
              </label>

              <label className="form-field">
                <span>Fecha</span>
                <input
                  type="date"
                  value={quoteForm.quoteDate}
                  onChange={(event) => updateQuoteForm((current) => ({ ...current, quoteDate: event.target.value }))}
                />
              </label>

              <label className="form-field">
                <span>Asunto</span>
                <input type="text" value={quoteForm.subject} onChange={(event) => updateQuoteForm((current) => ({ ...current, subject: event.target.value }))} placeholder="Describe el alcance de la propuesta" />
              </label>

              <label className="form-field">
                <span>Hito de conclusion</span>
                <input type="text" value={quoteForm.milestone} onChange={(event) => updateQuoteForm((current) => ({ ...current, milestone: event.target.value }))} placeholder="Ej. Firma, entrega, cierre, aprobacion" />
              </label>
            </div>

            {sourceMode === "template" && !selectedTemplate ? (
              <section className="quote-template-editor-shell">
                <div className="panel-header quotes-line-editor-header">
                  <div>
                    <h3>Tabla de cotizacion tipo</h3>
                    <p className="muted">
                      Selecciona una cotizacion tipo base para cargar aqui su tabla editable.
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {quoteTemplateDraft ? (
              <section className="quote-template-editor-shell">
                <div className="panel-header quotes-line-editor-header">
                  <div>
                    <h3>{sourceMode === "template" ? "Tabla de cotizacion tipo" : "Tabla de cotizacion"}</h3>
                    <p className="muted">
                      {sourceMode === "template"
                        ? "Puedes editar la misma tabla de la plantilla antes de guardar la cotizacion."
                        : "Configura desde cero la cotizacion del cliente usando la misma tabla avanzada de las cotizaciones tipo."}
                    </p>
                  </div>
                </div>

                <div className="quote-template-amount-config-grid">
                  <TemplateAmountColumnConfig
                    column={quoteTemplateDraft.amountColumns[0]}
                    onModeChange={(mode) =>
                      updateQuoteTemplateDraft((current) => ({
                        ...current,
                        amountColumns: [{ ...current.amountColumns[0], mode }, current.amountColumns[1]]
                      }))
                    }
                  />
                  <TemplateAmountColumnConfig
                    column={quoteTemplateDraft.amountColumns[1]}
                    secondary
                    onToggleSecondary={(enabled) =>
                      updateQuoteTemplateDraft((current) => ({
                        ...current,
                        amountColumns: [
                          current.amountColumns[0],
                          { ...current.amountColumns[1], enabled }
                        ],
                        tableRows: enabled ? current.tableRows : resetSecondaryAmountColumn(current.tableRows)
                      }))
                    }
                    onModeChange={(mode) =>
                      updateQuoteTemplateDraft((current) => ({
                        ...current,
                        amountColumns: [current.amountColumns[0], { ...current.amountColumns[1], mode }]
                      }))
                    }
                  />
                </div>

                <div className="quote-template-rows">
                  {quoteTemplateDraft.tableRows.map((row, rowIndex) => (
                    <TemplateConceptCard
                      key={row.id}
                      row={row}
                      rowIndex={rowIndex}
                      rows={quoteTemplateDraft.tableRows}
                      amountColumns={quoteTemplateDraft.amountColumns}
                      onRowChange={updateQuoteTemplateRow}
                      onInsertAfter={(index) =>
                        updateQuoteTemplateDraft((current) => ({
                          ...current,
                          tableRows: insertTemplateRowAfter(current.tableRows, index)
                        }))
                      }
                      onRemove={(index) =>
                        updateQuoteTemplateDraft((current) => ({
                          ...current,
                          tableRows: removeTemplateRow(current.tableRows, index)
                        }))
                      }
                      onMerge={handleQuoteTemplateMerge}
                      onUnmerge={handleQuoteTemplateUnmerge}
                    />
                  ))}
                </div>

                <TemplateSummaryGrid amountColumns={quoteTemplateDraft.amountColumns} tableRows={quoteTemplateDraft.tableRows} />
              </section>
            ) : null}

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={savingQuote || Boolean(exportingFormat)}>
                {savingQuote ? "Guardando..." : editingQuote ? "Guardar cambios" : "Guardar cotizacion"}
              </button>
              <button type="button" className="secondary-button" disabled={savingQuote || Boolean(exportingFormat)} onClick={() => void handleQuoteDownload("pdf")}>
                {exportingFormat === "pdf" ? "Generando PDF..." : "Descargar en PDF"}
              </button>
              <button type="button" className="secondary-button" disabled={savingQuote || Boolean(exportingFormat)} onClick={() => void handleQuoteDownload("word")}>
                {exportingFormat === "word" ? "Generando Word..." : "Descargar en Word"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {viewingQuote ? (
        <div className="finance-modal-backdrop" role="presentation" onClick={() => setViewingQuote(null)}>
          <div
            className="finance-modal finance-modal-wide quotes-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de cotizacion guardada"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <p className="eyebrow">Cotizacion guardada</p>
                <h3>{viewingQuote.quoteNumber}</h3>
              </div>
              <button type="button" className="secondary-button" onClick={() => setViewingQuote(null)}>
                Cerrar
              </button>
            </div>

            <div className="quotes-detail-grid">
              <div className="quotes-detail-block">
                <strong>Cliente</strong>
                <p>{viewingQuote.clientName}</p>
              </div>
              <div className="quotes-detail-block">
                <strong>Fecha</strong>
                <p>{formatDate(getQuoteDisplayDate(viewingQuote))}</p>
              </div>
              <div className="quotes-detail-block">
                <strong>Tipo</strong>
                <p>{getQuoteTypeLabel(viewingQuote.quoteType)}</p>
              </div>
              <div className="quotes-detail-block">
                <strong>Equipo</strong>
                <p>{getTeamLabel(viewingQuote.responsibleTeam)}</p>
              </div>
              <div className="quotes-detail-block">
                <strong>Hito</strong>
                <p>{normalizeText(viewingQuote.milestone) || "-"}</p>
              </div>
            </div>

            {viewingQuoteDraft ? (
              <TemplateVisualPreview
                heading="Preview visual"
                templateNumber={viewingQuote.quoteNumber}
                team={viewingQuote.responsibleTeam}
                quoteType={viewingQuote.quoteType}
                milestone={viewingQuote.milestone}
                services={viewingQuote.subject}
                servicesLabel="Asunto"
                emptyServicesText="Sin asunto capturado."
                amountColumns={viewingQuoteDraft.amountColumns}
                tableRows={viewingQuoteDraft.tableRows}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {quotePendingDelete ? (
        <div className="finance-modal-backdrop" role="presentation" onClick={() => (deletingQuoteId ? undefined : setQuotePendingDelete(null))}>
          <div className="finance-modal" role="dialog" aria-modal="true" aria-label="Confirmar borrado de cotizacion guardada" onClick={(event) => event.stopPropagation()}>
            <h3>Borrar cotizacion guardada</h3>
            <p>
              Vas a borrar <strong>{quotePendingDelete.quoteNumber}</strong>. Esta cotizacion dejara de aparecer en el historial del cliente.
            </p>
            <p className="muted">{normalizeText(quotePendingDelete.subject) || "Sin asunto capturado."}</p>
            <div className="finance-modal-actions">
              <button className="secondary-button" type="button" disabled={Boolean(deletingQuoteId)} onClick={() => setQuotePendingDelete(null)}>
                Cancelar
              </button>
              <button className="danger-button" type="button" disabled={Boolean(deletingQuoteId)} onClick={() => void handleQuoteDeleteConfirm()}>
                {deletingQuoteId ? "Borrando..." : "Confirmar borrado"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {templatePendingDelete ? (
        <div className="finance-modal-backdrop" role="presentation" onClick={() => (deletingTemplateId ? undefined : setTemplatePendingDelete(null))}>
          <div className="finance-modal" role="dialog" aria-modal="true" aria-label="Confirmar borrado de cotizacion tipo" onClick={(event) => event.stopPropagation()}>
            <h3>Borrar cotizacion tipo</h3>
            <p>
              Vas a borrar <strong>{templatePendingDelete.templateNumber}</strong>. Esta plantilla dejara de estar disponible para reutilizarse.
            </p>
            <p className="muted">{summarizeTemplateServices(templatePendingDelete.services, 120)}</p>
            <div className="finance-modal-actions">
              <button className="secondary-button" type="button" disabled={Boolean(deletingTemplateId)} onClick={() => setTemplatePendingDelete(null)}>
                Cancelar
              </button>
              <button className="danger-button" type="button" disabled={Boolean(deletingTemplateId)} onClick={() => void handleTemplateDeleteConfirm()}>
                {deletingTemplateId ? "Borrando..." : "Confirmar borrado"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
