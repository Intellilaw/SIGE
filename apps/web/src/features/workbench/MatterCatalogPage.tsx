import { useEffect, useMemo, useState } from "react";
import type { Matter } from "@sige/contracts";

import { apiGet, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function normalizeComparableText(value?: string | null) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("es-MX");
}

function groupByClient(items: Matter[]) {
  return items.reduce<Record<string, Matter[]>>((groups, matter) => {
    const clientKey = normalizeText(matter.clientName) || "Sin Cliente";
    groups[clientKey] ??= [];
    groups[clientKey].push(matter);
    return groups;
  }, {});
}

function sortCatalogMatters(items: Matter[]) {
  return [...items].sort((left, right) => {
    const clientCompare = normalizeText(left.clientName).localeCompare(normalizeText(right.clientName), "es-MX", {
      sensitivity: "base"
    });
    if (clientCompare !== 0) {
      return clientCompare;
    }

    return normalizeText(left.matterIdentifier).localeCompare(normalizeText(right.matterIdentifier), "es-MX", {
      numeric: true,
      sensitivity: "base"
    });
  });
}

export function MatterCatalogPage() {
  const { user } = useAuth();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";

  async function loadCatalog() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const loadedMatters = await apiGet<Matter[]>("/matters");
      setMatters(sortCatalogMatters(loadedMatters.filter((matter) => normalizeText(matter.matterIdentifier))));
      setSelectedIds(new Set());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Ocurrio un error al cargar el catalogo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  function toggleSelection(matterId: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(matterId);
      } else {
        next.delete(matterId);
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) {
      return;
    }

    if (!window.confirm(`PELIGRO: Esto borrara permanentemente ${selectedIds.size} asuntos activos.\n\nEstas seguro?`)) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await apiPost<void>("/matters/bulk-delete", { ids: Array.from(selectedIds) });
      window.alert("Asuntos eliminados correctamente.");
      await loadCatalog();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "No se pudieron eliminar los asuntos seleccionados.");
      setLoading(false);
    }
  }

  const filteredMatters = useMemo(() => {
    const search = normalizeComparableText(searchTerm);
    if (!search) {
      return matters;
    }

    return matters.filter((matter) => {
      const values = [matter.clientName, matter.quoteNumber, matter.matterIdentifier, matter.subject];
      return values.some((value) => normalizeComparableText(value).includes(search));
    });
  }, [matters, searchTerm]);

  const groupedMatters = useMemo(() => groupByClient(filteredMatters), [filteredMatters]);
  const clientNames = useMemo(
    () => Object.keys(groupedMatters).sort((left, right) => left.localeCompare(right, "es-MX", { sensitivity: "base" })),
    [groupedMatters]
  );

  return (
    <section className="page-stack matter-catalog-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">Catalogo</span>
          <div>
            <h2>Catalogo de Asuntos</h2>
          </div>
        </div>
        <p className="muted">Consulta de asuntos con ID asignado, agrupados por cliente y ordenados por identificador.</p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel matters-toolbar">
        <div className="matters-toolbar-actions">
          <label className="form-field matter-catalog-search">
            <span>Buscar</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cliente, cotizacion, ID o asunto..."
            />
          </label>

          {isSuperadmin && selectedIds.size > 0 ? (
            <button type="button" className="danger-button" onClick={() => void handleBulkDelete()}>
              Borrar seleccionados ({selectedIds.size})
            </button>
          ) : null}
        </div>

        <button type="button" className="secondary-button" onClick={() => void loadCatalog()}>
          Refrescar
        </button>
      </section>

      {loading ? (
        <section className="panel">
          <div className="centered-inline-message">Cargando catalogo...</div>
        </section>
      ) : filteredMatters.length === 0 ? (
        <section className="panel">
          <div className="centered-inline-message">No se encontraron asuntos con ID asignado.</div>
        </section>
      ) : (
        clientNames.map((clientName) => (
          <section className="panel matter-catalog-group" key={clientName}>
            <div className="panel-header">
              <h2>{clientName}</h2>
              <span>{groupedMatters[clientName].length} asuntos</span>
            </div>

            <div className="lead-table-shell">
              <div className="lead-table-wrapper matter-catalog-table-wrapper">
                <table className="lead-table matter-catalog-table">
                  <thead>
                    <tr>
                      {isSuperadmin ? <th className="lead-table-checkbox">Sel.</th> : null}
                      <th>ID Asunto</th>
                      <th>Cotizacion</th>
                      <th>Asunto</th>
                      <th>Estado</th>
                      <th>Fecha creacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedMatters[clientName].map((matter) => (
                      <tr key={matter.id} className={selectedIds.has(matter.id) ? "matter-row-selected" : ""}>
                        {isSuperadmin ? (
                          <td className="lead-table-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(matter.id)}
                              onChange={(event) => toggleSelection(matter.id, event.target.checked)}
                            />
                          </td>
                        ) : null}
                        <td className="lead-table-emphasis">{matter.matterIdentifier}</td>
                        <td>{matter.quoteNumber || "-"}</td>
                        <td>{matter.subject || "-"}</td>
                        <td>
                          <span className={`status-pill ${matter.concluded ? "matter-catalog-status-closed" : "matter-catalog-status-active"}`}>
                            {matter.concluded ? "Concluido" : "Activo"}
                          </span>
                        </td>
                        <td>{formatDate(matter.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))
      )}
    </section>
  );
}
