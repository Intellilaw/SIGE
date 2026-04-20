import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SummaryCard({ label, value, accent }) {
    return (_jsxs("article", { className: "summary-card", style: { borderColor: accent }, children: [_jsx("span", { className: "summary-label", children: label }), _jsx("strong", { className: "summary-value", children: value })] }));
}
