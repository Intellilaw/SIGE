import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { ORGANIZATION_SLUGS } from "@sige/contracts";
import { useAuth } from "../auth/AuthContext";
const DOCS_BASE_PATH = "/docs/lineamientos-manuales-internos";
const MANIFEST_URL = `${DOCS_BASE_PATH}/manifest.json`;
const VIRGIN_LIBRARY_ORGANIZATION_SLUGS = new Set([
    ORGANIZATION_SLUGS.INTELLILAW,
    ORGANIZATION_SLUGS.LEGALFLOW
]);
function documentHref(file) {
    return `${DOCS_BASE_PATH}/${encodeURIComponent(file)}`;
}
function readManifestDocuments(payload) {
    const documents = Array.isArray(payload) ? payload : payload.documents ?? [];
    return documents
        .filter((document) => document && document.file)
        .map((document) => ({
        file: document.file,
        title: document.title || document.file.replace(/\.[^/.]+$/, "")
    }));
}
function shouldShowVirginLibrary(organizationSlug) {
    return Boolean(organizationSlug && VIRGIN_LIBRARY_ORGANIZATION_SLUGS.has(organizationSlug));
}
export function GuidelinesManualsPage() {
    const { user } = useAuth();
    const [documents, setDocuments] = useState([]);
    const [selectedFile, setSelectedFile] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const showVirginLibrary = shouldShowVirginLibrary(user?.organizationSlug);
    useEffect(() => {
        let active = true;
        async function loadDocuments() {
            if (showVirginLibrary) {
                setDocuments([]);
                setSelectedFile("");
                setError("");
                setLoading(false);
                return;
            }
            try {
                const response = await fetch(MANIFEST_URL, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error("Manifest unavailable");
                }
                const payload = (await response.json());
                const nextDocuments = readManifestDocuments(payload);
                if (active) {
                    setDocuments(nextDocuments);
                    setSelectedFile((current) => current || (nextDocuments[0]?.file ?? ""));
                    setError("");
                }
            }
            catch {
                if (active) {
                    setError("No se pudieron cargar los documentos internos.");
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
    }, [showVirginLibrary]);
    const activeDocument = useMemo(() => documents.find((document) => document.file === selectedFile) ?? documents[0], [documents, selectedFile]);
    return (_jsxs("section", { className: "page-stack guidelines-manuals-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Manuales" }), _jsx("div", { children: _jsx("h2", { children: "Lineamientos y manuales internos" }) })] }), _jsx("p", { className: "muted", children: "Biblioteca de lectura para documentos de organizacion interna." })] }), error ? _jsx("div", { className: "message-banner message-error", children: error }) : null, loading ? _jsx("div", { className: "panel centered-inline-message", children: "Cargando documentos internos..." }) : null, !loading && !error && documents.length === 0 ? (_jsx("div", { className: "panel centered-inline-message", children: "No hay documentos internos registrados." })) : null, !loading && activeDocument ? (_jsxs(_Fragment, { children: [_jsx("section", { className: "internal-doc-tabs", role: "tablist", "aria-label": "Documentos internos", children: documents.map((document) => {
                            const isActive = document.file === activeDocument.file;
                            return (_jsx("button", { type: "button", role: "tab", "aria-selected": isActive, className: `internal-doc-tab ${isActive ? "is-active" : ""}`, onClick: () => setSelectedFile(document.file), children: document.title }, document.file));
                        }) }), _jsx("section", { className: "internal-doc-reader", "aria-label": activeDocument.title, children: _jsx("iframe", { className: "internal-doc-frame", src: documentHref(activeDocument.file), title: activeDocument.title }) })] })) : null] }));
}
