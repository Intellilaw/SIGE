import { useEffect, useMemo, useState } from "react";

const DOCS_BASE_PATH = "/docs/terceros";
const MANIFEST_URL = `${DOCS_BASE_PATH}/manifest.json`;

type ThirdPartyDocument = {
  title: string;
  file: string;
};

type ManifestPayload = ThirdPartyDocument[] | { documents?: ThirdPartyDocument[] };

type DocumentKind = "pdf" | "word" | "ppt" | "excel" | "file";

const KIND_LABELS: Record<DocumentKind, string> = {
  pdf: "PDF",
  word: "Word",
  ppt: "PowerPoint",
  excel: "Excel",
  file: "Archivo"
};

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

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function documentHref(file: string) {
  return `${DOCS_BASE_PATH}/${encodeURIComponent(file)}`;
}

function readManifestDocuments(payload: ManifestPayload): ThirdPartyDocument[] {
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

function DocumentCard({ document }: { document: ThirdPartyDocument }) {
  const extension = extensionFromFile(document.file);
  const kind = kindFromExtension(extension);
  const href = documentHref(document.file);

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

export function ThirdPartyDocumentsPage() {
  const [documents, setDocuments] = useState<ThirdPartyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDocuments() {
      try {
        const response = await fetch(MANIFEST_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Manifest unavailable");
        }

        const payload = (await response.json()) as ManifestPayload;
        if (active) {
          setDocuments(readManifestDocuments(payload));
          setError("");
        }
      } catch {
        if (active) {
          setError("No se pudieron cargar los documentos.");
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
  }, []);

  const filteredDocuments = useMemo(() => {
    const search = normalizeSearchValue(query.trim());

    if (!search) {
      return documents;
    }

    return documents.filter((document) => {
      const haystack = normalizeSearchValue(`${document.title} ${document.file}`);
      return haystack.includes(search);
    });
  }, [documents, query]);

  return (
    <section className="page-stack third-party-documents-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Documentos
          </span>
          <div>
            <h2>Documentos para terceros</h2>
          </div>
        </div>
        <p className="muted">Biblioteca de descarga para documentos externos en PDF, Word, PowerPoint y Excel.</p>
      </header>

      <section className="panel third-party-doc-toolbar">
        <label className="third-party-doc-search">
          <span>Buscar documento</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre o archivo..."
            type="search"
          />
        </label>
        <div className="third-party-doc-count">
          Mostrando {filteredDocuments.length} de {documents.length}
        </div>
      </section>

      {error ? <div className="message-banner message-error">{error}</div> : null}

      <section className="third-party-doc-grid" aria-live="polite">
        {loading ? <div className="panel centered-inline-message">Cargando documentos...</div> : null}
        {!loading && !error && filteredDocuments.length === 0 ? (
          <div className="panel centered-inline-message">No hay documentos que coincidan con la busqueda.</div>
        ) : null}
        {!loading && filteredDocuments.map((document) => <DocumentCard key={document.file} document={document} />)}
      </section>
    </section>
  );
}
