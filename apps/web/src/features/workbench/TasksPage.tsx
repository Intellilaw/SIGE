import { useEffect, useState } from "react";
import type { TaskItem, TaskModuleDefinition } from "@sige/contracts";

import { apiGet } from "../../api/http-client";
import { DataTable } from "../../components/DataTable";

export function TasksPage() {
  const [modules, setModules] = useState<TaskModuleDefinition[]>([]);
  const [rows, setRows] = useState<TaskItem[]>([]);

  useEffect(() => {
    Promise.all([
      apiGet<TaskModuleDefinition[]>("/tasks/modules"),
      apiGet<TaskItem[]>("/tasks/items")
    ])
      .then(([loadedModules, loadedRows]) => {
        setModules(loadedModules);
        setRows(loadedRows);
      })
      .catch(console.error);
  }, []);

  return (
    <section className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Modulos de tareas</h2>
          <span>{modules.length} areas</span>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <article className="module-card" key={module.id}>
              <h3>{module.label}</h3>
              <p>{module.summary}</p>
              <strong>{module.tracks.length} tracks</strong>
            </article>
          ))}
        </div>
      </section>

      <DataTable
        title="Tareas"
        rows={rows}
        columns={[
          { key: "module", header: "Modulo", render: (row) => row.moduleId },
          { key: "track", header: "Track", render: (row) => row.trackId },
          { key: "client", header: "Cliente", render: (row) => row.clientName },
          { key: "subject", header: "Asunto", render: (row) => row.subject },
          { key: "responsible", header: "Responsable", render: (row) => row.responsible },
          { key: "state", header: "Estado", render: (row) => row.state }
        ]}
      />
    </section>
  );
}
