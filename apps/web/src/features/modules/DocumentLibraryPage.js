import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { ORGANIZATION_SLUGS } from "@sige/contracts";
import { useAuth } from "../auth/AuthContext";
const KIND_LABELS = {
    pdf: "PDF",
    word: "Word",
    ppt: "PowerPoint",
    excel: "Excel",
    file: "Archivo"
};
const VIRGIN_LIBRARY_ORGANIZATION_SLUGS = new Set([
    ORGANIZATION_SLUGS.INTELLILAW
]);
function shouldShowVirginLibrary(organizationSlug) {
    return Boolean(organizationSlug && VIRGIN_LIBRARY_ORGANIZATION_SLUGS.has(organizationSlug));
}
function extensionFromFile(filename) {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
}
function kindFromExtension(extension) {
    if (extension === "pdf")
        return "pdf";
    if (extension === "doc" || extension === "docx")
        return "word";
    if (extension === "ppt" || extension === "pptx")
        return "ppt";
    if (extension === "xls" || extension === "xlsx")
        return "excel";
    return "file";
}
function titleFromFile(filename) {
    return filename
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
export function normalizeDocumentSearchValue(value) {
    return value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function documentHref(basePath, file) {
    return `${basePath}/${encodeURIComponent(file)}`;
}
function readManifestDocuments(payload) {
    const documents = Array.isArray(payload) ? payload : payload.documents ?? [];
    return documents
        .filter((document) => document && document.file)
        .map((document) => ({
        file: document.file,
        title: document.title || titleFromFile(document.file)
    }));
}
function FileIcon({ kind }) {
    return (_jsxs("svg", { className: `third-party-doc-icon third-party-doc-icon-${kind}`, viewBox: "0 0 64 64", "aria-hidden": "true", children: [_jsx("path", { d: "M14 6h24l12 12v40a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z", fill: "currentColor", opacity: "0.12" }), _jsx("path", { d: "M38 6v12h12", fill: "currentColor", opacity: "0.22" }), _jsx("path", { d: "M14 6h24l12 12v40a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z", fill: "none", stroke: "currentColor", strokeWidth: "2" }), _jsx("rect", { x: "13", y: "36", width: "38", height: "18", rx: "4", fill: "currentColor" }), _jsx("text", { x: "32", y: "49", textAnchor: "middle", fontSize: "11", fontWeight: "800", fill: "#fff", fontFamily: "Arial, sans-serif", children: KIND_LABELS[kind].slice(0, 4).toUpperCase() })] }));
}
function DocumentCard({ basePath, document }) {
    const extension = extensionFromFile(document.file);
    const kind = kindFromExtension(extension);
    const href = documentHref(basePath, document.file);
    return (_jsxs("article", { className: "third-party-doc-card", children: [_jsx("div", { className: "third-party-doc-icon-shell", children: _jsx(FileIcon, { kind: kind }) }), _jsxs("div", { className: "third-party-doc-body", children: [_jsx("h3", { children: document.title }), _jsxs("div", { className: "third-party-doc-meta", children: [_jsx("span", { children: extension ? extension.toUpperCase() : "ARCHIVO" }), _jsx("span", { children: KIND_LABELS[kind] })] }), _jsxs("div", { className: "third-party-doc-actions", children: [_jsx("a", { className: "primary-button third-party-doc-button", href: href, download: document.file, children: "Descargar" }), _jsx("a", { className: "secondary-button third-party-doc-button", href: href, target: "_blank", rel: "noreferrer", children: "Abrir" })] })] })] }));
}
export function DocumentLibraryPage({ basePath, title, iconLabel, description, pageClassName = "", searchLabel = "Buscar documento", searchPlaceholder = "Buscar por nombre o archivo...", emptyMessage = "No hay documentos que coincidan con la busqueda.", loadingMessage = "Cargando documentos...", loadErrorMessage = "No se pudieron cargar los documentos.", filterDocument }) {
    const { user } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const manifestUrl = `${basePath}/manifest.json`;
    const showVirginLibrary = shouldShowVirginLibrary(user?.organizationSlug);
    useEffect(() => {
        let active = true;
        async function loadDocuments() {
            if (showVirginLibrary) {
                setDocuments([]);
                setError("");
                setLoading(false);
                return;
            }
            try {
                setLoading(true);
                const response = await fetch(manifestUrl, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error("Manifest unavailable");
                }
                const payload = (await response.json());
                const manifestDocuments = readManifestDocuments(payload);
                if (active) {
                    setDocuments(filterDocument ? manifestDocuments.filter(filterDocument) : manifestDocuments);
                    setError("");
                }
            }
            catch {
                if (active) {
                    setError(loadErrorMessage);
                }
            }
            finally {
                if (active) {
                    setLoading(false);
                }
            }
        }
        void loadDocuments();
        return () => {
            active = false;
        };
    }, [filterDocument, loadErrorMessage, manifestUrl, showVirginLibrary]);
    const filteredDocuments = useMemo(() => {
        const search = normalizeDocumentSearchValue(query.trim());
        if (!search) {
            return documents;
        }
        return documents.filter((document) => {
            const haystack = normalizeDocumentSearchValue(`${document.title} ${document.file}`);
            return haystack.includes(search);
        });
    }, [documents, query]);
    return (_jsxs("section", { className: `page-stack ${pageClassName}`.trim(), children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: iconLabel }), _jsx("div", { children: _jsx("h2", { children: title }) })] }), _jsx("p", { className: "muted", children: description })] }), _jsxs("section", { className: "panel third-party-doc-toolbar", children: [_jsxs("label", { className: "third-party-doc-search", children: [_jsx("span", { children: searchLabel }), _jsx("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: searchPlaceholder, type: "search" })] }), _jsxs("div", { className: "third-party-doc-count", children: ["Mostrando ", filteredDocuments.length, " de ", documents.length] })] }), error ? _jsx("div", { className: "message-banner message-error", children: error }) : null, _jsxs("section", { className: "third-party-doc-grid", "aria-live": "polite", children: [loading ? _jsx("div", { className: "panel centered-inline-message", children: loadingMessage }) : null, !loading && !error && filteredDocuments.length === 0 ? (_jsx("div", { className: "panel centered-inline-message", children: emptyMessage })) : null, !loading && filteredDocuments.map((document) => _jsx(DocumentCard, { basePath: basePath, document: document }, document.file))] })] }));
}
