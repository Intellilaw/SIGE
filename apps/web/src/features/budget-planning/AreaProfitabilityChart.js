import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
const SERIES_COLORS = {
    LITIGATION: "#2563eb",
    CORPORATE_LABOR: "#d97706",
    SETTLEMENTS: "#059669",
    FINANCIAL_LAW: "#dc2626",
    TAX_COMPLIANCE: "#7c3aed"
};
const COMPANY_SERIES_COLOR = "#172a46";
const MONTH_SHORT_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CHART_WIDTH = 1120;
const CHART_HEIGHT = 470;
const PLOT_LEFT = 104;
const PLOT_RIGHT = 30;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 402;
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function formatCompactCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        notation: "compact",
        maximumFractionDigits: 1
    }).format(Number(value || 0));
}
function getMonthLabel(point) {
    return `${MONTH_SHORT_NAMES[point.month - 1] ?? point.month} ${String(point.year).slice(-2)}`;
}
function getFullMonthLabel(point) {
    return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(point.year, point.month - 1, 1));
}
function getNiceStep(range, targetTickCount = 6) {
    if (!Number.isFinite(range) || range <= 0) {
        return 500;
    }
    const roughStep = range / targetTickCount;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const normalized = roughStep / magnitude;
    const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return multiplier * magnitude;
}
function getSeriesColor(team) {
    return SERIES_COLORS[team] ?? "#475569";
}
function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
export function AreaProfitabilityChart({ data, loading, selectedTeam }) {
    const [activePoint, setActivePoint] = useState(null);
    const chartSeries = useMemo(() => {
        const teamSeries = (data?.series ?? [])
            .filter((series) => selectedTeam === "ALL" || series.team === selectedTeam)
            .map((series) => ({
            id: series.team,
            label: series.teamLabel,
            color: getSeriesColor(series.team),
            isCompany: false,
            points: series.points
        }));
        const sourcePoints = data?.series[0]?.points ?? [];
        const companyPoints = sourcePoints.map((sourcePoint, index) => {
            const totals = (data?.series ?? []).reduce((sum, series) => ({
                incomeMxn: sum.incomeMxn + Number(series.points[index]?.incomeMxn ?? 0),
                expenseMxn: sum.expenseMxn + Number(series.points[index]?.expenseMxn ?? 0),
                profitMxn: sum.profitMxn + Number(series.points[index]?.profitMxn ?? 0)
            }), { incomeMxn: 0, expenseMxn: 0, profitMxn: 0 });
            return {
                year: sourcePoint.year,
                month: sourcePoint.month,
                incomeMxn: roundMoney(totals.incomeMxn),
                expenseMxn: roundMoney(totals.expenseMxn),
                profitMxn: roundMoney(totals.profitMxn)
            };
        });
        if (companyPoints.length > 0) {
            teamSeries.push({
                id: "COMPANY_TOTAL",
                label: "Rentabilidad total empresa",
                color: COMPANY_SERIES_COLOR,
                isCompany: true,
                points: companyPoints
            });
        }
        return teamSeries;
    }, [data, selectedTeam]);
    useEffect(() => {
        setActivePoint(null);
    }, [data, selectedTeam]);
    const chart = useMemo(() => {
        const months = chartSeries[0]?.points ?? [];
        const values = chartSeries.flatMap((series) => series.points.map((point) => point.profitMxn));
        let minimum = Math.min(0, ...values);
        let maximum = Math.max(0, ...values);
        if (minimum === maximum) {
            minimum = -1000;
            maximum = 1000;
        }
        const step = getNiceStep(maximum - minimum);
        const yMinimum = Math.floor(minimum / step) * step;
        const yMaximum = Math.ceil(maximum / step) * step;
        const yRange = Math.max(step, yMaximum - yMinimum);
        const plotWidth = CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT;
        const plotHeight = PLOT_BOTTOM - PLOT_TOP;
        const getX = (index) => months.length <= 1
            ? PLOT_LEFT + plotWidth / 2
            : PLOT_LEFT + index * plotWidth / (months.length - 1);
        const getY = (value) => PLOT_TOP + (yMaximum - value) * plotHeight / yRange;
        const ticks = [];
        for (let value = yMinimum; value <= yMaximum + step / 2; value += step) {
            ticks.push(value);
        }
        const labelInterval = Math.max(1, Math.ceil(months.length / 12));
        const monthLabelIndexes = months
            .map((_, index) => index)
            .filter((index) => index % labelInterval === 0 || index === months.length - 1);
        return {
            months,
            ticks,
            getX,
            getY,
            zeroY: getY(0),
            monthLabelIndexes
        };
    }, [chartSeries]);
    if (loading) {
        return _jsx("div", { className: "budget-profitability-empty", children: "Cargando rentabilidad por equipo..." });
    }
    if (!data?.availableRange) {
        return _jsx("div", { className: "budget-profitability-empty", children: "Aun no hay ingresos o gastos registrados." });
    }
    const tooltipWidth = 282;
    const tooltipHeight = 126;
    const tooltipX = activePoint
        ? Math.min(CHART_WIDTH - PLOT_RIGHT - tooltipWidth, Math.max(PLOT_LEFT, activePoint.x + 14))
        : 0;
    const tooltipY = activePoint
        ? Math.min(PLOT_BOTTOM - tooltipHeight, Math.max(PLOT_TOP, activePoint.y - tooltipHeight - 12))
        : 0;
    return (_jsxs("div", { className: "budget-profitability-chart-block", children: [_jsxs("div", { className: "budget-profitability-legend", "aria-label": "Series mostradas", children: [chartSeries.map((series) => (_jsxs("span", { className: `budget-profitability-legend-item ${series.isCompany ? "is-company-label" : ""}`, children: [_jsx("i", { className: series.isCompany ? "is-company" : "", style: { backgroundColor: series.color }, "aria-hidden": "true" }), series.label] }, series.id))), _jsxs("span", { className: "budget-profitability-legend-item", children: [_jsx("i", { className: "is-break-even", "aria-hidden": "true" }), "Punto de equilibrio"] })] }), _jsx("div", { className: "budget-profitability-chart-scroll", children: _jsx("div", { className: "budget-profitability-chart-canvas", children: _jsxs("svg", { className: "budget-profitability-chart", viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`, role: "img", "aria-labelledby": "area-profitability-chart-title area-profitability-chart-description", onMouseLeave: () => setActivePoint(null), children: [_jsx("title", { id: "area-profitability-chart-title", children: "Utilidad mensual por equipo" }), _jsx("desc", { id: "area-profitability-chart-description", children: "Lineas de utilidad o perdida mensual por equipo y una linea gruesa con el total de la empresa. La linea horizontal en cero indica el punto de equilibrio." }), _jsx("rect", { className: "budget-profitability-positive-zone", x: PLOT_LEFT, y: PLOT_TOP, width: CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT, height: Math.max(0, chart.zeroY - PLOT_TOP) }), _jsx("rect", { className: "budget-profitability-negative-zone", x: PLOT_LEFT, y: chart.zeroY, width: CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT, height: Math.max(0, PLOT_BOTTOM - chart.zeroY) }), chart.ticks.map((tick) => {
                                const y = chart.getY(tick);
                                return (_jsxs("g", { children: [_jsx("line", { className: tick === 0 ? "budget-profitability-zero-line" : "budget-profitability-grid-line", x1: PLOT_LEFT, x2: CHART_WIDTH - PLOT_RIGHT, y1: y, y2: y, vectorEffect: "non-scaling-stroke" }), _jsx("text", { className: "budget-profitability-axis-label", x: PLOT_LEFT - 12, y: y + 4, textAnchor: "end", children: formatCompactCurrency(tick) })] }, tick));
                            }), _jsx("line", { className: "budget-profitability-axis-line", x1: PLOT_LEFT, x2: PLOT_LEFT, y1: PLOT_TOP, y2: PLOT_BOTTOM, vectorEffect: "non-scaling-stroke" }), _jsx("line", { className: "budget-profitability-axis-line", x1: PLOT_LEFT, x2: CHART_WIDTH - PLOT_RIGHT, y1: PLOT_BOTTOM, y2: PLOT_BOTTOM, vectorEffect: "non-scaling-stroke" }), chart.monthLabelIndexes.map((index) => {
                                const point = chart.months[index];
                                const x = chart.getX(index);
                                return (_jsxs("g", { children: [_jsx("line", { className: "budget-profitability-month-tick", x1: x, x2: x, y1: PLOT_BOTTOM, y2: PLOT_BOTTOM + 7, vectorEffect: "non-scaling-stroke" }), _jsx("text", { className: "budget-profitability-month-label", x: x, y: PLOT_BOTTOM + 27, textAnchor: "middle", children: getMonthLabel(point) })] }, `${point.year}-${point.month}`));
                            }), _jsx("text", { className: "budget-profitability-zero-label", x: CHART_WIDTH - PLOT_RIGHT - 4, y: chart.zeroY - 7, textAnchor: "end", children: "$0 equilibrio" }), chartSeries.map((series) => {
                                const path = series.points
                                    .map((point, index) => `${index === 0 ? "M" : "L"} ${chart.getX(index)} ${chart.getY(point.profitMxn)}`)
                                    .join(" ");
                                return (_jsxs("g", { children: [_jsx("path", { className: `budget-profitability-series-line ${series.isCompany ? "is-company" : ""}`, d: path, fill: "none", stroke: series.color, vectorEffect: "non-scaling-stroke" }), series.points.map((point, index) => {
                                            const x = chart.getX(index);
                                            const y = chart.getY(point.profitMxn);
                                            const isActive = activePoint?.series.id === series.id
                                                && activePoint.point.year === point.year
                                                && activePoint.point.month === point.month;
                                            const accessibleLabel = `${series.label}, ${getFullMonthLabel(point)}: utilidad ${formatCurrency(point.profitMxn)}, ingresos ${formatCurrency(point.incomeMxn)}, gastos ${formatCurrency(point.expenseMxn)}`;
                                            return (_jsx("circle", { className: `budget-profitability-point ${series.isCompany ? "is-company" : ""}`, cx: x, cy: y, r: series.isCompany ? (isActive ? 9 : 7) : (isActive ? 7 : 5), fill: series.color, stroke: "#ffffff", strokeWidth: series.isCompany ? 3 : 2, vectorEffect: "non-scaling-stroke", tabIndex: 0, role: "img", "aria-label": accessibleLabel, onMouseEnter: () => setActivePoint({ point, series, x, y }), onFocus: () => setActivePoint({ point, series, x, y }), onClick: () => setActivePoint({ point, series, x, y }), onBlur: () => setActivePoint(null) }, `${series.id}-${point.year}-${point.month}`));
                                        })] }, series.id));
                            }), activePoint ? (_jsxs("g", { className: "budget-profitability-tooltip", pointerEvents: "none", children: [_jsx("rect", { x: tooltipX, y: tooltipY, width: tooltipWidth, height: tooltipHeight, rx: 6 }), _jsx("circle", { cx: tooltipX + 17, cy: tooltipY + 20, r: 5, fill: activePoint.series.color }), _jsx("text", { className: "budget-profitability-tooltip-title", x: tooltipX + 30, y: tooltipY + 24, children: activePoint.series.label }), _jsx("text", { className: "budget-profitability-tooltip-period", x: tooltipX + 14, y: tooltipY + 45, children: getFullMonthLabel(activePoint.point) }), _jsxs("text", { x: tooltipX + 14, y: tooltipY + 68, children: ["Ingresos: ", formatCurrency(activePoint.point.incomeMxn)] }), _jsxs("text", { x: tooltipX + 14, y: tooltipY + 89, children: ["Gastos: ", formatCurrency(activePoint.point.expenseMxn)] }), _jsxs("text", { className: activePoint.point.profitMxn >= 0 ? "is-positive" : "is-negative", x: tooltipX + 14, y: tooltipY + 112, children: ["Utilidad: ", formatCurrency(activePoint.point.profitMxn)] })] })) : null] }) }) })] }));
}
