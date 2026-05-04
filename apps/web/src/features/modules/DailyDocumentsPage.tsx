import { useEffect, useMemo, useState } from "react";
import type { Client, DailyDocumentAssignment, DailyDocumentTemplateId } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";

type DailyDocumentField = {
  name: string;
  label: string;
  type?: "text" | "date" | "number" | "textarea";
  placeholder?: string;
};

type DailyDocumentTemplate = {
  id: DailyDocumentTemplateId;
  title: string;
  shortTitle: string;
  summary: string;
  fields: DailyDocumentField[];
  build: (values: DailyDocumentValues) => GeneratedDocument;
};

type DailyDocumentValues = Record<string, string>;

type GeneratedDocument = {
  title: string;
  subtitle: string;
  paragraphs: string[];
  details?: Array<{ label: string; value: string }>;
  signers: string[];
};

type PdfDocument = import("jspdf").jsPDF;

function dateInputValue(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

const today = dateInputValue(new Date());

const basePlaceDateFields: DailyDocumentField[] = [
  { name: "place", label: "Lugar", placeholder: "Ciudad de Mexico" },
  { name: "date", label: "Fecha", type: "date" }
];

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeText(valueToNormalize?: string | null) {
  return (valueToNormalize ?? "").trim();
}

function value(values: DailyDocumentValues, key: string, fallback: string) {
  return values[key]?.trim() || fallback;
}

function formatLongDate(rawDate: string) {
  if (!rawDate) return "fecha pendiente";

  const date = new Date(`${rawDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return rawDate;
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatPlaceDate(values: DailyDocumentValues) {
  return `${value(values, "place", "lugar pendiente")}, a ${formatLongDate(values.date)}`;
}

function amountLabel(values: DailyDocumentValues) {
  const amount = Number(values.amount || 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return value(values, "amount", "cantidad pendiente");
  }

  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(amount);
}

const dailyDocumentTemplates: DailyDocumentTemplate[] = [
  {
    id: "power-letter",
    title: "Carta poder",
    shortTitle: "Carta poder",
    summary: "Mandato simple para tramites, gestiones o representacion puntual.",
    fields: [
      ...basePlaceDateFields,
      { name: "recipient", label: "Dirigido a", placeholder: "A quien corresponda" },
      { name: "grantor", label: "Otorgante", placeholder: "Nombre de quien otorga" },
      { name: "attorney", label: "Apoderado", placeholder: "Nombre de quien recibe el poder" },
      { name: "matter", label: "Asunto", placeholder: "Tramite o asunto" },
      {
        name: "powers",
        label: "Facultades",
        type: "textarea",
        placeholder: "Realizar gestiones, firmar acuses, recibir documentos y dar seguimiento al tramite."
      },
      { name: "witnesses", label: "Testigos", placeholder: "Nombre de testigos, si aplica" }
    ],
    build: (values) => ({
      title: "Carta poder",
      subtitle: formatPlaceDate(values),
      paragraphs: [
        value(values, "recipient", "A quien corresponda"),
        `Por medio de la presente, ${value(values, "grantor", "otorgante pendiente")} otorga poder amplio y suficiente a ${value(
          values,
          "attorney",
          "apoderado pendiente"
        )} para que en su nombre y representacion realice las gestiones relacionadas con ${value(
          values,
          "matter",
          "asunto pendiente"
        )}.`,
        `Las facultades conferidas comprenden: ${value(values, "powers", "facultades pendientes")}`,
        "La presente se expide para los efectos administrativos correspondientes."
      ],
      details: values.witnesses?.trim() ? [{ label: "Testigos", value: values.witnesses.trim() }] : undefined,
      signers: [value(values, "grantor", "Otorgante"), value(values, "attorney", "Apoderado")]
    })
  },
  {
    id: "receipt",
    title: "Recibo",
    shortTitle: "Recibo",
    summary: "Constancia de recepcion de pago, anticipo, reembolso o entrega de efectivo.",
    fields: [
      ...basePlaceDateFields,
      { name: "receivedBy", label: "Recibe", placeholder: "Nombre de quien recibe" },
      { name: "paidBy", label: "Entregado por", placeholder: "Nombre de quien entrega" },
      { name: "amount", label: "Cantidad", type: "number", placeholder: "0.00" },
      { name: "concept", label: "Concepto", placeholder: "Concepto del pago o entrega" },
      { name: "paymentMethod", label: "Forma de pago", placeholder: "Efectivo, transferencia, cheque..." },
      { name: "notes", label: "Notas", type: "textarea", placeholder: "Observaciones o referencia de pago" }
    ],
    build: (values) => ({
      title: "Recibo",
      subtitle: formatPlaceDate(values),
      paragraphs: [
        `Recibi de ${value(values, "paidBy", "persona que entrega pendiente")} la cantidad de ${amountLabel(values)} por concepto de ${value(
          values,
          "concept",
          "concepto pendiente"
        )}.`,
        `La entrega se realizo mediante ${value(values, "paymentMethod", "forma de pago pendiente")}.`,
        value(values, "notes", "Sin observaciones adicionales.")
      ],
      details: [
        { label: "Cantidad", value: amountLabel(values) },
        { label: "Concepto", value: value(values, "concept", "concepto pendiente") }
      ],
      signers: [value(values, "receivedBy", "Recibe")]
    })
  },
  {
    id: "delivery-receipt",
    title: "Carta de entrega recepcion",
    shortTitle: "Entrega recepcion",
    summary: "Registro de entrega de documentos, expedientes, bienes o informacion.",
    fields: [
      ...basePlaceDateFields,
      { name: "deliveredBy", label: "Entrega", placeholder: "Nombre de quien entrega" },
      { name: "receivedBy", label: "Recibe", placeholder: "Nombre de quien recibe" },
      { name: "subject", label: "Asunto", placeholder: "Entrega de documentos, expediente o bienes" },
      { name: "items", label: "Elementos entregados", type: "textarea", placeholder: "Lista de documentos o bienes entregados" },
      { name: "condition", label: "Estado", placeholder: "Original, copia simple, buen estado..." },
      { name: "notes", label: "Observaciones", type: "textarea", placeholder: "Notas de recepcion, pendientes o anexos" }
    ],
    build: (values) => ({
      title: "Carta de entrega recepcion",
      subtitle: formatPlaceDate(values),
      paragraphs: [
        `Por medio de la presente, ${value(values, "deliveredBy", "persona que entrega pendiente")} hace entrega a ${value(
          values,
          "receivedBy",
          "persona que recibe pendiente"
        )} de los elementos relacionados con ${value(values, "subject", "asunto pendiente")}.`,
        `Elementos entregados: ${value(values, "items", "elementos pendientes")}`,
        `Estado de entrega: ${value(values, "condition", "estado pendiente")}.`,
        value(values, "notes", "Sin observaciones adicionales.")
      ],
      details: [
        { label: "Asunto", value: value(values, "subject", "asunto pendiente") },
        { label: "Estado", value: value(values, "condition", "estado pendiente") }
      ],
      signers: [value(values, "deliveredBy", "Entrega"), value(values, "receivedBy", "Recibe")]
    })
  }
];

function sortClients(clients: Client[]) {
  return [...clients].sort((left, right) => {
    const numberDelta = left.clientNumber.localeCompare(right.clientNumber, "es-MX", { numeric: true });
    return numberDelta || left.name.localeCompare(right.name, "es-MX", { sensitivity: "base" });
  });
}

function sortAssignedDocuments(assignments: DailyDocumentAssignment[]) {
  return [...assignments].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function findTemplate(templateId: DailyDocumentTemplateId) {
  return dailyDocumentTemplates.find((template) => template.id === templateId) ?? dailyDocumentTemplates[0];
}

function mergeTemplateValues(template: DailyDocumentTemplate, values: DailyDocumentValues) {
  return {
    ...initialValuesForTemplate(template),
    ...values
  };
}

function initialValuesForTemplate(template: DailyDocumentTemplate): DailyDocumentValues {
  return template.fields.reduce<DailyDocumentValues>((values, field) => {
    values[field.name] = field.type === "date" ? today : "";
    return values;
  }, {});
}

function slugify(valueToSlug: string) {
  return valueToSlug
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(valueToEscape: string) {
  return valueToEscape
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function generatedDocumentToText(document: GeneratedDocument) {
  const detailLines = document.details?.map((detail) => `${detail.label}: ${detail.value}`) ?? [];
  const signerLines = document.signers.map((signer) => `______________________________\n${signer}`);

  return [document.title, document.subtitle, ...document.paragraphs, ...detailLines, ...signerLines].join("\n\n");
}

function generatedDocumentToHtml(document: GeneratedDocument) {
  const detailRows =
    document.details
      ?.map(
        (detail) =>
          `<tr><th>${escapeHtml(detail.label)}</th><td>${escapeHtml(detail.value)}</td></tr>`
      )
      .join("") ?? "";
  const signerRows = document.signers
    .map((signer) => `<div class="signature"><span></span><strong>${escapeHtml(signer)}</strong></div>`)
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(document.title)}</title>
  <style>
    body { color: #172033; font-family: Arial, sans-serif; line-height: 1.55; margin: 48px; }
    h1 { font-size: 24px; margin: 0 0 8px; text-align: center; text-transform: uppercase; }
    .subtitle { color: #52606d; margin: 0 0 32px; text-align: center; }
    p { margin: 0 0 18px; text-align: justify; }
    table { border-collapse: collapse; margin: 24px 0; width: 100%; }
    th, td { border: 1px solid #d9e2ec; padding: 10px; text-align: left; vertical-align: top; }
    th { width: 28%; }
    .signatures { display: grid; gap: 28px; grid-template-columns: repeat(${Math.max(document.signers.length, 1)}, 1fr); margin-top: 72px; }
    .signature { text-align: center; }
    .signature span { border-top: 1px solid #172033; display: block; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(document.title)}</h1>
  <p class="subtitle">${escapeHtml(document.subtitle)}</p>
  ${document.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
  ${detailRows ? `<table>${detailRows}</table>` : ""}
  <div class="signatures">${signerRows}</div>
</body>
</html>`;
}

function documentFileName(document: GeneratedDocument, extension: "docx" | "pdf") {
  return `${slugify(document.title)}.${extension}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function downloadWordDocument(document: GeneratedDocument) {
  const {
    AlignmentType,
    Document: WordDocument,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    TableBorders,
    WidthType
  } = await import("docx");

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: document.title.toUpperCase(),
          bold: true,
          size: 28,
          font: "Arial",
          color: "172033"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 440 },
      children: [
        new TextRun({
          text: document.subtitle,
          bold: true,
          size: 22,
          font: "Arial",
          color: "52606D"
        })
      ]
    })
  ];

  document.paragraphs.forEach((paragraph) => {
    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 220, line: 360 },
        children: [
          new TextRun({
            text: paragraph,
            size: 24,
            font: "Arial",
            color: "172033"
          })
        ]
      })
    );
  });

  if (document.details?.length) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: document.details.map(
          (detail) =>
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 28, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: detail.label, bold: true, font: "Arial", size: 22 })]
                    })
                  ]
                }),
                new TableCell({
                  width: { size: 72, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: detail.value, font: "Arial", size: 22 })]
                    })
                  ]
                })
              ]
            })
        )
      })
    );
  }

  children.push(new Paragraph({ spacing: { after: 760 }, text: "" }));
  children.push(
    new Table({
      borders: TableBorders.NONE,
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: document.signers.map(
            (signer) =>
              new TableCell({
                width: { size: 100 / Math.max(document.signers.length, 1), type: WidthType.PERCENTAGE },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "______________________________", font: "Arial", size: 22 })]
                  }),
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 120 },
                    children: [new TextRun({ text: signer, bold: true, font: "Arial", size: 22 })]
                  })
                ]
              })
          )
        })
      ]
    })
  );

  const wordDocument = new WordDocument({
    creator: "SIGE",
    title: document.title,
    description: "Documento generado desde SIGE",
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children
      }
    ]
  });
  const blob = await Packer.toBlob(wordDocument);

  saveBlob(blob, documentFileName(document, "docx"));
}

function splitPdfText(pdf: PdfDocument, text: string, maxWidth: number) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  return Array.isArray(lines) ? lines.map(String) : [String(lines)];
}

async function downloadPdfDocument(document: GeneratedDocument) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ format: "letter", unit: "pt" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 54;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - margin;
  let y = 72;

  function ensureSpace(height: number) {
    if (y + height <= bottomLimit) return;

    pdf.addPage();
    y = margin;
  }

  function addCenteredText(text: string, size: number, style: "normal" | "bold", spaceAfter: number) {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    const lines = splitPdfText(pdf, text, contentWidth);
    const lineHeight = size * 1.35;

    ensureSpace(lines.length * lineHeight + spaceAfter);
    pdf.text(lines, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
    y += lines.length * lineHeight + spaceAfter;
  }

  function addParagraph(text: string) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(12);
    const lines = splitPdfText(pdf, text, contentWidth);
    const lineHeight = 18;

    ensureSpace(lines.length * lineHeight + 12);
    pdf.text(lines, margin, y, { maxWidth: contentWidth });
    y += lines.length * lineHeight + 14;
  }

  addCenteredText(document.title.toUpperCase(), 18, "bold", 36);
  addCenteredText(document.subtitle, 12, "bold", 44);

  document.paragraphs.forEach(addParagraph);

  if (document.details?.length) {
    const labelWidth = 140;
    const valueWidth = contentWidth - labelWidth;

    y += 8;
    document.details.forEach((detail) => {
      pdf.setFontSize(10);
      const labelLines = splitPdfText(pdf, detail.label, labelWidth - 18);
      const valueLines = splitPdfText(pdf, detail.value, valueWidth - 18);
      const rowHeight = Math.max(labelLines.length, valueLines.length) * 14 + 16;

      ensureSpace(rowHeight);
      pdf.setDrawColor(217, 226, 236);
      pdf.rect(margin, y, labelWidth, rowHeight);
      pdf.rect(margin + labelWidth, y, valueWidth, rowHeight);
      pdf.setFont("helvetica", "bold");
      pdf.text(labelLines, margin + 9, y + 18, { maxWidth: labelWidth - 18 });
      pdf.setFont("helvetica", "normal");
      pdf.text(valueLines, margin + labelWidth + 9, y + 18, { maxWidth: valueWidth - 18 });
      y += rowHeight;
    });
  }

  ensureSpace(120);
  y += 72;
  const signatureWidth = contentWidth / Math.max(document.signers.length, 1);

  document.signers.forEach((signer, index) => {
    const left = margin + signatureWidth * index;
    const lineStart = left + 16;
    const lineEnd = left + signatureWidth - 16;
    const center = left + signatureWidth / 2;

    pdf.setDrawColor(23, 32, 51);
    pdf.line(lineStart, y, lineEnd, y);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(splitPdfText(pdf, signer, signatureWidth - 28), center, y + 18, {
      align: "center",
      maxWidth: signatureWidth - 28
    });
  });

  pdf.save(documentFileName(document, "pdf"));
}

function DocumentPreview({ document }: { document: GeneratedDocument }) {
  return (
    <article className="daily-doc-paper" aria-live="polite">
      <header>
        <h3>{document.title}</h3>
        <span>{document.subtitle}</span>
      </header>

      <div className="daily-doc-paper-body">
        {document.paragraphs.map((paragraph, index) => (
          <p key={`${paragraph}-${index}`}>{paragraph}</p>
        ))}
      </div>

      {document.details?.length ? (
        <dl className="daily-doc-details">
          {document.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <footer className="daily-doc-signatures">
        {document.signers.map((signer, index) => (
          <div key={`${signer}-${index}`}>
            <span />
            <strong>{signer}</strong>
          </div>
        ))}
      </footer>
    </article>
  );
}

export function DailyDocumentsPage() {
  const [activeTab, setActiveTab] = useState<"generate" | "assigned">("generate");
  const [selectedTemplateId, setSelectedTemplateId] = useState<DailyDocumentTemplateId>(dailyDocumentTemplates[0].id);
  const selectedTemplate = findTemplate(selectedTemplateId);
  const [templateValues, setTemplateValues] = useState<Record<DailyDocumentTemplateId, DailyDocumentValues>>(() =>
    dailyDocumentTemplates.reduce<Record<DailyDocumentTemplateId, DailyDocumentValues>>((values, template) => {
      values[template.id] = initialValuesForTemplate(template);
      return values;
    }, {} as Record<DailyDocumentTemplateId, DailyDocumentValues>)
  );
  const [clients, setClients] = useState<Client[]>([]);
  const [assignments, setAssignments] = useState<DailyDocumentAssignment[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assignmentTitle, setAssignmentTitle] = useState(dailyDocumentTemplates[0].title);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [assignedSearch, setAssignedSearch] = useState("");
  const [loadingModuleData, setLoadingModuleData] = useState(true);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const values = templateValues[selectedTemplate.id];
  const generatedDocument = useMemo(() => selectedTemplate.build(values), [selectedTemplate, values]);
  const generatedText = useMemo(() => generatedDocumentToText(generatedDocument), [generatedDocument]);
  const generatedHtml = useMemo(() => generatedDocumentToHtml(generatedDocument), [generatedDocument]);
  const filteredAssignments = useMemo(() => {
    const term = normalizeText(assignedSearch).toLowerCase();

    if (!term) {
      return assignments;
    }

    return assignments.filter((assignment) =>
      [
        assignment.title,
        assignment.templateTitle,
        assignment.clientName,
        assignment.clientNumber
      ].some((entry) => entry.toLowerCase().includes(term))
    );
  }, [assignments, assignedSearch]);

  async function loadModuleData() {
    setLoadingModuleData(true);
    setFlash(null);

    try {
      const [clientRows, assignmentRows] = await Promise.all([
        apiGet<Client[]>("/clients"),
        apiGet<DailyDocumentAssignment[]>("/daily-documents")
      ]);

      setClients(sortClients(clientRows));
      setAssignments(sortAssignedDocuments(assignmentRows));
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setLoadingModuleData(false);
    }
  }

  useEffect(() => {
    void loadModuleData();
  }, []);

  function selectTemplate(templateId: DailyDocumentTemplateId) {
    const nextTemplate = findTemplate(templateId);
    setSelectedTemplateId(templateId);
    setAssignmentTitle(nextTemplate.title);
    setCopyStatus("");
  }

  function updateValue(fieldName: string, nextValue: string) {
    setTemplateValues((currentValues) => ({
      ...currentValues,
      [selectedTemplate.id]: {
        ...currentValues[selectedTemplate.id],
        [fieldName]: nextValue
      }
    }));
    setCopyStatus("");
  }

  function resetDraft() {
    const firstTemplate = dailyDocumentTemplates[0];

    setSelectedTemplateId(firstTemplate.id);
    setTemplateValues((currentValues) => ({
      ...currentValues,
      [firstTemplate.id]: initialValuesForTemplate(firstTemplate)
    }));
    setSelectedClientId("");
    setAssignmentTitle(firstTemplate.title);
    setEditingDocumentId(null);
    setCopyStatus("");
  }

  function payloadFromCurrentDraft() {
    return {
      templateId: selectedTemplate.id,
      templateTitle: selectedTemplate.title,
      title: normalizeText(assignmentTitle) || selectedTemplate.title,
      clientId: selectedClientId,
      values
    };
  }

  async function copyDocument() {
    try {
      await navigator.clipboard.writeText(generatedText);
      setCopyStatus("Documento copiado.");
    } catch {
      setCopyStatus("No se pudo copiar el documento.");
    }
  }

  async function saveAssignment() {
    if (!normalizeText(selectedClientId)) {
      setFlash({ tone: "error", text: "Selecciona un cliente para asignar el documento." });
      return;
    }

    setSavingAssignment(true);
    setFlash(null);

    try {
      const payload = payloadFromCurrentDraft();
      const saved = editingDocumentId
        ? await apiPatch<DailyDocumentAssignment>(`/daily-documents/${editingDocumentId}`, payload)
        : await apiPost<DailyDocumentAssignment>("/daily-documents", payload);

      setAssignments((currentAssignments) =>
        sortAssignedDocuments(
          currentAssignments.some((assignment) => assignment.id === saved.id)
            ? currentAssignments.map((assignment) => (assignment.id === saved.id ? saved : assignment))
            : [saved, ...currentAssignments]
        )
      );
      setFlash({
        tone: "success",
        text: editingDocumentId ? "Documento actualizado correctamente." : "Documento asignado correctamente."
      });
      resetDraft();
      setActiveTab("assigned");
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingAssignment(false);
    }
  }

  function editAssignment(assignment: DailyDocumentAssignment) {
    const template = findTemplate(assignment.templateId);

    setSelectedTemplateId(template.id);
    setTemplateValues((currentValues) => ({
      ...currentValues,
      [template.id]: mergeTemplateValues(template, assignment.values)
    }));
    setSelectedClientId(assignment.clientId);
    setAssignmentTitle(assignment.title);
    setEditingDocumentId(assignment.id);
    setCopyStatus("");
    setFlash({ tone: "success", text: "Documento cargado para modificacion." });
    setActiveTab("generate");
  }

  async function deleteAssignment(assignment: DailyDocumentAssignment) {
    if (!window.confirm(`Seguro que deseas borrar ${assignment.title} de ${assignment.clientName}?`)) {
      return;
    }

    setDeletingDocumentId(assignment.id);
    setFlash(null);

    try {
      await apiDelete(`/daily-documents/${assignment.id}`);
      setAssignments((currentAssignments) => currentAssignments.filter((entry) => entry.id !== assignment.id));
      if (editingDocumentId === assignment.id) {
        resetDraft();
      }
      setFlash({ tone: "success", text: "Documento asignado borrado correctamente." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingDocumentId(null);
    }
  }

  function buildAssignmentDocument(assignment: DailyDocumentAssignment) {
    const template = findTemplate(assignment.templateId);
    return template.build(mergeTemplateValues(template, assignment.values));
  }

  async function downloadAssignmentWord(assignment: DailyDocumentAssignment) {
    setFlash(null);

    try {
      await downloadWordDocument(buildAssignmentDocument(assignment));
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    }
  }

  async function downloadAssignmentPdf(assignment: DailyDocumentAssignment) {
    setFlash(null);

    try {
      await downloadPdfDocument(buildAssignmentDocument(assignment));
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    }
  }

  async function handleWordDownload() {
    setCopyStatus("Generando Word...");
    try {
      await downloadWordDocument(generatedDocument);
      setCopyStatus("Word descargado.");
    } catch {
      setCopyStatus("No se pudo generar Word.");
    }
  }

  async function handlePdfDownload() {
    setCopyStatus("Generando PDF...");
    try {
      await downloadPdfDocument(generatedDocument);
      setCopyStatus("PDF descargado.");
    } catch {
      setCopyStatus("No se pudo generar PDF.");
    }
  }

  function printDocument() {
    const popup = window.open("", "_blank");

    if (!popup) {
      setCopyStatus("No se pudo abrir la vista de impresion.");
      return;
    }

    popup.document.write(generatedHtml);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  return (
    <section className="page-stack daily-documents-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Docs
          </span>
          <div>
            <h2>Documentos de uso diario</h2>
          </div>
        </div>
        <p className="muted">Generacion rapida de cartas poder, recibos y entregas recepcion.</p>
      </header>

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      <section className="panel daily-doc-tabs-panel">
        <div className="leads-tabs daily-doc-tabs" role="tablist" aria-label="Documentos de uso diario">
          <button
            aria-selected={activeTab === "generate"}
            className={`lead-tab ${activeTab === "generate" ? "is-active" : ""}`}
            onClick={() => setActiveTab("generate")}
            type="button"
          >
            Generar y asignar ({dailyDocumentTemplates.length})
          </button>
          <button
            aria-selected={activeTab === "assigned"}
            className={`lead-tab ${activeTab === "assigned" ? "is-active" : ""}`}
            onClick={() => setActiveTab("assigned")}
            type="button"
          >
            Documentos asignados ({assignments.length})
          </button>
        </div>
      </section>

      {activeTab === "generate" ? (
        <section className="daily-documents-layout">
          <div className="daily-documents-controls">
            <section className="panel daily-doc-template-panel">
              <div className="panel-header">
                <h3>Plantillas</h3>
                <span>{dailyDocumentTemplates.length} disponibles</span>
              </div>
              <div className="daily-doc-template-list" role="listbox" aria-label="Plantillas de documentos">
                {dailyDocumentTemplates.map((template) => (
                  <button
                    aria-selected={template.id === selectedTemplate.id}
                    className={`daily-doc-template-option${template.id === selectedTemplate.id ? " is-active" : ""}`}
                    key={template.id}
                    onClick={() => selectTemplate(template.id)}
                    type="button"
                  >
                    <strong>{template.shortTitle}</strong>
                    <span>{template.summary}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel daily-doc-form-panel">
              <div className="panel-header">
                <h3>{selectedTemplate.title}</h3>
                <span className="status-pill status-live">{editingDocumentId ? "Editando" : "Operativo"}</span>
              </div>
              <div className="daily-doc-field-grid">
                <label className="form-field daily-doc-field-wide">
                  <span>Cliente asignado</span>
                  <select
                    disabled={loadingModuleData || savingAssignment}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    value={selectedClientId}
                  >
                    <option value="">Selecciona un cliente...</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.clientNumber} - {client.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field daily-doc-field-wide">
                  <span>Nombre del documento asignado</span>
                  <input
                    disabled={savingAssignment}
                    onChange={(event) => setAssignmentTitle(event.target.value)}
                    placeholder="Nombre para ubicarlo en la pestaña de asignados"
                    type="text"
                    value={assignmentTitle}
                  />
                </label>
                {selectedTemplate.fields.map((field) => (
                  <label className={`form-field${field.type === "textarea" ? " daily-doc-field-wide" : ""}`} key={field.name}>
                    <span>{field.label}</span>
                    {field.type === "textarea" ? (
                      <textarea
                        disabled={savingAssignment}
                        onChange={(event) => updateValue(field.name, event.target.value)}
                        placeholder={field.placeholder}
                        value={values[field.name] ?? ""}
                      />
                    ) : (
                      <input
                        disabled={savingAssignment}
                        onChange={(event) => updateValue(field.name, event.target.value)}
                        placeholder={field.placeholder}
                        type={field.type ?? "text"}
                        value={values[field.name] ?? ""}
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="daily-doc-save-actions">
                <button className="primary-button" disabled={savingAssignment} onClick={() => void saveAssignment()} type="button">
                  {savingAssignment ? "Guardando..." : editingDocumentId ? "Guardar cambios" : "Asignar a cliente"}
                </button>
                {editingDocumentId ? (
                  <button className="secondary-button" disabled={savingAssignment} onClick={resetDraft} type="button">
                    Cancelar edicion
                  </button>
                ) : null}
              </div>
            </section>
          </div>

          <section className="panel daily-doc-preview-panel">
            <div className="panel-header daily-doc-preview-head">
              <div>
                <h3>Vista previa</h3>
                {copyStatus ? <span>{copyStatus}</span> : null}
              </div>
              <div className="daily-doc-actions">
                <button className="secondary-button" onClick={() => void copyDocument()} type="button">
                  Copiar
                </button>
                <button className="secondary-button" onClick={printDocument} type="button">
                  Imprimir
                </button>
                <button className="secondary-button" onClick={() => void handleWordDownload()} type="button">
                  Word
                </button>
                <button className="primary-button" onClick={() => void handlePdfDownload()} type="button">
                  PDF
                </button>
              </div>
            </div>
            <DocumentPreview document={generatedDocument} />
          </section>
        </section>
      ) : (
        <section className="panel daily-doc-assigned-panel">
          <div className="panel-header daily-doc-assigned-head">
            <div>
              <h3>Documentos asignados</h3>
              <span>{filteredAssignments.length} de {assignments.length}</span>
            </div>
            <div className="daily-doc-assigned-actions">
              <button className="secondary-button" onClick={() => void loadModuleData()} type="button">
                Refrescar
              </button>
              <button className="primary-button" onClick={() => {
                resetDraft();
                setActiveTab("generate");
              }} type="button">
                Nuevo documento
              </button>
            </div>
          </div>

          <label className="form-field daily-doc-assigned-search">
            <span>Buscar</span>
            <input
              onChange={(event) => setAssignedSearch(event.target.value)}
              placeholder="Buscar por cliente, numero o documento..."
              type="search"
              value={assignedSearch}
            />
          </label>

          <div className="daily-doc-assigned-table-shell">
            <table className="data-table daily-doc-assigned-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Documento</th>
                  <th>Plantilla</th>
                  <th>Actualizado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loadingModuleData ? (
                  <tr>
                    <td className="centered-inline-message" colSpan={5}>
                      Cargando documentos...
                    </td>
                  </tr>
                ) : filteredAssignments.length === 0 ? (
                  <tr>
                    <td className="centered-inline-message" colSpan={5}>
                      No hay documentos asignados.
                    </td>
                  </tr>
                ) : (
                  filteredAssignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>
                        <div className="daily-doc-client-cell">
                          <strong>{assignment.clientNumber}</strong>
                          <span>{assignment.clientName}</span>
                        </div>
                      </td>
                      <td>{assignment.title}</td>
                      <td>{assignment.templateTitle}</td>
                      <td>{new Date(assignment.updatedAt).toLocaleDateString("es-MX")}</td>
                      <td>
                        <div className="table-actions">
                          <button className="secondary-button" onClick={() => editAssignment(assignment)} type="button">
                            Modificar
                          </button>
                          <button className="secondary-button" onClick={() => void downloadAssignmentWord(assignment)} type="button">
                            Word
                          </button>
                          <button className="secondary-button" onClick={() => void downloadAssignmentPdf(assignment)} type="button">
                            PDF
                          </button>
                          <button
                            className="danger-button"
                            disabled={deletingDocumentId === assignment.id}
                            onClick={() => void deleteAssignment(assignment)}
                            type="button"
                          >
                            {deletingDocumentId === assignment.id ? "Borrando..." : "Borrar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
