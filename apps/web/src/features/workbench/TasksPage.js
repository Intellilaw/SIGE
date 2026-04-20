import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { apiGet } from "../../api/http-client";
import { DataTable } from "../../components/DataTable";
export function TasksPage() {
    const [modules, setModules] = useState([]);
    const [rows, setRows] = useState([]);
    useEffect(() => {
        Promise.all([
            apiGet("/tasks/modules"),
            apiGet("/tasks/items")
        ])
            .then(([loadedModules, loadedRows]) => {
            setModules(loadedModules);
            setRows(loadedRows);
        })
            .catch(console.error);
    }, []);
    return (_jsxs("section", { className: "page-stack", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Modulos de tareas" }), _jsxs("span", { children: [modules.length, " areas"] })] }), _jsx("div", { className: "module-grid", children: modules.map((module) => (_jsxs("article", { className: "module-card", children: [_jsx("h3", { children: module.label }), _jsx("p", { children: module.summary }), _jsxs("strong", { children: [module.tracks.length, " tracks"] })] }, module.id))) })] }), _jsx(DataTable, { title: "Tareas", rows: rows, columns: [
                    { key: "module", header: "Modulo", render: (row) => row.moduleId },
                    { key: "track", header: "Track", render: (row) => row.trackId },
                    { key: "client", header: "Cliente", render: (row) => row.clientName },
                    { key: "subject", header: "Asunto", render: (row) => row.subject },
                    { key: "responsible", header: "Responsable", render: (row) => row.responsible },
                    { key: "state", header: "Estado", render: (row) => row.state }
                ] })] }));
}
