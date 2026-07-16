import { useEffect, useMemo, useState } from "react";
import type {
  BudgetAreaProfitabilityOverview,
  BudgetAreaProfitabilityPoint,
  BudgetAreaProfitabilitySeries,
  KnownTeam
} from "@sige/contracts";

export type AreaProfitabilityTeamFilter = KnownTeam | "ALL";

interface AreaProfitabilityChartProps {
  data: BudgetAreaProfitabilityOverview | null;
  loading: boolean;
  selectedTeam: AreaProfitabilityTeamFilter;
}

interface ActiveChartPoint {
  point: BudgetAreaProfitabilityPoint;
  series: BudgetAreaProfitabilitySeries;
  x: number;
  y: number;
}

const SERIES_COLORS: Partial<Record<KnownTeam, string>> = {
  LITIGATION: "#2563eb",
  CORPORATE_LABOR: "#d97706",
  SETTLEMENTS: "#059669",
  FINANCIAL_LAW: "#dc2626",
  TAX_COMPLIANCE: "#7c3aed"
};

const MONTH_SHORT_NAMES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const CHART_WIDTH = 1120;
const CHART_HEIGHT = 470;
const PLOT_LEFT = 104;
const PLOT_RIGHT = 30;
const PLOT_TOP = 24;
const PLOT_BOTTOM = 402;

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function getMonthLabel(point: Pick<BudgetAreaProfitabilityPoint, "year" | "month">) {
  return `${MONTH_SHORT_NAMES[point.month - 1] ?? point.month} ${String(point.year).slice(-2)}`;
}

function getFullMonthLabel(point: Pick<BudgetAreaProfitabilityPoint, "year" | "month">) {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(
    new Date(point.year, point.month - 1, 1)
  );
}

function getNiceStep(range: number, targetTickCount = 6) {
  if (!Number.isFinite(range) || range <= 0) {
    return 500;
  }

  const roughStep = range / targetTickCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function getSeriesColor(team: KnownTeam) {
  return SERIES_COLORS[team] ?? "#475569";
}

export function AreaProfitabilityChart({ data, loading, selectedTeam }: AreaProfitabilityChartProps) {
  const [activePoint, setActivePoint] = useState<ActiveChartPoint | null>(null);
  const visibleSeries = useMemo(
    () => (data?.series ?? []).filter((series) => selectedTeam === "ALL" || series.team === selectedTeam),
    [data, selectedTeam]
  );

  useEffect(() => {
    setActivePoint(null);
  }, [data, selectedTeam]);

  const chart = useMemo(() => {
    const months = visibleSeries[0]?.points ?? [];
    const values = visibleSeries.flatMap((series) => series.points.map((point) => point.profitMxn));
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
    const getX = (index: number) => months.length <= 1
      ? PLOT_LEFT + plotWidth / 2
      : PLOT_LEFT + index * plotWidth / (months.length - 1);
    const getY = (value: number) => PLOT_TOP + (yMaximum - value) * plotHeight / yRange;
    const ticks: number[] = [];
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
  }, [visibleSeries]);

  if (loading) {
    return <div className="budget-profitability-empty">Cargando rentabilidad por equipo...</div>;
  }

  if (!data?.availableRange) {
    return <div className="budget-profitability-empty">Aun no hay ingresos o gastos registrados.</div>;
  }

  const tooltipWidth = 282;
  const tooltipHeight = 126;
  const tooltipX = activePoint
    ? Math.min(CHART_WIDTH - PLOT_RIGHT - tooltipWidth, Math.max(PLOT_LEFT, activePoint.x + 14))
    : 0;
  const tooltipY = activePoint
    ? Math.min(PLOT_BOTTOM - tooltipHeight, Math.max(PLOT_TOP, activePoint.y - tooltipHeight - 12))
    : 0;

  return (
    <div className="budget-profitability-chart-block">
      <div className="budget-profitability-legend" aria-label="Equipos mostrados">
        {visibleSeries.map((series) => (
          <span className="budget-profitability-legend-item" key={series.team}>
            <i style={{ backgroundColor: getSeriesColor(series.team) }} aria-hidden="true" />
            {series.teamLabel}
          </span>
        ))}
        <span className="budget-profitability-legend-item">
          <i className="is-break-even" aria-hidden="true" />
          Punto de equilibrio
        </span>
      </div>

      <div className="budget-profitability-chart-scroll">
        <div className="budget-profitability-chart-canvas">
          <svg
            className="budget-profitability-chart"
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            role="img"
            aria-labelledby="area-profitability-chart-title area-profitability-chart-description"
            onMouseLeave={() => setActivePoint(null)}
          >
            <title id="area-profitability-chart-title">Utilidad mensual por equipo</title>
            <desc id="area-profitability-chart-description">
              Lineas de utilidad o perdida mensual. La linea horizontal en cero indica el punto de equilibrio.
            </desc>

            <rect
              className="budget-profitability-positive-zone"
              x={PLOT_LEFT}
              y={PLOT_TOP}
              width={CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT}
              height={Math.max(0, chart.zeroY - PLOT_TOP)}
            />
            <rect
              className="budget-profitability-negative-zone"
              x={PLOT_LEFT}
              y={chart.zeroY}
              width={CHART_WIDTH - PLOT_LEFT - PLOT_RIGHT}
              height={Math.max(0, PLOT_BOTTOM - chart.zeroY)}
            />

            {chart.ticks.map((tick) => {
              const y = chart.getY(tick);
              return (
                <g key={tick}>
                  <line
                    className={tick === 0 ? "budget-profitability-zero-line" : "budget-profitability-grid-line"}
                    x1={PLOT_LEFT}
                    x2={CHART_WIDTH - PLOT_RIGHT}
                    y1={y}
                    y2={y}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text className="budget-profitability-axis-label" x={PLOT_LEFT - 12} y={y + 4} textAnchor="end">
                    {formatCompactCurrency(tick)}
                  </text>
                </g>
              );
            })}

            <line
              className="budget-profitability-axis-line"
              x1={PLOT_LEFT}
              x2={PLOT_LEFT}
              y1={PLOT_TOP}
              y2={PLOT_BOTTOM}
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="budget-profitability-axis-line"
              x1={PLOT_LEFT}
              x2={CHART_WIDTH - PLOT_RIGHT}
              y1={PLOT_BOTTOM}
              y2={PLOT_BOTTOM}
              vectorEffect="non-scaling-stroke"
            />

            {chart.monthLabelIndexes.map((index) => {
              const point = chart.months[index];
              const x = chart.getX(index);
              return (
                <g key={`${point.year}-${point.month}`}>
                  <line
                    className="budget-profitability-month-tick"
                    x1={x}
                    x2={x}
                    y1={PLOT_BOTTOM}
                    y2={PLOT_BOTTOM + 7}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text className="budget-profitability-month-label" x={x} y={PLOT_BOTTOM + 27} textAnchor="middle">
                    {getMonthLabel(point)}
                  </text>
                </g>
              );
            })}

            <text className="budget-profitability-zero-label" x={CHART_WIDTH - PLOT_RIGHT - 4} y={chart.zeroY - 7} textAnchor="end">
              $0 equilibrio
            </text>

            {visibleSeries.map((series) => {
              const color = getSeriesColor(series.team);
              const path = series.points
                .map((point, index) => `${index === 0 ? "M" : "L"} ${chart.getX(index)} ${chart.getY(point.profitMxn)}`)
                .join(" ");

              return (
                <g key={series.team}>
                  <path
                    className="budget-profitability-series-line"
                    d={path}
                    fill="none"
                    stroke={color}
                    vectorEffect="non-scaling-stroke"
                  />
                  {series.points.map((point, index) => {
                    const x = chart.getX(index);
                    const y = chart.getY(point.profitMxn);
                    const isActive = activePoint?.series.team === series.team
                      && activePoint.point.year === point.year
                      && activePoint.point.month === point.month;
                    const accessibleLabel = `${series.teamLabel}, ${getFullMonthLabel(point)}: utilidad ${formatCurrency(point.profitMxn)}, ingresos ${formatCurrency(point.incomeMxn)}, gastos ${formatCurrency(point.expenseMxn)}`;

                    return (
                      <circle
                        className="budget-profitability-point"
                        key={`${series.team}-${point.year}-${point.month}`}
                        cx={x}
                        cy={y}
                        r={isActive ? 7 : 5}
                        fill={color}
                        stroke="#ffffff"
                        strokeWidth={2}
                        vectorEffect="non-scaling-stroke"
                        tabIndex={0}
                        role="img"
                        aria-label={accessibleLabel}
                        onMouseEnter={() => setActivePoint({ point, series, x, y })}
                        onFocus={() => setActivePoint({ point, series, x, y })}
                        onClick={() => setActivePoint({ point, series, x, y })}
                        onBlur={() => setActivePoint(null)}
                      />
                    );
                  })}
                </g>
              );
            })}

            {activePoint ? (
              <g className="budget-profitability-tooltip" pointerEvents="none">
                <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx={6} />
                <circle cx={tooltipX + 17} cy={tooltipY + 20} r={5} fill={getSeriesColor(activePoint.series.team)} />
                <text className="budget-profitability-tooltip-title" x={tooltipX + 30} y={tooltipY + 24}>
                  {activePoint.series.teamLabel}
                </text>
                <text className="budget-profitability-tooltip-period" x={tooltipX + 14} y={tooltipY + 45}>
                  {getFullMonthLabel(activePoint.point)}
                </text>
                <text x={tooltipX + 14} y={tooltipY + 68}>Ingresos: {formatCurrency(activePoint.point.incomeMxn)}</text>
                <text x={tooltipX + 14} y={tooltipY + 89}>Gastos: {formatCurrency(activePoint.point.expenseMxn)}</text>
                <text className={activePoint.point.profitMxn >= 0 ? "is-positive" : "is-negative"} x={tooltipX + 14} y={tooltipY + 112}>
                  Utilidad: {formatCurrency(activePoint.point.profitMxn)}
                </text>
              </g>
            ) : null}
          </svg>
        </div>
      </div>
    </div>
  );
}
