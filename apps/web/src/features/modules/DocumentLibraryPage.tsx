import { useEffect, useMemo, useState } from "react";
import { ORGANIZATION_SLUGS } from "@sige/contracts";

import { useAuth } from "../auth/AuthContext";

export type LibraryDocument = {
  title: string;
  file: string;
};

type ManifestPayload = LibraryDocument[] | { documents?: LibraryDocument[] };

type DocumentKind = "pdf" | "word" | "ppt" | "excel" | "file";

type DocumentLibraryPageProps = {
  basePath: string;
  title: string;
  iconLabel: string;
  description: string;
  pageClassName?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  loadErrorMessage?: string;
  filterDocument?: (document: LibraryDocument) => boolean;
};

const KIND_LABELS: Record<DocumentKind, string> = {
  pdf: "PDF",
  word: "Word",
  ppt: "PowerPoint",
  excel: "Excel",
  file: "Archivo"
};

const VIRGIN_LIBRARY_ORGANIZATION_SLUGS = new Set<string>([
  ORGANIZATION_SLUGS.INTELLILAW
]);

function shouldShowVirginLibrary(organizationSlug?: string) {
  return Boolean(organizationSlug && VIRGIN_LIBRARY_ORGANIZATION_SLUGS.has(organizationSlug));
}

function extensionFromFile(filename: string) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()?.toLowerCase() ?? "" : "";
}

function kindFromExtension(extension: string): DocumentKind {
  if (extension === "pdf") return "pdf";
  if (extension === "doc" || extension === "docx") return "word";
  if (extension === "ppt" || extension === "pptx") return "ppt";
  if (extension === "xls" || extension === "xlsx") return "excel";
  return "file";
}

function titleFromFile(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDocumentSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function documentHref(basePath: string, file: string) {
  return `${basePath}/${encodeURIComponent(file)}`;
}

function readManifestDocuments(payload: ManifestPayload): LibraryDocument[] {
  const documents = Array.isArray(payload) ? payload : payload.documents ?? [];

  return documents
    .filter((document) => document && document.file)
    .map((document) => ({
      file: document.file,
      title: document.title || titleFromFile(document.file)
    }));
}

function FileIcon({ kind }: { kind: DocumentKind }) {
  return (
    <svg className={`third-party-doc-icon third-party-doc-icon-${kind}`} viewBox="0 0 64 64" aria-hidden="true">
      <path
        d="M14 6h24l12 12v40a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"
        fill="currentColor"
        opacity="0.12"
      />
      <path d="M38 6v12h12" fill="currentColor" opacity="0.22" />
      <path
        d="M14 6h24l12 12v40a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect x="13" y="36" width="38" height="18" rx="4" fill="currentColor" />
      <text x="32" y="49" textAnchor="middle" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">
        {KIND_LABELS[kind].slice(0, 4).toUpperCase()}
      </text>
    </svg>
  );
}

function DocumentCard({ basePath, document }: { basePath: string; document: LibraryDocument }) {
  const extension = extensionFromFile(document.file);
  const kind = kindFromExtension(extension);
  const href = documentHref(basePath, document.file);

  return (
    <article className="third-party-doc-card">
      <div className="third-party-doc-icon-shell">
        <FileIcon kind={kind} />
      </div>
      <div className="third-party-doc-body">
        <h3>{document.title}</h3>
        <div className="third-party-doc-meta">
          <span>{extension ? extension.toUpperCase() : "ARCHIVO"}</span>
          <span>{KIND_LABELS[kind]}</span>
        </div>
        <div className="third-party-doc-actions">
          <a className="primary-button third-party-doc-button" href={href} download={document.file}>
            Descargar
          </a>
          <a className="secondary-button third-party-doc-button" href={href} target="_blank" rel="noreferrer">
            Abrir
          </a>
        </div>
      </div>
    </article>
  );
}

export function DocumentLibraryPage({
  basePath,
  title,
  iconLabel,
  description,
  pageClassName = "",
  searchLabel = "Buscar documento",
  searchPlaceholder = "Buscar por nombre o archivo...",
  emptyMessage = "No hay documentos que coincidan con la busqueda.",
  loadingMessage = "Cargando documentos...",
  loadErrorMessage = "No se pudieron cargar los documentos.",
  filterDocument
}: DocumentLibraryPageProps) {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
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

        const payload = (await response.json()) as ManifestPayload;
        const manifestDocuments = readManifestDocuments(payload);
        if (active) {
          setDocuments(filterDocument ? manifestDocuments.filter(filterDocument) : manifestDocuments);
          setError("");
        }
      } catch {
        if (active) {
          setError(loadErrorMessage);
        }
      } finally {
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

  return (
    <section className={`page-stack ${pageClassName}`.trim()}>
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            {iconLabel}
          </span>
          <div>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="muted">{description}</p>
      </header>

      <section className="panel third-party-doc-toolbar">
        <label className="third-party-doc-search">
          <span>{searchLabel}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} type="search" />
        </label>
        <div className="third-party-doc-count">
          Mostrando {filteredDocuments.length} de {documents.length}
        </div>
      </section>

      {error ? <div className="message-banner message-error">{error}</div> : null}

      <section className="third-party-doc-grid" aria-live="polite">
        {loading ? <div className="panel centered-inline-message">{loadingMessage}</div> : null}
        {!loading && !error && filteredDocuments.length === 0 ? (
          <div className="panel centered-inline-message">{emptyMessage}</div>
        ) : null}
        {!loading && filteredDocuments.map((document) => <DocumentCard key={document.file} basePath={basePath} document={document} />)}
      </section>
    </section>
  );
}
