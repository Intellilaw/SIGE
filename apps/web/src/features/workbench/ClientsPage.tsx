import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Client } from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type FlashState =
  | {
      tone: "success" | "error";
      text: string;
    }
  | null;

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function compareClientNumbers(left: string, right: string) {
  const leftValue = Number.parseInt(left.replace(/\D/g, ""), 10);
  const rightValue = Number.parseInt(right.replace(/\D/g, ""), 10);

  if (Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue !== rightValue) {
    return leftValue - rightValue;
  }

  return left.localeCompare(right, "es-MX", { numeric: true, sensitivity: "base" });
}

function sortClients(items: Client[]) {
  return [...items].sort((left, right) => {
    const numberDelta = compareClientNumbers(left.clientNumber, right.clientNumber);
    if (numberDelta !== 0) {
      return numberDelta;
    }

    return left.name.localeCompare(right.name, "es-MX", { sensitivity: "base" });
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString("es-MX");
}

export function ClientsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>(null);
  const [search, setSearch] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [creating, setCreating] = useState(false);
  const [savingClientId, setSavingClientId] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);

  const canWriteClients = Boolean(user?.permissions.includes("*") || user?.permissions.includes("clients:write"));
  const canReadClients = Boolean(canWriteClients || user?.permissions.includes("clients:read"));

  async function loadClients() {
    setLoading(true);
    setFetchError(null);

    try {
      const data = await apiGet<Client[]>("/clients");
      setRows(sortClients(data));
    } catch (error) {
      setFetchError(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!canReadClients) {
      setLoading(false);
      return;
    }

    void loadClients();
  }, [canReadClients]);

  const filteredRows = useMemo(() => {
    const term = normalizeText(search).toLowerCase();
    if (!term) {
      return rows;
    }

    return rows.filter((client) => {
      const nameMatch = client.name.toLowerCase().includes(term);
      const numberMatch = client.clientNumber.toLowerCase().includes(term);
      return nameMatch || numberMatch;
    });
  }, [rows, search]);

  function resetEditingState() {
    setEditingClientId(null);
    setEditName("");
  }

  function handleStartEdit(client: Client) {
    setFlash(null);
    setEditingClientId(client.id);
    setEditName(client.name);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = normalizeText(newClientName);
    if (normalizedName.length < 2) {
      setFlash({ tone: "error", text: "El nombre del cliente debe tener al menos 2 caracteres." });
      return;
    }

    setFlash(null);
    setCreating(true);

    try {
      const created = await apiPost<Client>("/clients", { name: normalizedName });
      setRows((current) => sortClients([...current, created]));
      setNewClientName("");
      setFlash({
        tone: "success",
        text: `Cliente ${created.clientNumber} creado correctamente.`
      });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(clientId: string) {
    const normalizedName = normalizeText(editName);
    if (normalizedName.length < 2) {
      setFlash({ tone: "error", text: "El nombre del cliente debe tener al menos 2 caracteres." });
      return;
    }

    setFlash(null);
    setSavingClientId(clientId);

    try {
      const updated = await apiPatch<Client>(`/clients/${clientId}`, { name: normalizedName });
      setRows((current) => sortClients(current.map((client) => (client.id === clientId ? updated : client))));
      resetEditingState();
      setFlash({
        tone: "success",
        text: `Cliente ${updated.clientNumber} actualizado correctamente.`
      });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setSavingClientId(null);
    }
  }

  async function handleDelete(client: Client) {
    if (!window.confirm(`Seguro que deseas borrar al cliente ${client.clientNumber} - ${client.name}?`)) {
      return;
    }

    setFlash(null);
    setDeletingClientId(client.id);

    try {
      await apiDelete(`/clients/${client.id}`);
      setRows((current) => current.filter((entry) => entry.id !== client.id));
      if (editingClientId === client.id) {
        resetEditingState();
      }
      setFlash({
        tone: "success",
        text: `Cliente ${client.clientNumber} borrado correctamente.`
      });
    } catch (error) {
      setFlash({ tone: "error", text: toErrorMessage(error) });
    } finally {
      setDeletingClientId(null);
    }
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>, clientId: string) {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSave(clientId);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      resetEditingState();
    }
  }

  if (!canReadClients) {
    return (
      <section className="page-stack">
        <header className="hero module-hero">
          <div className="module-hero-head">
            <div>
              <h2>Clientes</h2>
            </div>
          </div>
          <p className="muted">
            Este modulo conserva el padron central de clientes del despacho. Tu perfil actual no tiene permisos para
            consultarlo.
          </p>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack clients-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <div>
            <h2>Clientes</h2>
          </div>
        </div>
        <p className="muted">
          Padron central para busqueda por nombre o numero, alta operativa inmediata, edicion directa y borrado cuando
          el cliente todavia no tiene cotizaciones, leads o asuntos vinculados.
        </p>
      </header>

      {flash ? (
        <div className={`message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`}>
          {flash.text}
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Herramientas</h2>
          <span>
            {filteredRows.length} de {rows.length} registros
          </span>
        </div>

        <div className="clients-toolbar">
          <label className="form-field clients-search-field">
            <span>Buscar cliente</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o numero..."
            />
          </label>

          <div className="clients-toolbar-actions">
            <button className="secondary-button" type="button" onClick={() => void loadClients()}>
              Refrescar
            </button>
          </div>
        </div>
      </section>

      {canWriteClients ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Agregar cliente</h2>
            <span>Alta rapida</span>
          </div>

          <form className="clients-create-form" onSubmit={handleCreate}>
            <label className="form-field clients-create-input">
              <span>Nombre del nuevo cliente</span>
              <input
                type="text"
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                placeholder="Captura el nombre completo o razon social"
                disabled={creating}
              />
            </label>

            <div className="clients-create-actions">
              <button className="primary-button" type="submit" disabled={creating}>
                {creating ? "Agregando..." : "+ Agregar cliente"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Registro</h2>
          <span>{rows.length} clientes</span>
        </div>

        {fetchError ? <div className="message-banner message-error">{fetchError}</div> : null}

        <div className="clients-table-shell">
          <div className="clients-table-wrapper">
            <table className="data-table clients-table">
              <thead>
                <tr>
                  <th>No. Cliente</th>
                  <th>Nombre</th>
                  <th>Alta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="centered-inline-message">
                      Cargando clientes...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="centered-inline-message">
                      No se encontraron clientes.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((client) => {
                    const isEditing = editingClientId === client.id;
                    const isSaving = savingClientId === client.id;
                    const isDeleting = deletingClientId === client.id;

                    return (
                      <tr key={client.id}>
                        <td className="clients-number-cell">{client.clientNumber}</td>
                        <td className="clients-name-cell">
                          {isEditing ? (
                            <input
                              className="clients-inline-input"
                              type="text"
                              value={editName}
                              autoFocus
                              disabled={isSaving}
                              onChange={(event) => setEditName(event.target.value)}
                              onKeyDown={(event) => handleEditKeyDown(event, client.id)}
                            />
                          ) : (
                            <strong>{client.name}</strong>
                          )}
                        </td>
                        <td>{formatDate(client.createdAt)}</td>
                        <td>
                          {canWriteClients ? (
                            isEditing ? (
                              <div className="table-actions">
                                <button
                                  className="primary-button"
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => void handleSave(client.id)}
                                >
                                  {isSaving ? "Guardando..." : "Guardar"}
                                </button>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={isSaving}
                                  onClick={resetEditingState}
                                >
                                  Cancelar
                                </button>
                              </div>
                            ) : (
                              <div className="table-actions">
                                <button
                                  className="secondary-button"
                                  type="button"
                                  disabled={Boolean(savingClientId) || Boolean(deletingClientId)}
                                  onClick={() => handleStartEdit(client)}
                                >
                                  Editar
                                </button>
                                <button
                                  className="danger-button"
                                  type="button"
                                  disabled={Boolean(savingClientId) || isDeleting}
                                  onClick={() => void handleDelete(client)}
                                >
                                  {isDeleting ? "Borrando..." : "Borrar"}
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="muted">Solo lectura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </section>
  );
}
