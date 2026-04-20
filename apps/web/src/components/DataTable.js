import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function DataTable({ title, rows, columns }) {
    return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: title }), _jsxs("span", { children: [rows.length, " records"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsx("tr", { children: columns.map((column) => (_jsx("th", { children: column.header }, column.key))) }) }), _jsx("tbody", { children: rows.map((row, index) => (_jsx("tr", { children: columns.map((column) => (_jsx("td", { children: column.render(row) }, column.key))) }, index))) })] }) })] }));
}
