import { useEffect, useMemo, useState } from "react";

const DOCS_BASE_PATH = "/docs/lineamientos-manuales-internos";
const MANIFEST_URL = `${DOCS_BASE_PATH}/manifest.json`;

type InternalDocument = {
  title: string;
  file: string;
};

type ManifestPayload = InternalDocument[] | { documents?: InternalDocument[] };

function documentHref(file: string) {
  return `${DOCS_BASE_PATH}/${encodeURIComponent(file)}`;
}

function readManifestDocuments(payload: ManifestPayload): InternalDocument[] {
  const documents = Array.isArray(payload) ? payload : payload.documents ?? [];

  return documents
    .filter((document) => document && document.file)
    .map((document) => ({
      file: document.file,
      title: document.title || document.file.replace(/\.[^/.]+$/, "")
    }));
}

export function GuidelinesManualsPage() {
  const [documents, setDocuments] = useState<InternalDocument[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDocuments() {
      try {
        const response = await fetch(MANIFEST_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Manifest unavailable");
        }

        const payload = (await response.json()) as ManifestPayload;
        const nextDocuments = readManifestDocuments(payload);

        if (active) {
          setDocuments(nextDocuments);
          setSelectedFile((current) => current || (nextDocuments[0]?.file ?? ""));
          setError("");
        }
      } catch {
        if (active) {
          setError("No se pudieron cargar los documentos internos.");
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

  const activeDocument = useMemo(
    () => documents.find((document) => document.file === selectedFile) ?? documents[0],
    [documents, selectedFile]
  );

  return (
    <section className="page-stack guidelines-manuals-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Manuales
          </span>
          <div>
            <h2>Lineamientos y manuales internos</h2>
          </div>
        </div>
        <p className="muted">Biblioteca de lectura para documentos de organizacion interna.</p>
      </header>

      {error ? <div className="message-banner message-error">{error}</div> : null}
      {loading ? <div className="panel centered-inline-message">Cargando documentos internos...</div> : null}
      {!loading && !error && documents.length === 0 ? (
        <div className="panel centered-inline-message">No hay documentos internos registrados.</div>
      ) : null}

      {!loading && activeDocument ? (
        <>
          <section className="internal-doc-tabs" role="tablist" aria-label="Documentos internos">
            {documents.map((document) => {
              const isActive = document.file === activeDocument.file;

              return (
                <button
                  key={document.file}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`internal-doc-tab ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelectedFile(document.file)}
                >
                  {document.title}
                </button>
              );
            })}
          </section>

          <section className="internal-doc-reader" aria-label={activeDocument.title}>
            <iframe className="internal-doc-frame" src={documentHref(activeDocument.file)} title={activeDocument.title} />
          </section>
        </>
      ) : null}
    </section>
  );
}
