import type {
  CommissionReleaseEligibility,
  KpiCommissionMetricRequirement,
  KpiCommissionObligationKind,
  KpiIncident,
  KpiMetric,
  KpiOverview,
  KpiUserSummary
} from "@sige/contracts";
import { Prisma, type PrismaClient } from "@prisma/client";

import { getCurrentOrganizationIdOrDefault } from "../core/tenant/tenant-context";
import type { PrismaKpisRepository } from "./kpis.repository";

const KPI_COMMISSION_BASELINE_DATE = "2026-06-17";
const SUPERADMIN_KPI_ACCESS = {
  role: "SUPERADMIN" as const,
  legacyRole: "SUPERADMIN" as const,
  permissions: ["*"]
};

interface DesiredRepair {
  sourceKey: string;
  repairDate: string;
  amount: number;
  summary: string;
  details: string[];
}

interface DesiredObligation {
  userId: string;
  userKey: string;
  displayName: string;
  metricId: string;
  metricLabel: string;
  kind: KpiCommissionObligationKind;
  sourceKey: string;
  originDate: string;
  initialAmount: number;
  unit: string;
  summary: string;
  details: string[];
  repairs: DesiredRepair[];
  rowId?: string;
}

function getBusinessDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function addDaysKey(value: string, offset: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getWeekStartKey(value: string) {
  const day = dateFromKey(value).getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDaysKey(value, offset);
}

function getMonthEndKey(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).toISOString().slice(0, 10);
}

function roundAmount(value: number) {
  return Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);
}

function isNonEvaluatedDay(day: KpiMetric["dailyBreakdown"][number]) {
  return day.status === "not-configured" && day.target === 0;
}

function getIncidentDate(incident: KpiIncident, fallback: string) {
  return incident.termDate ?? incident.dueDate ?? fallback;
}

function getIncidentDetails(incident: KpiIncident) {
  return [
    [incident.clientName, incident.subject, incident.taskName].filter(Boolean).join(" / "),
    incident.reason
  ].filter((value) => value.trim().length > 0);
}

function getIncidentSummary(incident: KpiIncident) {
  const taskName = incident.taskName || "incidencia";
  return `Resolver ${taskName}`;
}

function mergeKpiUsers(overview: KpiOverview) {
  const users = new Map<string, KpiUserSummary & { metricsById: Map<string, KpiMetric> }>();

  overview.teams.forEach((team) => {
    team.users.forEach((user) => {
      const current = users.get(user.userId) ?? {
        ...user,
        metrics: [],
        metricsById: new Map<string, KpiMetric>()
      };
      user.metrics.forEach((metric) => current.metricsById.set(metric.id, metric));
      users.set(user.userId, current);
    });
  });

  return Array.from(users.values()).map(({ metricsById, ...user }) => ({
    ...user,
    metrics: Array.from(metricsById.values())
  }));
}

function allocateRepair(
  queue: DesiredObligation[],
  amount: number,
  repairDate: string,
  sourcePrefix: string,
  summary: string,
  details: string[] = []
) {
  let remainingCredit = roundAmount(amount);
  if (remainingCredit <= 0) {
    return;
  }

  queue
    .sort((left, right) => left.originDate.localeCompare(right.originDate) || left.sourceKey.localeCompare(right.sourceKey))
    .forEach((obligation) => {
      if (remainingCredit <= 0) {
        return;
      }

      const applied = roundAmount(obligation.repairs.reduce((total, repair) => total + repair.amount, 0));
      const pending = roundAmount(obligation.initialAmount - applied);
      if (pending <= 0 || obligation.originDate >= repairDate) {
        return;
      }

      const repairAmount = Math.min(pending, remainingCredit);
      obligation.repairs.push({
        sourceKey: `${sourcePrefix}:${obligation.sourceKey}`,
        repairDate,
        amount: repairAmount,
        summary,
        details
      });
      remainingCredit = roundAmount(remainingCredit - repairAmount);
    });
}

function buildDailyProductionObligations(user: KpiUserSummary, metric: KpiMetric) {
  const obligations: DesiredObligation[] = [];
  const days = [...metric.dailyBreakdown].sort((left, right) => left.date.localeCompare(right.date));

  days.forEach((day) => {
    const workValue = roundAmount(day.workValue ?? day.value);
    if (isNonEvaluatedDay(day)) {
      allocateRepair(
        obligations,
        workValue,
        day.date,
        `${metric.id}:non-evaluated:${day.date}`,
        `Trabajo valido realizado el ${day.date} en un dia sin meta ordinaria`,
        [day.actualLabel]
      );
      return;
    }

    if (day.status === "missed") {
      const missing = roundAmount(day.target - day.value);
      if (missing > 0) {
        obligations.push({
          userId: user.userId,
          userKey: user.shortName ?? user.username,
          displayName: user.displayName,
          metricId: metric.id,
          metricLabel: metric.label,
          kind: "production-deficit",
          sourceKey: `daily:${day.date}`,
          originDate: day.date,
          initialAmount: missing,
          unit: metric.unit,
          summary: `Completar ${missing} ${metric.unit} pendientes del ${day.date}`,
          details: [day.actualLabel, day.targetLabel, day.helper],
          repairs: []
        });
      }
    }

    if (day.status === "met" || day.status === "warning") {
      const surplus = roundAmount(workValue - day.target);
      allocateRepair(
        obligations,
        surplus,
        day.date,
        `${metric.id}:surplus:${day.date}`,
        `Excedente del ${day.date} aplicado al pendiente mas antiguo`,
        [day.actualLabel, day.targetLabel]
      );
    }
  });

  return obligations;
}

function buildWeeklyProductionObligations(user: KpiUserSummary, metric: KpiMetric, todayKey: string) {
  const obligations: DesiredObligation[] = [];
  const weeks = new Map<string, Array<KpiMetric["dailyBreakdown"][number]>>();
  metric.dailyBreakdown.forEach((day) => {
    const weekStart = getWeekStartKey(day.date);
    const days = weeks.get(weekStart) ?? [];
    days.push(day);
    weeks.set(weekStart, days);
  });

  Array.from(weeks.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([weekStart, weekDays]) => {
      const weekEnd = addDaysKey(weekStart, 4);
      const evaluatedDays = weekDays.filter((day) => !isNonEvaluatedDay(day));
      const nonEvaluatedDays = weekDays.filter(isNonEvaluatedDay);

      nonEvaluatedDays
        .sort((left, right) => left.date.localeCompare(right.date))
        .forEach((day) => allocateRepair(
          obligations,
          day.workValue ?? 0,
          day.date,
          `${metric.id}:non-evaluated:${day.date}`,
          `Trabajo valido realizado el ${day.date} en un dia sin meta ordinaria`,
          [day.actualLabel]
        ));

      const workValue = evaluatedDays.reduce((total, day) => total + (day.workValue ?? 0), 0);
      const isClosedWeek = weekEnd < todayKey || (weekEnd === todayKey && evaluatedDays.every((day) => day.status !== "warning"));
      const targetPerBusinessDay = metric.commissionTargetPerBusinessDay ?? 6 / 5;
      const target = roundAmount(evaluatedDays.length * targetPerBusinessDay);

      if (isClosedWeek && target > workValue) {
        const missing = target - workValue;
        obligations.push({
          userId: user.userId,
          userKey: user.shortName ?? user.username,
          displayName: user.displayName,
          metricId: metric.id,
          metricLabel: metric.label,
          kind: "production-deficit",
          sourceKey: `week:${weekStart}`,
          originDate: weekEnd,
          initialAmount: missing,
          unit: metric.unit,
          summary: `Completar ${missing} ${metric.unit} pendientes de la semana ${weekStart} a ${weekEnd}`,
          details: [`${workValue} realizados de ${target} esperados en la semana evaluada.`],
          repairs: []
        });
      }

      const comparisonTarget = target;
      const surplus = Math.max(0, workValue - comparisonTarget);
      const lastWorkDate = evaluatedDays
        .filter((day) => (day.workValue ?? 0) > 0)
        .sort((left, right) => right.date.localeCompare(left.date))[0]?.date ?? weekEnd;
      allocateRepair(
        obligations,
        surplus,
        lastWorkDate,
        `${metric.id}:weekly-surplus:${weekStart}`,
        `Excedente de la semana ${weekStart} a ${weekEnd} aplicado al pendiente mas antiguo`,
        [`${workValue} realizados frente a ${comparisonTarget} requeridos antes de aplicar excedentes.`]
      );
    });

  return obligations;
}

function buildIncidentObligations(user: KpiUserSummary, metric: KpiMetric) {
  const obligations = new Map<string, DesiredObligation>();

  metric.dailyBreakdown
    .filter((day) => day.status === "missed")
    .forEach((day) => {
      day.incidents.forEach((incident) => {
        const sourceKey = `incident:${incident.id}:${getIncidentDate(incident, day.date)}`;
        if (obligations.has(sourceKey)) {
          return;
        }

        const obligation: DesiredObligation = {
          userId: user.userId,
          userKey: user.shortName ?? user.username,
          displayName: user.displayName,
          metricId: metric.id,
          metricLabel: metric.label,
          kind: "incident",
          sourceKey,
          originDate: getIncidentDate(incident, day.date),
          initialAmount: 1,
          unit: "incidencia",
          summary: getIncidentSummary(incident),
          details: getIncidentDetails(incident),
          repairs: []
        };

        if (incident.completedAt) {
          obligation.repairs.push({
            sourceKey: `completed:${incident.id}:${incident.completedAt}`,
            repairDate: incident.completedAt,
            amount: 1,
            summary: `Incidencia reparada el ${incident.completedAt}`,
            details: getIncidentDetails(incident)
          });
        }

        obligations.set(sourceKey, obligation);
      });
    });

  return Array.from(obligations.values());
}

function buildExactDailyObligations(user: KpiUserSummary, metric: KpiMetric) {
  const obligations: DesiredObligation[] = [];

  [...metric.dailyBreakdown]
    .sort((left, right) => left.date.localeCompare(right.date))
    .forEach((day) => {
      const workValue = roundAmount(day.workValue ?? day.value);
      if (isNonEvaluatedDay(day)) {
        allocateRepair(
          obligations,
          workValue,
          day.date,
          `${metric.id}:non-evaluated:${day.date}`,
          `Trabajo valido realizado el ${day.date} en un dia sin meta ordinaria`,
          [day.actualLabel]
        );
        return;
      }

      if (day.status === "missed") {
      const missing = Math.max(1, roundAmount(day.target - day.value));
        obligations.push({
        userId: user.userId,
        userKey: user.shortName ?? user.username,
        displayName: user.displayName,
        metricId: metric.id,
        metricLabel: metric.label,
        kind: "exact-daily" as const,
        sourceKey: `exact:${day.date}`,
        originDate: day.date,
        initialAmount: missing,
        unit: metric.unit,
        summary: `Completar ${day.targetLabel.toLowerCase()} del ${day.date}`,
        details: [day.actualLabel, day.helper],
        repairs: []
        });
      }

      const surplus = roundAmount(workValue - day.target);
      allocateRepair(
        obligations,
        surplus,
        day.date,
        `${metric.id}:surplus:${day.date}`,
        `Excedente del ${day.date} aplicado al pendiente mas antiguo`,
        [day.actualLabel, day.targetLabel]
      );
    });

  return obligations;
}

function buildExecutionStateObligations(
  user: KpiUserSummary,
  metric: KpiMetric,
  currentIncidents: KpiIncident[],
  currentValue: number,
  currentTarget: number,
  todayKey: string
) {
  const obligations: DesiredObligation[] = [];
  let active: DesiredObligation[] = [];

  const closeObligationsNotNeeded = (incidents: KpiIncident[], excess: number, repairDate: string) => {
    const currentIds = new Set(incidents.map((incident) => incident.id));
    const stillPresent = active.filter((obligation) => obligation.rowId && currentIds.has(obligation.rowId));
    const mustRemain = new Set(stillPresent.slice(0, excess).map((obligation) => obligation.sourceKey));

    active.forEach((obligation) => {
      if (!mustRemain.has(obligation.sourceKey)) {
        obligation.repairs.push({
          sourceKey: `row-corrected:${repairDate}`,
          repairDate,
          amount: 1,
          summary: `Fila incompleta corregida el ${repairDate}`,
          details: obligation.details
        });
      }
    });
    active = active.filter((obligation) => mustRemain.has(obligation.sourceKey));
  };

  metric.dailyBreakdown
    .filter((day) => day.status === "missed" || day.status === "met")
    .sort((left, right) => left.date.localeCompare(right.date))
    .forEach((day) => {
      const excess = Math.max(0, day.value - day.target);
      closeObligationsNotNeeded(day.incidents, excess, day.date);

      if (day.status !== "missed" || excess <= active.length) {
        return;
      }

      const activeRowIds = new Set(active.map((obligation) => obligation.rowId));
      const candidates = [...day.incidents]
        .filter((incident) => !activeRowIds.has(incident.id))
        .sort((left, right) => left.id.localeCompare(right.id));
      const needed = excess - active.length;
      candidates.slice(0, needed).forEach((incident) => {
        const obligation: DesiredObligation = {
          userId: user.userId,
          userKey: user.shortName ?? user.username,
          displayName: user.displayName,
          metricId: metric.id,
          metricLabel: metric.label,
          kind: "state-threshold",
          sourceKey: `execution-row:${incident.id}:${day.date}`,
          originDate: day.date,
          initialAmount: 1,
          unit: "fila",
          summary: `Corregir fila incompleta: ${incident.clientName} / ${incident.subject}`,
          details: getIncidentDetails(incident),
          repairs: [],
          rowId: incident.id
        };
        obligations.push(obligation);
        active.push(obligation);
      });
    });

  closeObligationsNotNeeded(currentIncidents, Math.max(0, currentValue - currentTarget), todayKey);
  return obligations;
}

function groupRequirementRows(rows: Array<{
  id: string;
  userId: string;
  displayName: string;
  metricId: string;
  metricLabel: string;
  kind: string;
  originDate: Date;
  remainingAmount: Prisma.Decimal;
  unit: string;
  summary: string;
  details: unknown;
}>, applicableThrough: string): CommissionReleaseEligibility[] {
  const users = new Map<string, {
    displayName: string;
    metrics: Map<string, KpiCommissionMetricRequirement>;
  }>();

  rows.forEach((row) => {
    const user = users.get(row.userId) ?? { displayName: row.displayName, metrics: new Map() };
    const pendingAmount = Number(row.remainingAmount);
    const requirement = {
      obligationId: row.id,
      metricId: row.metricId,
      metricLabel: row.metricLabel,
      kind: row.kind as KpiCommissionObligationKind,
      originDate: row.originDate.toISOString().slice(0, 10),
      pendingAmount,
      unit: row.unit,
      summary: row.summary,
      details: Array.isArray(row.details) ? row.details.filter((item): item is string => typeof item === "string") : []
    };
    const metric = user.metrics.get(row.metricId) ?? {
      metricId: row.metricId,
      metricLabel: row.metricLabel,
      blocked: true,
      pendingAmount: 0,
      unit: row.unit,
      oldestOriginDate: requirement.originDate,
      requirements: []
    };
    metric.pendingAmount = roundAmount(metric.pendingAmount + pendingAmount);
    metric.oldestOriginDate = !metric.oldestOriginDate || requirement.originDate < metric.oldestOriginDate
      ? requirement.originDate
      : metric.oldestOriginDate;
    metric.requirements.push(requirement);
    user.metrics.set(row.metricId, metric);
    users.set(row.userId, user);
  });

  return Array.from(users.entries()).map(([userId, user]) => ({
    userId,
    displayName: user.displayName,
    applicableThrough,
    blocked: true,
    auditAlert: false,
    requirements: Array.from(user.metrics.values())
      .map((metric) => ({
        ...metric,
        requirements: metric.requirements.sort((left, right) => left.originDate.localeCompare(right.originDate))
      }))
      .sort((left, right) => left.metricLabel.localeCompare(right.metricLabel))
  }));
}

export class KpiCommissionRequirementsService {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly kpis: PrismaKpisRepository
  ) {}

  public async synchronize() {
    const todayKey = getBusinessDateKey();
    const overview = await this.kpis.getPeriodOverview(
      KPI_COMMISSION_BASELINE_DATE,
      todayKey,
      SUPERADMIN_KPI_ACCESS
    );
    const currentExecutionState = await this.kpis.getExecutionIncompleteRowsCurrentState(todayKey);
    const obligations = mergeKpiUsers(overview).flatMap((user) => user.metrics.flatMap((metric) => {
      switch (metric.commissionStrategy) {
        case "daily-production":
          return buildDailyProductionObligations(user, metric);
        case "weekly-production":
          return buildWeeklyProductionObligations(user, metric, todayKey);
        case "incident":
          return buildIncidentObligations(user, metric);
        case "exact-daily":
          return buildExactDailyObligations(user, metric);
        case "state-threshold":
          return buildExecutionStateObligations(
            user,
            metric,
            currentExecutionState.incidents,
            currentExecutionState.value,
            currentExecutionState.target,
            todayKey
          );
        default:
          return [];
      }
    }));

    await this.persist(obligations);
    return obligations;
  }

  public async getEligibilityForMonth(year: number, month: number) {
    await this.synchronize();
    return this.listEligibility(getMonthEndKey(year, month));
  }

  public async getCurrentEligibility() {
    await this.synchronize();
    return this.listEligibility(getBusinessDateKey());
  }

  private async listEligibility(applicableThrough: string) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const rows = await this.prisma.kpiCommissionObligation.findMany({
      where: {
        organizationId,
        originDate: { lte: dateFromKey(applicableThrough) },
        remainingAmount: { gt: 0 },
        voidedAt: null
      },
      orderBy: [{ displayName: "asc" }, { metricLabel: "asc" }, { originDate: "asc" }, { createdAt: "asc" }]
    });
    return groupRequirementRows(rows, applicableThrough);
  }

  private async persist(obligations: DesiredObligation[]) {
    const organizationId = getCurrentOrganizationIdOrDefault();
    const now = new Date();
    const desiredKeys = new Set(obligations.map((obligation) => [
      obligation.userId,
      obligation.metricId,
      obligation.sourceKey
    ].join(":")));

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.kpiCommissionObligation.findMany({
        where: { organizationId },
        select: { id: true, userId: true, metricId: true, sourceKey: true }
      });

      for (const obligation of obligations) {
        const repairedAmount = roundAmount(obligation.repairs.reduce((total, repair) => total + repair.amount, 0));
        const remainingAmount = roundAmount(obligation.initialAmount - repairedAmount);
        const resolvedRepair = remainingAmount <= 0
          ? [...obligation.repairs].sort((left, right) => right.repairDate.localeCompare(left.repairDate))[0]
          : undefined;
        const record = await transaction.kpiCommissionObligation.upsert({
          where: {
            organizationId_userId_metricId_sourceKey: {
              organizationId,
              userId: obligation.userId,
              metricId: obligation.metricId,
              sourceKey: obligation.sourceKey
            }
          },
          create: {
            organizationId,
            userId: obligation.userId,
            userKey: obligation.userKey,
            displayName: obligation.displayName,
            metricId: obligation.metricId,
            metricLabel: obligation.metricLabel,
            kind: obligation.kind,
            sourceKey: obligation.sourceKey,
            originDate: dateFromKey(obligation.originDate),
            initialAmount: obligation.initialAmount,
            remainingAmount,
            unit: obligation.unit,
            summary: obligation.summary,
            details: obligation.details as Prisma.InputJsonValue,
            resolvedAt: resolvedRepair ? dateFromKey(resolvedRepair.repairDate) : null,
            voidedAt: null
          },
          update: {
            userKey: obligation.userKey,
            displayName: obligation.displayName,
            metricLabel: obligation.metricLabel,
            kind: obligation.kind,
            originDate: dateFromKey(obligation.originDate),
            initialAmount: obligation.initialAmount,
            remainingAmount,
            unit: obligation.unit,
            summary: obligation.summary,
            details: obligation.details as Prisma.InputJsonValue,
            resolvedAt: resolvedRepair ? dateFromKey(resolvedRepair.repairDate) : null,
            voidedAt: null
          }
        });
        const repairKeys = obligation.repairs.map((repair) => repair.sourceKey);

        for (const repair of obligation.repairs) {
          await transaction.kpiCommissionRepair.upsert({
            where: {
              organizationId_obligationId_sourceKey: {
                organizationId,
                obligationId: record.id,
                sourceKey: repair.sourceKey
              }
            },
            create: {
              organizationId,
              obligationId: record.id,
              userId: obligation.userId,
              metricId: obligation.metricId,
              sourceKey: repair.sourceKey,
              repairDate: dateFromKey(repair.repairDate),
              amount: repair.amount,
              summary: repair.summary,
              details: repair.details as Prisma.InputJsonValue,
              voidedAt: null
            },
            update: {
              repairDate: dateFromKey(repair.repairDate),
              amount: repair.amount,
              summary: repair.summary,
              details: repair.details as Prisma.InputJsonValue,
              voidedAt: null
            }
          });
        }

        await transaction.kpiCommissionRepair.updateMany({
          where: {
            organizationId,
            obligationId: record.id,
            voidedAt: null,
            ...(repairKeys.length > 0 ? { sourceKey: { notIn: repairKeys } } : {})
          },
          data: { voidedAt: now }
        });
      }

      const staleIds = existing
        .filter((record) => !desiredKeys.has([record.userId, record.metricId, record.sourceKey].join(":")))
        .map((record) => record.id);
      if (staleIds.length > 0) {
        await transaction.kpiCommissionObligation.updateMany({
          where: { organizationId, id: { in: staleIds }, voidedAt: null },
          data: { remainingAmount: 0, resolvedAt: null, voidedAt: now }
        });
        await transaction.kpiCommissionRepair.updateMany({
          where: { organizationId, obligationId: { in: staleIds }, voidedAt: null },
          data: { voidedAt: now }
        });
      }
    });
  }
}
