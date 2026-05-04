import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
function dateInputValue(date) {
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
const today = dateInputValue(new Date());
const basePlaceDateFields = [
    { name: "place", label: "Lugar", placeholder: "Ciudad de Mexico" },
    { name: "date", label: "Fecha", type: "date" }
];
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeText(valueToNormalize) {
    return (valueToNormalize ?? "").trim();
}
function value(values, key, fallback) {
    return values[key]?.trim() || fallback;
}
function formatLongDate(rawDate) {
    if (!rawDate)
        return "fecha pendiente";
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
function formatPlaceDate(values) {
    return `${value(values, "place", "lugar pendiente")}, a ${formatLongDate(values.date)}`;
}
function amountLabel(values) {
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
const dailyDocumentTemplates = [
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
                `Por medio de la presente, ${value(values, "grantor", "otorgante pendiente")} otorga poder amplio y suficiente a ${value(values, "attorney", "apoderado pendiente")} para que en su nombre y representacion realice las gestiones relacionadas con ${value(values, "matter", "asunto pendiente")}.`,
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
                `Recibi de ${value(values, "paidBy", "persona que entrega pendiente")} la cantidad de ${amountLabel(values)} por concepto de ${value(values, "concept", "concepto pendiente")}.`,
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
                `Por medio de la presente, ${value(values, "deliveredBy", "persona que entrega pendiente")} hace entrega a ${value(values, "receivedBy", "persona que recibe pendiente")} de los elementos relacionados con ${value(values, "subject", "asunto pendiente")}.`,
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
function sortClients(clients) {
    return [...clients].sort((left, right) => {
        const numberDelta = left.clientNumber.localeCompare(right.clientNumber, "es-MX", { numeric: true });
        return numberDelta || left.name.localeCompare(right.name, "es-MX", { sensitivity: "base" });
    });
}
function sortAssignedDocuments(assignments) {
    return [...assignments].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function findTemplate(templateId) {
    return dailyDocumentTemplates.find((template) => template.id === templateId) ?? dailyDocumentTemplates[0];
}
function mergeTemplateValues(template, values) {
    return {
        ...initialValuesForTemplate(template),
        ...values
    };
}
function initialValuesForTemplate(template) {
    return template.fields.reduce((values, field) => {
        values[field.name] = field.type === "date" ? today : "";
        return values;
    }, {});
}
function slugify(valueToSlug) {
    return valueToSlug
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function escapeHtml(valueToEscape) {
    return valueToEscape
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function generatedDocumentToText(document) {
    const detailLines = document.details?.map((detail) => `${detail.label}: ${detail.value}`) ?? [];
    const signerLines = document.signers.map((signer) => `______________________________\n${signer}`);
    return [document.title, document.subtitle, ...document.paragraphs, ...detailLines, ...signerLines].join("\n\n");
}
function generatedDocumentToHtml(document) {
    const detailRows = document.details
        ?.map((detail) => `<tr><th>${escapeHtml(detail.label)}</th><td>${escapeHtml(detail.value)}</td></tr>`)
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
function documentFileName(document, extension) {
    return `${slugify(document.title)}.${extension}`;
}
function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function downloadWordDocument(document) {
    const { AlignmentType, Document: WordDocument, Packer, Paragraph, Table, TableCell, TableRow, TextRun, TableBorders, WidthType } = await import("docx");
    const children = [
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
        children.push(new Paragraph({
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
        }));
    });
    if (document.details?.length) {
        children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: document.details.map((detail) => new TableRow({
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
            }))
        }));
    }
    children.push(new Paragraph({ spacing: { after: 760 }, text: "" }));
    children.push(new Table({
        borders: TableBorders.NONE,
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
            new TableRow({
                children: document.signers.map((signer) => new TableCell({
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
                }))
            })
        ]
    }));
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
function splitPdfText(pdf, text, maxWidth) {
    const lines = pdf.splitTextToSize(text, maxWidth);
    return Array.isArray(lines) ? lines.map(String) : [String(lines)];
}
async function downloadPdfDocument(document) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ format: "letter", unit: "pt" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 54;
    const contentWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - margin;
    let y = 72;
    function ensureSpace(height) {
        if (y + height <= bottomLimit)
            return;
        pdf.addPage();
        y = margin;
    }
    function addCenteredText(text, size, style, spaceAfter) {
        pdf.setFont("helvetica", style);
        pdf.setFontSize(size);
        const lines = splitPdfText(pdf, text, contentWidth);
        const lineHeight = size * 1.35;
        ensureSpace(lines.length * lineHeight + spaceAfter);
        pdf.text(lines, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });
        y += lines.length * lineHeight + spaceAfter;
    }
    function addParagraph(text) {
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
function DocumentPreview({ document }) {
    return (_jsxs("article", { className: "daily-doc-paper", "aria-live": "polite", children: [_jsxs("header", { children: [_jsx("h3", { children: document.title }), _jsx("span", { children: document.subtitle })] }), _jsx("div", { className: "daily-doc-paper-body", children: document.paragraphs.map((paragraph, index) => (_jsx("p", { children: paragraph }, `${paragraph}-${index}`))) }), document.details?.length ? (_jsx("dl", { className: "daily-doc-details", children: document.details.map((detail) => (_jsxs("div", { children: [_jsx("dt", { children: detail.label }), _jsx("dd", { children: detail.value })] }, detail.label))) })) : null, _jsx("footer", { className: "daily-doc-signatures", children: document.signers.map((signer, index) => (_jsxs("div", { children: [_jsx("span", {}), _jsx("strong", { children: signer })] }, `${signer}-${index}`))) })] }));
}
export function DailyDocumentsPage() {
    const [activeTab, setActiveTab] = useState("generate");
    const [selectedTemplateId, setSelectedTemplateId] = useState(dailyDocumentTemplates[0].id);
    const selectedTemplate = findTemplate(selectedTemplateId);
    const [templateValues, setTemplateValues] = useState(() => dailyDocumentTemplates.reduce((values, template) => {
        values[template.id] = initialValuesForTemplate(template);
        return values;
    }, {}));
    const [clients, setClients] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [selectedClientId, setSelectedClientId] = useState("");
    const [assignmentTitle, setAssignmentTitle] = useState(dailyDocumentTemplates[0].title);
    const [editingDocumentId, setEditingDocumentId] = useState(null);
    const [assignedSearch, setAssignedSearch] = useState("");
    const [loadingModuleData, setLoadingModuleData] = useState(true);
    const [savingAssignment, setSavingAssignment] = useState(false);
    const [deletingDocumentId, setDeletingDocumentId] = useState(null);
    const [copyStatus, setCopyStatus] = useState("");
    const [flash, setFlash] = useState(null);
    const values = templateValues[selectedTemplate.id];
    const generatedDocument = useMemo(() => selectedTemplate.build(values), [selectedTemplate, values]);
    const generatedText = useMemo(() => generatedDocumentToText(generatedDocument), [generatedDocument]);
    const generatedHtml = useMemo(() => generatedDocumentToHtml(generatedDocument), [generatedDocument]);
    const filteredAssignments = useMemo(() => {
        const term = normalizeText(assignedSearch).toLowerCase();
        if (!term) {
            return assignments;
        }
        return assignments.filter((assignment) => [
            assignment.title,
            assignment.templateTitle,
            assignment.clientName,
            assignment.clientNumber
        ].some((entry) => entry.toLowerCase().includes(term)));
    }, [assignments, assignedSearch]);
    async function loadModuleData() {
        setLoadingModuleData(true);
        setFlash(null);
        try {
            const [clientRows, assignmentRows] = await Promise.all([
                apiGet("/clients"),
                apiGet("/daily-documents")
            ]);
            setClients(sortClients(clientRows));
            setAssignments(sortAssignedDocuments(assignmentRows));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setLoadingModuleData(false);
        }
    }
    useEffect(() => {
        void loadModuleData();
    }, []);
    function selectTemplate(templateId) {
        const nextTemplate = findTemplate(templateId);
        setSelectedTemplateId(templateId);
        setAssignmentTitle(nextTemplate.title);
        setCopyStatus("");
    }
    function updateValue(fieldName, nextValue) {
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
        }
        catch {
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
                ? await apiPatch(`/daily-documents/${editingDocumentId}`, payload)
                : await apiPost("/daily-documents", payload);
            setAssignments((currentAssignments) => sortAssignedDocuments(currentAssignments.some((assignment) => assignment.id === saved.id)
                ? currentAssignments.map((assignment) => (assignment.id === saved.id ? saved : assignment))
                : [saved, ...currentAssignments]));
            setFlash({
                tone: "success",
                text: editingDocumentId ? "Documento actualizado correctamente." : "Documento asignado correctamente."
            });
            resetDraft();
            setActiveTab("assigned");
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingAssignment(false);
        }
    }
    function editAssignment(assignment) {
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
    async function deleteAssignment(assignment) {
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
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingDocumentId(null);
        }
    }
    function buildAssignmentDocument(assignment) {
        const template = findTemplate(assignment.templateId);
        return template.build(mergeTemplateValues(template, assignment.values));
    }
    async function downloadAssignmentWord(assignment) {
        setFlash(null);
        try {
            await downloadWordDocument(buildAssignmentDocument(assignment));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
    }
    async function downloadAssignmentPdf(assignment) {
        setFlash(null);
        try {
            await downloadPdfDocument(buildAssignmentDocument(assignment));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
    }
    async function handleWordDownload() {
        setCopyStatus("Generando Word...");
        try {
            await downloadWordDocument(generatedDocument);
            setCopyStatus("Word descargado.");
        }
        catch {
            setCopyStatus("No se pudo generar Word.");
        }
    }
    async function handlePdfDownload() {
        setCopyStatus("Generando PDF...");
        try {
            await downloadPdfDocument(generatedDocument);
            setCopyStatus("PDF descargado.");
        }
        catch {
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
    return (_jsxs("section", { className: "page-stack daily-documents-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Docs" }), _jsx("div", { children: _jsx("h2", { children: "Documentos de uso diario" }) })] }), _jsx("p", { className: "muted", children: "Generacion rapida de cartas poder, recibos y entregas recepcion." })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsx("section", { className: "panel daily-doc-tabs-panel", children: _jsxs("div", { className: "leads-tabs daily-doc-tabs", role: "tablist", "aria-label": "Documentos de uso diario", children: [_jsxs("button", { "aria-selected": activeTab === "generate", className: `lead-tab ${activeTab === "generate" ? "is-active" : ""}`, onClick: () => setActiveTab("generate"), type: "button", children: ["Generar y asignar (", dailyDocumentTemplates.length, ")"] }), _jsxs("button", { "aria-selected": activeTab === "assigned", className: `lead-tab ${activeTab === "assigned" ? "is-active" : ""}`, onClick: () => setActiveTab("assigned"), type: "button", children: ["Documentos asignados (", assignments.length, ")"] })] }) }), activeTab === "generate" ? (_jsxs("section", { className: "daily-documents-layout", children: [_jsxs("div", { className: "daily-documents-controls", children: [_jsxs("section", { className: "panel daily-doc-template-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Plantillas" }), _jsxs("span", { children: [dailyDocumentTemplates.length, " disponibles"] })] }), _jsx("div", { className: "daily-doc-template-list", role: "listbox", "aria-label": "Plantillas de documentos", children: dailyDocumentTemplates.map((template) => (_jsxs("button", { "aria-selected": template.id === selectedTemplate.id, className: `daily-doc-template-option${template.id === selectedTemplate.id ? " is-active" : ""}`, onClick: () => selectTemplate(template.id), type: "button", children: [_jsx("strong", { children: template.shortTitle }), _jsx("span", { children: template.summary })] }, template.id))) })] }), _jsxs("section", { className: "panel daily-doc-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: selectedTemplate.title }), _jsx("span", { className: "status-pill status-live", children: editingDocumentId ? "Editando" : "Operativo" })] }), _jsxs("div", { className: "daily-doc-field-grid", children: [_jsxs("label", { className: "form-field daily-doc-field-wide", children: [_jsx("span", { children: "Cliente asignado" }), _jsxs("select", { disabled: loadingModuleData || savingAssignment, onChange: (event) => setSelectedClientId(event.target.value), value: selectedClientId, children: [_jsx("option", { value: "", children: "Selecciona un cliente..." }), clients.map((client) => (_jsxs("option", { value: client.id, children: [client.clientNumber, " - ", client.name] }, client.id)))] })] }), _jsxs("label", { className: "form-field daily-doc-field-wide", children: [_jsx("span", { children: "Nombre del documento asignado" }), _jsx("input", { disabled: savingAssignment, onChange: (event) => setAssignmentTitle(event.target.value), placeholder: "Nombre para ubicarlo en la pesta\u00F1a de asignados", type: "text", value: assignmentTitle })] }), selectedTemplate.fields.map((field) => (_jsxs("label", { className: `form-field${field.type === "textarea" ? " daily-doc-field-wide" : ""}`, children: [_jsx("span", { children: field.label }), field.type === "textarea" ? (_jsx("textarea", { disabled: savingAssignment, onChange: (event) => updateValue(field.name, event.target.value), placeholder: field.placeholder, value: values[field.name] ?? "" })) : (_jsx("input", { disabled: savingAssignment, onChange: (event) => updateValue(field.name, event.target.value), placeholder: field.placeholder, type: field.type ?? "text", value: values[field.name] ?? "" }))] }, field.name)))] }), _jsxs("div", { className: "daily-doc-save-actions", children: [_jsx("button", { className: "primary-button", disabled: savingAssignment, onClick: () => void saveAssignment(), type: "button", children: savingAssignment ? "Guardando..." : editingDocumentId ? "Guardar cambios" : "Asignar a cliente" }), editingDocumentId ? (_jsx("button", { className: "secondary-button", disabled: savingAssignment, onClick: resetDraft, type: "button", children: "Cancelar edicion" })) : null] })] })] }), _jsxs("section", { className: "panel daily-doc-preview-panel", children: [_jsxs("div", { className: "panel-header daily-doc-preview-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Vista previa" }), copyStatus ? _jsx("span", { children: copyStatus }) : null] }), _jsxs("div", { className: "daily-doc-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => void copyDocument(), type: "button", children: "Copiar" }), _jsx("button", { className: "secondary-button", onClick: printDocument, type: "button", children: "Imprimir" }), _jsx("button", { className: "secondary-button", onClick: () => void handleWordDownload(), type: "button", children: "Word" }), _jsx("button", { className: "primary-button", onClick: () => void handlePdfDownload(), type: "button", children: "PDF" })] })] }), _jsx(DocumentPreview, { document: generatedDocument })] })] })) : (_jsxs("section", { className: "panel daily-doc-assigned-panel", children: [_jsxs("div", { className: "panel-header daily-doc-assigned-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Documentos asignados" }), _jsxs("span", { children: [filteredAssignments.length, " de ", assignments.length] })] }), _jsxs("div", { className: "daily-doc-assigned-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => void loadModuleData(), type: "button", children: "Refrescar" }), _jsx("button", { className: "primary-button", onClick: () => {
                                            resetDraft();
                                            setActiveTab("generate");
                                        }, type: "button", children: "Nuevo documento" })] })] }), _jsxs("label", { className: "form-field daily-doc-assigned-search", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { onChange: (event) => setAssignedSearch(event.target.value), placeholder: "Buscar por cliente, numero o documento...", type: "search", value: assignedSearch })] }), _jsx("div", { className: "daily-doc-assigned-table-shell", children: _jsxs("table", { className: "data-table daily-doc-assigned-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Documento" }), _jsx("th", { children: "Plantilla" }), _jsx("th", { children: "Actualizado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loadingModuleData ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 5, children: "Cargando documentos..." }) })) : filteredAssignments.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 5, children: "No hay documentos asignados." }) })) : (filteredAssignments.map((assignment) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("div", { className: "daily-doc-client-cell", children: [_jsx("strong", { children: assignment.clientNumber }), _jsx("span", { children: assignment.clientName })] }) }), _jsx("td", { children: assignment.title }), _jsx("td", { children: assignment.templateTitle }), _jsx("td", { children: new Date(assignment.updatedAt).toLocaleDateString("es-MX") }), _jsx("td", { children: _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => editAssignment(assignment), type: "button", children: "Modificar" }), _jsx("button", { className: "secondary-button", onClick: () => void downloadAssignmentWord(assignment), type: "button", children: "Word" }), _jsx("button", { className: "secondary-button", onClick: () => void downloadAssignmentPdf(assignment), type: "button", children: "PDF" }), _jsx("button", { className: "danger-button", disabled: deletingDocumentId === assignment.id, onClick: () => void deleteAssignment(assignment), type: "button", children: deletingDocumentId === assignment.id ? "Borrando..." : "Borrar" })] }) })] }, assignment.id)))) })] }) })] }))] }));
}
