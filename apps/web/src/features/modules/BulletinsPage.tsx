import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  type Bulletin,
  type BulletinBlock,
  type BulletinDraftInput,
  type BulletinGenerationAttachmentInput
} from "@sige/contracts";
import { Navigate } from "react-router-dom";

import {
  apiDelete,
  apiDownload,
  apiGet,
  apiPatch,
  apiPostLongRunning
} from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type FlashState = { tone: "success" | "error" | "warning"; text: string } | null;
type SidePanel = "generate" | "upload" | null;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyBlock(index: number): BulletinBlock {
  return {
    id: `block-${Date.now()}-${index}`,
    headingEs: "",
    headingEn: "",
    bodyEs: "",
    bodyEn: ""
  };
}

function draftFromBulletin(bulletin: Bulletin): BulletinDraftInput {
  return {
    bulletinDate: bulletin.bulletinDate,
    titleEs: bulletin.titleEs,
    titleEn: bulletin.titleEn,
    pageCount: bulletin.pageCount,
    twoPageReason: bulletin.twoPageReason,
    blocks: bulletin.blocks.length ? bulletin.blocks : [createEmptyBlock(1)]
  };
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`No se pudo leer ${file.name}.`));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

async function toAttachmentInput(file: File): Promise<BulletinGenerationAttachmentInput> {
  return {
    originalFileName: file.name,
    fileMimeType: file.type || "application/octet-stream",
    fileBase64: await fileToBase64(file)
  };
}

function downloadBlob(blob: Blob, filename: string) {
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
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<BulletinDraftInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "APPROVED">("ALL");

  const [generationText, setGenerationText] = useState("");
  const [generationUrls, setGenerationUrls] = useState("");
  const [generationFiles, setGenerationFiles] = useState<File[]>([]);

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDate, setUploadDate] = useState(todayIso());
  const [uploadDocx, setUploadDocx] = useState<File | null>(null);
  const [uploadPdf, setUploadPdf] = useState<File | null>(null);

  const selected = useMemo(
    () => bulletins.find((bulletin) => bulletin.id === selectedId) ?? null,
    [bulletins, selectedId]
  );

  const filteredBulletins = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return bulletins.filter((bulletin) => {
      if (statusFilter !== "ALL" && bulletin.status !== statusFilter) return false;
      if (!query) return true;
      return [
        bulletin.titleEs,
        bulletin.titleEn,
        bulletin.createdByName ?? "",
        bulletin.approvedByName ?? ""
      ].some((value) => value.toLocaleLowerCase("es").includes(query));
    });
  }, [bulletins, search, statusFilter]);

  async function loadBulletins(preferredId?: string) {
    setLoading(true);
    setFlash(null);
    try {
      const rows = await apiGet<Bulletin[]>("/bulletins");
      setBulletins(rows);
      const nextId = preferredId && rows.some((row) => row.id === preferredId)
        ? preferredId
        : selectedId && rows.some((row) => row.id === selectedId)
          ? selectedId
          : rows[0]?.id ?? null;
      setSelectedId(nextId);
      const nextSelected = rows.find((row) => row.id === nextId);
      setEditor(nextSelected?.origin === "GENERATED" ? draftFromBulletin(nextSelected) : null);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
      setBulletins([]);
      setSelectedId(null);
      setEditor(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBulletins();
  }, []);

  function selectBulletin(bulletin: Bulletin) {
    setSelectedId(bulletin.id);
    setEditor(bulletin.origin === "GENERATED" ? draftFromBulletin(bulletin) : null);
    setSidePanel(null);
    setFlash(null);
  }

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
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
      const created = await apiPostLongRunning<Bulletin>("/bulletins/generate", {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveEditor(options: { quiet?: boolean } = {}) {
    if (!selected || !editor) return null;
    const saved = await apiPatch<Bulletin>(`/bulletins/${selected.id}`, editor);
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove() {
    if (!selected || !editor) return;
    setBusy("approve");
    setFlash(null);
    try {
      const saved = await saveEditor({ quiet: true });
      if (!saved) return;
      const approved = await apiPostLongRunning<Bulletin>(`/bulletins/${saved.id}/approve`, {});
      setBulletins((current) => current.map((item) => item.id === approved.id ? approved : item));
      setEditor(draftFromBulletin(approved));
      setFlash({ tone: "success", text: "Boletin aprobado. Los archivos Word y PDF ya estan disponibles." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadDocx && !uploadPdf) {
      setFlash({ tone: "error", text: "Carga por lo menos un archivo Word o PDF." });
      return;
    }

    setBusy("upload");
    setFlash(null);
    try {
      const created = await apiPostLongRunning<Bulletin>("/bulletins/upload", {
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
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload(format: "docx" | "pdf") {
    if (!selected) return;
    setBusy(`download-${format}`);
    setFlash(null);
    try {
      const result = await apiDownload(`/bulletins/${selected.id}/download/${format}`);
      downloadBlob(result.blob, result.filename ?? `boletin.${format}`);
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!selected || !window.confirm(`¿Eliminar "${selected.titleEs}" de la biblioteca?`)) return;
    setBusy("delete");
    setFlash(null);
    try {
      await apiDelete(`/bulletins/${selected.id}`);
      const remaining = bulletins.filter((item) => item.id !== selected.id);
      setBulletins(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setEditor(remaining[0]?.origin === "GENERATED" ? draftFromBulletin(remaining[0]) : null);
      setFlash({ tone: "success", text: "Boletin eliminado de la biblioteca." });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  function updateEditor<K extends keyof BulletinDraftInput>(key: K, value: BulletinDraftInput[K]) {
    setEditor((current) => current ? { ...current, [key]: value } : current);
    setFlash(null);
  }

  function updateBlock(blockId: string, key: keyof BulletinBlock, value: string) {
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

  function removeBlock(blockId: string) {
    setEditor((current) => current && current.blocks.length > 1
      ? { ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }
      : current);
  }

  if (user?.isExternal) {
    return <Navigate to="/app" replace />;
  }

  return (
    <section className="page-stack bulletins-page">
      <header className="hero module-hero bulletins-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">{"\u{1F4F0}"}</span>
          <div>
            <h2>Boletines</h2>
            <p className="muted">Biblioteca y generador bilingue de comunicaciones breves para clientes.</p>
          </div>
        </div>
        <div className="bulletins-hero-actions">
          <button
            className="secondary-button"
            onClick={() => setSidePanel((current) => current === "upload" ? null : "upload")}
            type="button"
          >
            Cargar boletin anterior
          </button>
          <button
            className="primary-button"
            onClick={() => setSidePanel((current) => current === "generate" ? null : "generate")}
            type="button"
          >
            Nuevo boletin
          </button>
        </div>
      </header>

      {flash ? (
        <div className={`message-banner ${
          flash.tone === "success"
            ? "message-success"
            : flash.tone === "warning"
              ? "message-warning"
              : "message-error"
        }`}>
          {flash.text}
        </div>
      ) : null}

      {sidePanel === "generate" ? (
        <section className="panel bulletins-create-panel">
          <div className="panel-header">
            <div>
              <span className="bulletins-eyebrow">Rusconi Intelligence</span>
              <h2>Generar borrador</h2>
              <p className="muted">Describe la noticia o reforma. Puedes agregar URLs y documentos de respaldo.</p>
            </div>
          </div>
          <form className="bulletins-generation-form" onSubmit={handleGenerate}>
            <label className="bulletins-field bulletins-field-wide">
              <span>Texto o instrucciones</span>
              <textarea
                onChange={(event) => setGenerationText(event.target.value)}
                placeholder="Ejemplo: Informa a nuestros clientes sobre la reforma publicada hoy al Codigo Penal de la Ciudad de Mexico y explica sus efectos practicos."
                rows={6}
                value={generationText}
              />
            </label>
            <label className="bulletins-field">
              <span>URLs, una por linea</span>
              <textarea
                onChange={(event) => setGenerationUrls(event.target.value)}
                placeholder="https://..."
                rows={4}
                value={generationUrls}
              />
            </label>
            <label className="bulletins-field bulletins-file-field">
              <span>Adjuntos</span>
              <input
                accept=".pdf,.docx,.txt,.jpg,.jpeg,.png"
                multiple
                onChange={(event) => setGenerationFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
              <small>PDF, DOCX, TXT, JPG o PNG. Hasta 6 archivos y 18 MB en conjunto.</small>
              {generationFiles.length ? (
                <div className="bulletins-file-list">
                  {generationFiles.map((file) => (
                    <span key={`${file.name}-${file.size}`}>{file.name} · {formatFileSize(file.size)}</span>
                  ))}
                </div>
              ) : null}
            </label>
            <div className="bulletins-form-actions bulletins-field-wide">
              <button className="secondary-button" onClick={() => setSidePanel(null)} type="button">Cancelar</button>
              <button className="primary-button" disabled={busy === "generate"} type="submit">
                {busy === "generate" ? "Investigando y redactando..." : "Generar borrador bilingue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {sidePanel === "upload" ? (
        <section className="panel bulletins-create-panel">
          <div className="panel-header">
            <div>
              <span className="bulletins-eyebrow">Archivo historico</span>
              <h2>Cargar boletin anterior</h2>
              <p className="muted">Puedes cargar Word, PDF o ambos. El registro se guardara como aprobado.</p>
            </div>
          </div>
          <form className="bulletins-upload-form" onSubmit={handleUpload}>
            <label className="bulletins-field bulletins-field-wide">
              <span>Titulo</span>
              <input
                maxLength={180}
                onChange={(event) => setUploadTitle(event.target.value)}
                required
                value={uploadTitle}
              />
            </label>
            <label className="bulletins-field">
              <span>Fecha</span>
              <input onChange={(event) => setUploadDate(event.target.value)} required type="date" value={uploadDate} />
            </label>
            <label className="bulletins-field bulletins-file-field">
              <span>Word</span>
              <input accept=".docx" onChange={(event) => setUploadDocx(event.target.files?.[0] ?? null)} type="file" />
            </label>
            <label className="bulletins-field bulletins-file-field">
              <span>PDF</span>
              <input accept=".pdf" onChange={(event) => setUploadPdf(event.target.files?.[0] ?? null)} type="file" />
            </label>
            <div className="bulletins-form-actions bulletins-field-wide">
              <button className="secondary-button" onClick={() => setSidePanel(null)} type="button">Cancelar</button>
              <button className="primary-button" disabled={busy === "upload"} type="submit">
                {busy === "upload" ? "Cargando..." : "Guardar en biblioteca"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="bulletins-workspace">
        <aside className="panel bulletins-library">
          <div className="bulletins-library-header">
            <div>
              <span className="bulletins-eyebrow">Biblioteca</span>
              <h2>{bulletins.length} boletines</h2>
            </div>
          </div>
          <div className="bulletins-filters">
            <input
              aria-label="Buscar boletin"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar..."
              type="search"
              value={search}
            />
            <select
              aria-label="Filtrar por estado"
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              value={statusFilter}
            >
              <option value="ALL">Todos</option>
              <option value="DRAFT">Borradores</option>
              <option value="APPROVED">Aprobados</option>
            </select>
          </div>

          {loading ? <div className="centered-inline-message">Cargando boletines...</div> : null}
          {!loading && filteredBulletins.length === 0 ? (
            <div className="bulletins-empty-list">
              <strong>No hay boletines</strong>
              <span>Genera el primero o carga uno anterior.</span>
            </div>
          ) : null}
          <div className="bulletins-list">
            {filteredBulletins.map((bulletin) => (
              <button
                className={`bulletins-list-item ${bulletin.id === selectedId ? "is-active" : ""}`}
                key={bulletin.id}
                onClick={() => selectBulletin(bulletin)}
                type="button"
              >
                <span className="bulletins-list-item-top">
                  <span className={`status-pill ${bulletin.status === "APPROVED" ? "status-live" : "status-warning"}`}>
                    {bulletin.status === "APPROVED" ? "Aprobado" : "Borrador"}
                  </span>
                  <time>{formatDate(bulletin.bulletinDate)}</time>
                </span>
                <strong>{bulletin.titleEs}</strong>
                <span>{bulletin.origin === "UPLOADED" ? "Cargado" : `${bulletin.pageCount} pág. · Bilingüe`}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel bulletins-detail">
          {!selected ? (
            <div className="bulletins-empty-detail">
              <span aria-hidden="true">RC</span>
              <h2>Selecciona un boletin</h2>
              <p className="muted">Los borradores se pueden editar y deben aprobarse antes de descargar.</p>
            </div>
          ) : selected.origin === "UPLOADED" ? (
            <div className="bulletins-uploaded-detail">
              <div className="bulletins-detail-heading">
                <div>
                  <span className="bulletins-eyebrow">Boletin historico</span>
                  <h2>{selected.titleEs}</h2>
                  <p className="muted">{formatDate(selected.bulletinDate)}</p>
                </div>
                <span className="status-pill status-live">Aprobado</span>
              </div>
              <div className="bulletins-uploaded-file-actions">
                {selected.hasDocx ? (
                  <button className="primary-button" onClick={() => void handleDownload("docx")} type="button">
                    {busy === "download-docx" ? "Descargando..." : "Descargar Word"}
                  </button>
                ) : null}
                {selected.hasPdf ? (
                  <button className="primary-button" onClick={() => void handleDownload("pdf")} type="button">
                    {busy === "download-pdf" ? "Descargando..." : "Descargar PDF"}
                  </button>
                ) : null}
                <button className="danger-button" disabled={busy === "delete"} onClick={() => void handleDelete()} type="button">
                  Eliminar
                </button>
              </div>
            </div>
          ) : editor ? (
            <>
              <div className="bulletins-detail-heading">
                <div>
                  <span className="bulletins-eyebrow">Editor bilingue</span>
                  <h2>{selected.status === "APPROVED" ? "Boletin aprobado" : "Revision obligatoria"}</h2>
                  <p className="muted">
                    {selected.status === "APPROVED"
                      ? `Aprobado por ${selected.approvedByName ?? "usuario interno"}. Guardar cambios lo regresara a borrador.`
                      : "Revisa la precision y equivalencia de ambos idiomas antes de aprobar."}
                  </p>
                </div>
                <span className={`status-pill ${selected.status === "APPROVED" ? "status-live" : "status-warning"}`}>
                  {selected.status === "APPROVED" ? "Aprobado" : "Borrador"}
                </span>
              </div>

              <div className="bulletins-editor-meta">
                <label className="bulletins-field">
                  <span>Fecha del boletin</span>
                  <input
                    onChange={(event) => updateEditor("bulletinDate", event.target.value)}
                    type="date"
                    value={editor.bulletinDate}
                  />
                </label>
                <label className="bulletins-field">
                  <span>Extension aprobada</span>
                  <select
                    onChange={(event) => updateEditor("pageCount", Number(event.target.value) === 2 ? 2 : 1)}
                    value={editor.pageCount}
                  >
                    <option value={1}>Una pagina</option>
                    <option value={2}>Dos paginas, excepcionalmente</option>
                  </select>
                </label>
                {selected.attachments.length ? (
                  <div className="bulletins-source-count">
                    <span>Material recibido</span>
                    <strong>{selected.attachments.length} adjunto{selected.attachments.length === 1 ? "" : "s"}</strong>
                  </div>
                ) : null}
              </div>

              {editor.pageCount === 2 ? (
                <label className="bulletins-field bulletins-field-wide">
                  <span>Justificacion de la segunda pagina</span>
                  <input
                    maxLength={300}
                    onChange={(event) => updateEditor("twoPageReason", event.target.value)}
                    placeholder="Explica por que el contenido no puede abreviarse sin perder utilidad."
                    value={editor.twoPageReason ?? ""}
                  />
                </label>
              ) : null}

              <div className="bulletins-title-grid">
                <label className="bulletins-field">
                  <span>Titulo en español</span>
                  <textarea
                    maxLength={180}
                    onChange={(event) => updateEditor("titleEs", event.target.value)}
                    rows={2}
                    value={editor.titleEs}
                  />
                </label>
                <label className="bulletins-field">
                  <span>English title</span>
                  <textarea
                    maxLength={180}
                    onChange={(event) => updateEditor("titleEn", event.target.value)}
                    rows={2}
                    value={editor.titleEn}
                  />
                </label>
              </div>

              <div className="bulletins-blocks">
                {editor.blocks.map((block, index) => (
                  <section className="bulletins-block-editor" key={block.id}>
                    <div className="bulletins-block-heading">
                      <span>Bloque {index + 1}</span>
                      {editor.blocks.length > 1 ? (
                        <button className="ghost-button" onClick={() => removeBlock(block.id)} type="button">Quitar</button>
                      ) : null}
                    </div>
                    <div className="bulletins-block-grid">
                      <div className="bulletins-language-column">
                        <span className="bulletins-language-label">ESPAÑOL</span>
                        <input
                          maxLength={120}
                          onChange={(event) => updateBlock(block.id, "headingEs", event.target.value)}
                          placeholder="Encabezado breve"
                          value={block.headingEs}
                        />
                        <textarea
                          maxLength={2200}
                          onChange={(event) => updateBlock(block.id, "bodyEs", event.target.value)}
                          rows={6}
                          value={block.bodyEs}
                        />
                      </div>
                      <div className="bulletins-language-column">
                        <span className="bulletins-language-label">ENGLISH</span>
                        <input
                          maxLength={120}
                          onChange={(event) => updateBlock(block.id, "headingEn", event.target.value)}
                          placeholder="Short heading"
                          value={block.headingEn}
                        />
                        <textarea
                          maxLength={2200}
                          onChange={(event) => updateBlock(block.id, "bodyEn", event.target.value)}
                          rows={6}
                          value={block.bodyEn}
                        />
                      </div>
                    </div>
                  </section>
                ))}
              </div>

              {editor.blocks.length < 5 ? (
                <button className="secondary-button bulletins-add-block" onClick={addBlock} type="button">
                  Agregar bloque
                </button>
              ) : null}

              <div className="bulletins-preview">
                <div className="bulletins-preview-paper">
                  <div className="bulletins-preview-kicker">BOLETÍN PARA CLIENTES&nbsp;&nbsp;|&nbsp;&nbsp;CLIENT BULLETIN</div>
                  <div className="bulletins-preview-date">{formatDate(editor.bulletinDate)}</div>
                  <div className="bulletins-preview-titles">
                    <strong>{editor.titleEs}</strong>
                    <strong>{editor.titleEn}</strong>
                  </div>
                  <div className="bulletins-preview-labels">
                    <span>ESPAÑOL</span>
                    <span>ENGLISH</span>
                  </div>
                  {editor.blocks.map((block) => (
                    <div className="bulletins-preview-row" key={`preview-${block.id}`}>
                      <div>
                        {block.headingEs ? <strong>{block.headingEs}</strong> : null}
                        <p>{block.bodyEs}</p>
                      </div>
                      <div>
                        {block.headingEn ? <strong>{block.headingEn}</strong> : null}
                        <p>{block.bodyEn}</p>
                      </div>
                    </div>
                  ))}
                  <div className="bulletins-preview-signature">Rusconi Consulting</div>
                </div>
              </div>

              <div className="bulletins-editor-actions">
                <button className="danger-button" disabled={busy === "delete"} onClick={() => void handleDelete()} type="button">
                  Eliminar
                </button>
                <div>
                  {selected.status === "APPROVED" ? (
                    <>
                      <button className="secondary-button" onClick={() => void handleDownload("docx")} type="button">
                        Word
                      </button>
                      <button className="secondary-button" onClick={() => void handleDownload("pdf")} type="button">
                        PDF
                      </button>
                    </>
                  ) : null}
                  <button className="secondary-button" disabled={busy === "save"} onClick={() => void handleSaveDraft()} type="button">
                    {busy === "save" ? "Guardando..." : "Guardar borrador"}
                  </button>
                  <button className="primary-button" disabled={busy === "approve"} onClick={() => void handleApprove()} type="button">
                    {busy === "approve" ? "Generando Word y PDF..." : "Aprobar y generar archivos"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </section>
  );
}
