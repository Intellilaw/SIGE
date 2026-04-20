import { useEffect, useState } from "react";
import type { Client } from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import { DataTable } from "../../components/DataTable";

export function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);

  useEffect(() => {
    apiGet<Client[]>("/clients").then(setRows).catch(console.error);
  }, []);

  return (
    <section className="page-stack clients-page">
      <header className="hero module-hero">
        <div className="module-hero-head">
          <div>
            <h2>Clientes</h2>
          </div>
        </div>
        <p className="muted">Padron central de clientes, identificadores y fecha de alta operativa.</p>
      </header>

      <DataTable
        title="Registro"
        rows={rows}
        columns={[
          { key: "number", header: "Numero de cliente", render: (row) => row.clientNumber },
          { key: "name", header: "Nombre", render: (row) => row.name },
          { key: "createdAt", header: "Alta", render: (row) => new Date(row.createdAt).toLocaleDateString() }
        ]}
      />
    </section>
  );
}
