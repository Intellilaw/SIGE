import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function RusconiIntelligenceMark({ size = "compact" }) {
    return (_jsx("span", { className: `ri-mark ri-mark-${size}`, "aria-hidden": "true", children: _jsx("span", { className: "ri-mark-core", children: "RI" }) }));
}
export function RusconiIntelligenceBadge({ connectionId, label }) {
    const title = label ? `Rusconi Intelligence ${connectionId}: ${label}` : `Rusconi Intelligence ${connectionId}`;
    return (_jsxs("span", { className: "ri-badge", title: title, "aria-label": title, children: [_jsx(RusconiIntelligenceMark, {}), _jsx("span", { className: "ri-badge-id", children: connectionId })] }));
}
