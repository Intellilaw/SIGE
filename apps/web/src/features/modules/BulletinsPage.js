import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import {} from "@sige/contracts";
import { Navigate } from "react-router-dom";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPostLongRunning } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
function todayIso() {
    return new Date().toISOString().slice(0, 10);
}
function createEmptyBlock(index) {
    return {
        id: `block-${Date.now()}-${index}`,
        headingEs: "",
        headingEn: "",
        bodyEs: "",
        bodyEn: ""
    };
}
function draftFromBulletin(bulletin) {
    return {
        bulletinDate: bulletin.bulletinDate,
        titleEs: bulletin.titleEs,
        titleEn: bulletin.titleEn,
        pageCount: bulletin.pageCount,
        twoPageReason: bulletin.twoPageReason,
        blocks: bulletin.blocks.length ? bulletin.blocks : [createEmptyBlock(1)]
    };
}
function formatDate(value) {
    const date = new Date(`${value.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    }).format(date);
}
function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function toErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.readAsDataURL(file);
    });
}
async function toAttachmentInput(file) {
    return {
        originalFileName: file.name,
        fileMimeType: file.type || "application/octet-stream",
        fileBase64: await fileToBase64(file)
    };
}
function downloadBlob(blob, filename) {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
}
export function BulletinsPage() {
    const { user } = useAuth();
    const [bulletins, setBulletins] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [editor, setEditor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);
    const [flash, setFlash] = useState(null);
    const [sidePanel, setSidePanel] = useState(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [generationText, setGenerationText] = useState("");
    const [generationUrls, setGenerationUrls] = useState("");
    const [generationFiles, setGenerationFiles] = useState([]);
    const [uploadTitle, setUploadTitle] = useState("");
    const [uploadDate, setUploadDate] = useState(todayIso());
    const [uploadDocx, setUploadDocx] = useState(null);
    const [uploadPdf, setUploadPdf] = useState(null);
    const selected = useMemo(() => bulletins.find((bulletin) => bulletin.id === selectedId) ?? null, [bulletins, selectedId]);
    const filteredBulletins = useMemo(() => {
        const query = search.trim().toLocaleLowerCase("es");
        return bulletins.filter((bulletin) => {
            if (statusFilter !== "ALL" && bulletin.status !== statusFilter)
                return false;
            if (!query)
                return true;
            return [
                bulletin.titleEs,
                bulletin.titleEn,
                bulletin.createdByName ?? "",
                bulletin.approvedByName ?? ""
            ].some((value) => value.toLocaleLowerCase("es").includes(query));
        });
    }, [bulletins, search, statusFilter]);
    async function loadBulletins(preferredId) {
        setLoading(true);
        setFlash(null);
        try {
            const rows = await apiGet("/bulletins");
            setBulletins(rows);
            const nextId = preferredId && rows.some((row) => row.id === preferredId)
                ? preferredId
                : selectedId && rows.some((row) => row.id === selectedId)
                    ? selectedId
                    : rows[0]?.id ?? null;
            setSelectedId(nextId);
            const nextSelected = rows.find((row) => row.id === nextId);
            setEditor(nextSelected?.origin === "GENERATED" ? draftFromBulletin(nextSelected) : null);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
            setBulletins([]);
            setSelectedId(null);
            setEditor(null);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadBulletins();
    }, []);
    function selectBulletin(bulletin) {
        setSelectedId(bulletin.id);
        setEditor(bulletin.origin === "GENERATED" ? draftFromBulletin(bulletin) : null);
        setSidePanel(null);
        setFlash(null);
    }
    async function handleGenerate(event) {
        event.preventDefault();
        if (!generationText.trim() && !generationUrls.trim() && generationFiles.length === 0) {
            setFlash({ tone: "error", text: "Proporciona texto, una URL o por lo menos un archivo." });
            return;
        }
        setBusy("generate");
        setFlash({ tone: "warning", text: "OpenAI esta investigando y preparando el borrador bilingue..." });
        try {
            const attachments = await Promise.all(generationFiles.map(toAttachmentInput));
            const sourceUrls = generationUrls
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter(Boolean);
            const created = await apiPostLongRunning("/bulletins/generate", {
                sourceText: generationText.trim() || null,
                sourceUrls,
                attachments
            });
            setGenerationText("");
            setGenerationUrls("");
            setGenerationFiles([]);
            setSidePanel(null);
            await loadBulletins(created.id);
            setFlash({
                tone: "success",
                text: "Borrador generado. Revisa ambos idiomas y apruebalo para producir Word y PDF."
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setBusy(null);
        }
    }
    async function saveEditor(options = {}) {
        if (!selected || !editor)
            return null;
        const saved = await apiPatch(`/bulletins/${selected.id}`, editor);
        setBulletins((current) => current.map((item) => item.id === saved.id ? saved : item));
        setEditor(draftFromBulletin(saved));
        if (!options.quiet) {
            setFlash({ tone: "success", text: "Borrador guardado. La aprobacion sigue pendiente." });
        }
        return saved;
    }
    async function handleSaveDraft() {
        setBusy("save");
        setFlash(null);
        try {
            await saveEditor();
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setBusy(null);
        }
    }
    async function handleApprove() {
        if (!selected || !editor)
            return;
        setBusy("approve");
        setFlash(null);
        try {
            const saved = await saveEditor({ quiet: true });
            if (!saved)
                return;
            const approved = await apiPostLongRunning(`/bulletins/${saved.id}/approve`, {});
            setBulletins((current) => current.map((item) => item.id === approved.id ? approved : item));
            setEditor(draftFromBulletin(approved));
            setFlash({ tone: "success", text: "Boletin aprobado. Los archivos Word y PDF ya estan disponibles." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setBusy(null);
        }
    }
    async function handleUpload(event) {
        event.preventDefault();
        if (!uploadDocx && !uploadPdf) {
            setFlash({ tone: "error", text: "Carga por lo menos un archivo Word o PDF." });
            return;
        }
        setBusy("upload");
        setFlash(null);
        try {
            const created = await apiPostLongRunning("/bulletins/upload", {
                title: uploadTitle,
                bulletinDate: uploadDate,
                docx: uploadDocx ? await toAttachmentInput(uploadDocx) : null,
                pdf: uploadPdf ? await toAttachmentInput(uploadPdf) : null
            });
            setUploadTitle("");
            setUploadDate(todayIso());
            setUploadDocx(null);
            setUploadPdf(null);
            setSidePanel(null);
            await loadBulletins(created.id);
            setFlash({ tone: "success", text: "Boletin historico cargado en la biblioteca." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setBusy(null);
        }
    }
    async function handleDownload(format) {
        if (!selected)
            return;
        setBusy(`download-${format}`);
        setFlash(null);
        try {
            const result = await apiDownload(`/bulletins/${selected.id}/download/${format}`);
            downloadBlob(result.blob, result.filename ?? `boletin.${format}`);
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setBusy(null);
        }
    }
    async function handleDelete() {
        if (!selected || !window.confirm(`¿Eliminar "${selected.titleEs}" de la biblioteca?`))
            return;
        setBusy("delete");
        setFlash(null);
        try {
            await apiDelete(`/bulletins/${selected.id}`);
            const remaining = bulletins.filter((item) => item.id !== selected.id);
            setBulletins(remaining);
            setSelectedId(remaining[0]?.id ?? null);
            setEditor(remaining[0]?.origin === "GENERATED" ? draftFromBulletin(remaining[0]) : null);
            setFlash({ tone: "success", text: "Boletin eliminado de la biblioteca." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setBusy(null);
        }
    }
    function updateEditor(key, value) {
        setEditor((current) => current ? { ...current, [key]: value } : current);
        setFlash(null);
    }
    function updateBlock(blockId, key, value) {
        setEditor((current) => current
            ? {
                ...current,
                blocks: current.blocks.map((block) => block.id === blockId ? { ...block, [key]: value } : block)
            }
            : current);
        setFlash(null);
    }
    function addBlock() {
        setEditor((current) => current && current.blocks.length < 5
            ? { ...current, blocks: [...current.blocks, createEmptyBlock(current.blocks.length + 1)] }
            : current);
    }
    function removeBlock(blockId) {
        setEditor((current) => current && current.blocks.length > 1
            ? { ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }
            : current);
    }
    if (user?.isExternal) {
        return _jsx(Navigate, { to: "/app", replace: true });
    }
    return (_jsxs("section", { className: "page-stack bulletins-page", children: [_jsxs("header", { className: "hero module-hero bulletins-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "\u{1F4F0}" }), _jsxs("div", { children: [_jsx("h2", { children: "Boletines" }), _jsx("p", { className: "muted", children: "Biblioteca y generador bilingue de comunicaciones breves para clientes." })] })] }), _jsxs("div", { className: "bulletins-hero-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => setSidePanel((current) => current === "upload" ? null : "upload"), type: "button", children: "Cargar boletin anterior" }), _jsx("button", { className: "primary-button", onClick: () => setSidePanel((current) => current === "generate" ? null : "generate"), type: "button", children: "Nuevo boletin" })] })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success"
                    ? "message-success"
                    : flash.tone === "warning"
                        ? "message-warning"
                        : "message-error"}`, children: flash.text })) : null, sidePanel === "generate" ? (_jsxs("section", { className: "panel bulletins-create-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("span", { className: "bulletins-eyebrow", children: "Rusconi Intelligence" }), _jsx("h2", { children: "Generar borrador" }), _jsx("p", { className: "muted", children: "Describe la noticia o reforma. Puedes agregar URLs y documentos de respaldo." })] }) }), _jsxs("form", { className: "bulletins-generation-form", onSubmit: handleGenerate, children: [_jsxs("label", { className: "bulletins-field bulletins-field-wide", children: [_jsx("span", { children: "Texto o instrucciones" }), _jsx("textarea", { onChange: (event) => setGenerationText(event.target.value), placeholder: "Ejemplo: Informa a nuestros clientes sobre la reforma publicada hoy al Codigo Penal de la Ciudad de Mexico y explica sus efectos practicos.", rows: 6, value: generationText })] }), _jsxs("label", { className: "bulletins-field", children: [_jsx("span", { children: "URLs, una por linea" }), _jsx("textarea", { onChange: (event) => setGenerationUrls(event.target.value), placeholder: "https://...", rows: 4, value: generationUrls })] }), _jsxs("label", { className: "bulletins-field bulletins-file-field", children: [_jsx("span", { children: "Adjuntos" }), _jsx("input", { accept: ".pdf,.docx,.txt,.jpg,.jpeg,.png", multiple: true, onChange: (event) => setGenerationFiles(Array.from(event.target.files ?? [])), type: "file" }), _jsx("small", { children: "PDF, DOCX, TXT, JPG o PNG. Hasta 6 archivos y 18 MB en conjunto." }), generationFiles.length ? (_jsx("div", { className: "bulletins-file-list", children: generationFiles.map((file) => (_jsxs("span", { children: [file.name, " \u00B7 ", formatFileSize(file.size)] }, `${file.name}-${file.size}`))) })) : null] }), _jsxs("div", { className: "bulletins-form-actions bulletins-field-wide", children: [_jsx("button", { className: "secondary-button", onClick: () => setSidePanel(null), type: "button", children: "Cancelar" }), _jsx("button", { className: "primary-button", disabled: busy === "generate", type: "submit", children: busy === "generate" ? "Investigando y redactando..." : "Generar borrador bilingue" })] })] })] })) : null, sidePanel === "upload" ? (_jsxs("section", { className: "panel bulletins-create-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("span", { className: "bulletins-eyebrow", children: "Archivo historico" }), _jsx("h2", { children: "Cargar boletin anterior" }), _jsx("p", { className: "muted", children: "Puedes cargar Word, PDF o ambos. El registro se guardara como aprobado." })] }) }), _jsxs("form", { className: "bulletins-upload-form", onSubmit: handleUpload, children: [_jsxs("label", { className: "bulletins-field bulletins-field-wide", children: [_jsx("span", { children: "Titulo" }), _jsx("input", { maxLength: 180, onChange: (event) => setUploadTitle(event.target.value), required: true, value: uploadTitle })] }), _jsxs("label", { className: "bulletins-field", children: [_jsx("span", { children: "Fecha" }), _jsx("input", { onChange: (event) => setUploadDate(event.target.value), required: true, type: "date", value: uploadDate })] }), _jsxs("label", { className: "bulletins-field bulletins-file-field", children: [_jsx("span", { children: "Word" }), _jsx("input", { accept: ".docx", onChange: (event) => setUploadDocx(event.target.files?.[0] ?? null), type: "file" })] }), _jsxs("label", { className: "bulletins-field bulletins-file-field", children: [_jsx("span", { children: "PDF" }), _jsx("input", { accept: ".pdf", onChange: (event) => setUploadPdf(event.target.files?.[0] ?? null), type: "file" })] }), _jsxs("div", { className: "bulletins-form-actions bulletins-field-wide", children: [_jsx("button", { className: "secondary-button", onClick: () => setSidePanel(null), type: "button", children: "Cancelar" }), _jsx("button", { className: "primary-button", disabled: busy === "upload", type: "submit", children: busy === "upload" ? "Cargando..." : "Guardar en biblioteca" })] })] })] })) : null, _jsxs("div", { className: "bulletins-workspace", children: [_jsxs("aside", { className: "panel bulletins-library", children: [_jsx("div", { className: "bulletins-library-header", children: _jsxs("div", { children: [_jsx("span", { className: "bulletins-eyebrow", children: "Biblioteca" }), _jsxs("h2", { children: [bulletins.length, " boletines"] })] }) }), _jsxs("div", { className: "bulletins-filters", children: [_jsx("input", { "aria-label": "Buscar boletin", onChange: (event) => setSearch(event.target.value), placeholder: "Buscar...", type: "search", value: search }), _jsxs("select", { "aria-label": "Filtrar por estado", onChange: (event) => setStatusFilter(event.target.value), value: statusFilter, children: [_jsx("option", { value: "ALL", children: "Todos" }), _jsx("option", { value: "DRAFT", children: "Borradores" }), _jsx("option", { value: "APPROVED", children: "Aprobados" })] })] }), loading ? _jsx("div", { className: "centered-inline-message", children: "Cargando boletines..." }) : null, !loading && filteredBulletins.length === 0 ? (_jsxs("div", { className: "bulletins-empty-list", children: [_jsx("strong", { children: "No hay boletines" }), _jsx("span", { children: "Genera el primero o carga uno anterior." })] })) : null, _jsx("div", { className: "bulletins-list", children: filteredBulletins.map((bulletin) => (_jsxs("button", { className: `bulletins-list-item ${bulletin.id === selectedId ? "is-active" : ""}`, onClick: () => selectBulletin(bulletin), type: "button", children: [_jsxs("span", { className: "bulletins-list-item-top", children: [_jsx("span", { className: `status-pill ${bulletin.status === "APPROVED" ? "status-live" : "status-warning"}`, children: bulletin.status === "APPROVED" ? "Aprobado" : "Borrador" }), _jsx("time", { children: formatDate(bulletin.bulletinDate) })] }), _jsx("strong", { children: bulletin.titleEs }), _jsx("span", { children: bulletin.origin === "UPLOADED" ? "Cargado" : `${bulletin.pageCount} pág. · Bilingüe` })] }, bulletin.id))) })] }), _jsx("section", { className: "panel bulletins-detail", children: !selected ? (_jsxs("div", { className: "bulletins-empty-detail", children: [_jsx("span", { "aria-hidden": "true", children: "RC" }), _jsx("h2", { children: "Selecciona un boletin" }), _jsx("p", { className: "muted", children: "Los borradores se pueden editar y deben aprobarse antes de descargar." })] })) : selected.origin === "UPLOADED" ? (_jsxs("div", { className: "bulletins-uploaded-detail", children: [_jsxs("div", { className: "bulletins-detail-heading", children: [_jsxs("div", { children: [_jsx("span", { className: "bulletins-eyebrow", children: "Boletin historico" }), _jsx("h2", { children: selected.titleEs }), _jsx("p", { className: "muted", children: formatDate(selected.bulletinDate) })] }), _jsx("span", { className: "status-pill status-live", children: "Aprobado" })] }), _jsxs("div", { className: "bulletins-uploaded-file-actions", children: [selected.hasDocx ? (_jsx("button", { className: "primary-button", onClick: () => void handleDownload("docx"), type: "button", children: busy === "download-docx" ? "Descargando..." : "Descargar Word" })) : null, selected.hasPdf ? (_jsx("button", { className: "primary-button", onClick: () => void handleDownload("pdf"), type: "button", children: busy === "download-pdf" ? "Descargando..." : "Descargar PDF" })) : null, _jsx("button", { className: "danger-button", disabled: busy === "delete", onClick: () => void handleDelete(), type: "button", children: "Eliminar" })] })] })) : editor ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "bulletins-detail-heading", children: [_jsxs("div", { children: [_jsx("span", { className: "bulletins-eyebrow", children: "Editor bilingue" }), _jsx("h2", { children: selected.status === "APPROVED" ? "Boletin aprobado" : "Revision obligatoria" }), _jsx("p", { className: "muted", children: selected.status === "APPROVED"
                                                        ? `Aprobado por ${selected.approvedByName ?? "usuario interno"}. Guardar cambios lo regresara a borrador.`
                                                        : "Revisa la precision y equivalencia de ambos idiomas antes de aprobar." })] }), _jsx("span", { className: `status-pill ${selected.status === "APPROVED" ? "status-live" : "status-warning"}`, children: selected.status === "APPROVED" ? "Aprobado" : "Borrador" })] }), _jsxs("div", { className: "bulletins-editor-meta", children: [_jsxs("label", { className: "bulletins-field", children: [_jsx("span", { children: "Fecha del boletin" }), _jsx("input", { onChange: (event) => updateEditor("bulletinDate", event.target.value), type: "date", value: editor.bulletinDate })] }), _jsxs("label", { className: "bulletins-field", children: [_jsx("span", { children: "Extension aprobada" }), _jsxs("select", { onChange: (event) => updateEditor("pageCount", Number(event.target.value) === 2 ? 2 : 1), value: editor.pageCount, children: [_jsx("option", { value: 1, children: "Una pagina" }), _jsx("option", { value: 2, children: "Dos paginas, excepcionalmente" })] })] }), selected.attachments.length ? (_jsxs("div", { className: "bulletins-source-count", children: [_jsx("span", { children: "Material recibido" }), _jsxs("strong", { children: [selected.attachments.length, " adjunto", selected.attachments.length === 1 ? "" : "s"] })] })) : null] }), editor.pageCount === 2 ? (_jsxs("label", { className: "bulletins-field bulletins-field-wide", children: [_jsx("span", { children: "Justificacion de la segunda pagina" }), _jsx("input", { maxLength: 300, onChange: (event) => updateEditor("twoPageReason", event.target.value), placeholder: "Explica por que el contenido no puede abreviarse sin perder utilidad.", value: editor.twoPageReason ?? "" })] })) : null, _jsxs("div", { className: "bulletins-title-grid", children: [_jsxs("label", { className: "bulletins-field", children: [_jsx("span", { children: "Titulo en espa\u00F1ol" }), _jsx("textarea", { maxLength: 180, onChange: (event) => updateEditor("titleEs", event.target.value), rows: 2, value: editor.titleEs })] }), _jsxs("label", { className: "bulletins-field", children: [_jsx("span", { children: "English title" }), _jsx("textarea", { maxLength: 180, onChange: (event) => updateEditor("titleEn", event.target.value), rows: 2, value: editor.titleEn })] })] }), _jsx("div", { className: "bulletins-blocks", children: editor.blocks.map((block, index) => (_jsxs("section", { className: "bulletins-block-editor", children: [_jsxs("div", { className: "bulletins-block-heading", children: [_jsxs("span", { children: ["Bloque ", index + 1] }), editor.blocks.length > 1 ? (_jsx("button", { className: "ghost-button", onClick: () => removeBlock(block.id), type: "button", children: "Quitar" })) : null] }), _jsxs("div", { className: "bulletins-block-grid", children: [_jsxs("div", { className: "bulletins-language-column", children: [_jsx("span", { className: "bulletins-language-label", children: "ESPA\u00D1OL" }), _jsx("input", { maxLength: 120, onChange: (event) => updateBlock(block.id, "headingEs", event.target.value), placeholder: "Encabezado breve", value: block.headingEs }), _jsx("textarea", { maxLength: 2200, onChange: (event) => updateBlock(block.id, "bodyEs", event.target.value), rows: 6, value: block.bodyEs })] }), _jsxs("div", { className: "bulletins-language-column", children: [_jsx("span", { className: "bulletins-language-label", children: "ENGLISH" }), _jsx("input", { maxLength: 120, onChange: (event) => updateBlock(block.id, "headingEn", event.target.value), placeholder: "Short heading", value: block.headingEn }), _jsx("textarea", { maxLength: 2200, onChange: (event) => updateBlock(block.id, "bodyEn", event.target.value), rows: 6, value: block.bodyEn })] })] })] }, block.id))) }), editor.blocks.length < 5 ? (_jsx("button", { className: "secondary-button bulletins-add-block", onClick: addBlock, type: "button", children: "Agregar bloque" })) : null, _jsx("div", { className: "bulletins-preview", children: _jsxs("div", { className: "bulletins-preview-paper", children: [_jsx("div", { className: "bulletins-preview-kicker", children: "BOLET\u00CDN PARA CLIENTES\u00A0\u00A0|\u00A0\u00A0CLIENT BULLETIN" }), _jsx("div", { className: "bulletins-preview-date", children: formatDate(editor.bulletinDate) }), _jsxs("div", { className: "bulletins-preview-titles", children: [_jsx("strong", { children: editor.titleEs }), _jsx("strong", { children: editor.titleEn })] }), _jsxs("div", { className: "bulletins-preview-labels", children: [_jsx("span", { children: "ESPA\u00D1OL" }), _jsx("span", { children: "ENGLISH" })] }), editor.blocks.map((block) => (_jsxs("div", { className: "bulletins-preview-row", children: [_jsxs("div", { children: [block.headingEs ? _jsx("strong", { children: block.headingEs }) : null, _jsx("p", { children: block.bodyEs })] }), _jsxs("div", { children: [block.headingEn ? _jsx("strong", { children: block.headingEn }) : null, _jsx("p", { children: block.bodyEn })] })] }, `preview-${block.id}`))), _jsx("div", { className: "bulletins-preview-signature", children: "Rusconi Consulting" })] }) }), _jsxs("div", { className: "bulletins-editor-actions", children: [_jsx("button", { className: "danger-button", disabled: busy === "delete", onClick: () => void handleDelete(), type: "button", children: "Eliminar" }), _jsxs("div", { children: [selected.status === "APPROVED" ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", onClick: () => void handleDownload("docx"), type: "button", children: "Word" }), _jsx("button", { className: "secondary-button", onClick: () => void handleDownload("pdf"), type: "button", children: "PDF" })] })) : null, _jsx("button", { className: "secondary-button", disabled: busy === "save", onClick: () => void handleSaveDraft(), type: "button", children: busy === "save" ? "Guardando..." : "Guardar borrador" }), _jsx("button", { className: "primary-button", disabled: busy === "approve", onClick: () => void handleApprove(), type: "button", children: busy === "approve" ? "Generando Word y PDF..." : "Aprobar y generar archivos" })] })] })] })) : null })] })] }));
}
