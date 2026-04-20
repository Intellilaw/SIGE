import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { apiGet } from "../../api/http-client";
import { DataTable } from "../../components/DataTable";
export function ClientsPage() {
    const [rows, setRows] = useState([]);
    useEffect(() => {
        apiGet("/clients").then(setRows).catch(console.error);
    }, []);
    return (_jsxs("section", { className: "page-stack clients-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "module-hero-head", children: _jsx("div", { children: _jsx("h2", { children: "Clientes" }) }) }), _jsx("p", { className: "muted", children: "Padron central de clientes, identificadores y fecha de alta operativa." })] }), _jsx(DataTable, { title: "Registro", rows: rows, columns: [
                    { key: "number", header: "Numero de cliente", render: (row) => row.clientNumber },
                    { key: "name", header: "Nombre", render: (row) => row.name },
                    { key: "createdAt", header: "Alta", render: (row) => new Date(row.createdAt).toLocaleDateString() }
                ] })] }));
}
