import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { COMMISSION_SECTIONS } from "@sige/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule, hasPermission } from "../auth/permissions";
const MONTH_NAMES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
];
const EMPTY_CALCULATION = {
    financeRecords: [],
    executionRecords: [],
    clientRecords: [],
    closingRecords: [],
    group1TeamBreakdowns: [],
    highlightedCount: 0,
    group1GrossMxn: 0,
    group1NetMxn: 0,
    group1PayableMxn: 0,
    group2TotalMxn: 0,
    group3TotalMxn: 0,
    totalCommissionsMxn: 0,
    grossTotalMxn: 0,
    deductionRate: 0,
    deductionBaseMxn: 0,
    deductionMxn: 0,
    netTotalMxn: 0
};
const CLIENT_RELATIONS_COMMISSION_SECTION = "Comunicacion con cliente";
const COMMISSION_TOTALS_SECTION = "Totales de comisiones";
const ONE_PERCENT_GROUP_SECTIONS = [
    CLIENT_RELATIONS_COMMISSION_SECTION,
    "Finanzas"
];
const COMMISSION_GROUP_TEAMS = [
    {
        teamKey: "LITIGATION",
        teamLabel: "Litigio",
        expenseTeamLabel: "Litigio",
        distributionKey: "pctLitigation"
    },
    {
        teamKey: "CORPORATE_LABOR",
        teamLabel: "Corporativo",
        expenseTeamLabel: "Corporativo y laboral",
        distributionKey: "pctCorporateLabor"
    },
    {
        teamKey: "SETTLEMENTS",
        teamLabel: "Convenios",
        expenseTeamLabel: "Convenios",
        distributionKey: "pctSettlements"
    },
    {
        teamKey: "FINANCIAL_LAW",
        teamLabel: "Derecho financiero",
        expenseTeamLabel: "Der Financiero",
        distributionKey: "pctFinancialLaw"
    },
    {
        teamKey: "TAX_COMPLIANCE",
        teamLabel: "Compliance fiscal",
        expenseTeamLabel: "Compliance Fiscal",
        distributionKey: "pctTaxCompliance"
    }
];
function normalizeText(value) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}
function normalizeIdentityText(value) {
    return normalizeText(value)
        .replace(/[@._-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function canManageCommissionExclusions(user) {
    const canWriteCommissionExclusions = Boolean(user?.permissions?.includes("commissions:exclusions:write"));
    const hasSuperadminAccess = Boolean(user?.permissions?.includes("*") ||
        user?.role === "SUPERADMIN" ||
        user?.legacyRole === "SUPERADMIN");
    const emailLocalPart = user?.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user?.email;
    const isEduardoRusconi = [user?.shortName, user?.username, user?.displayName, user?.email, emailLocalPart].some((value) => {
        const normalized = normalizeIdentityText(value);
        return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
    });
    return canWriteCommissionExclusions || (hasSuperadminAccess && isEduardoRusconi);
}
function buildCommissionExclusionKey(input) {
    return [
        input.year,
        input.month,
        normalizeText(input.section),
        input.group,
        input.financeRecordId
    ].join("::");
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
    }).format(value);
}
function usesOnePercentGroupBreakdown(section) {
    return ONE_PERCENT_GROUP_SECTIONS.some((targetSection) => normalizeText(targetSection) === normalizeText(section));
}
function isCommissionTotalsSection(section) {
    return normalizeText(section) === normalizeText(COMMISSION_TOTALS_SECTION);
}
function getGroup1RateLabel(section) {
    const normalizedSection = normalizeText(section);
    if (usesOnePercentGroupBreakdown(section)) {
        return "1%";
    }
    if (normalizedSection === normalizeText("Der Financiero (lider)")) {
        return "10%";
    }
    if (normalizedSection.includes("colaborador")) {
        return "1%";
    }
    return "8%";
}
function sumIncludedCommissionRows(records) {
    return records.reduce((sum, record) => sum + (record.excluded ? 0 : record.amountMxn), 0);
}
function getSnapshotCommissionTotals(data) {
    const group1TeamBreakdowns = data.group1TeamBreakdowns ?? [];
    const hasTeamBreakdowns = group1TeamBreakdowns.length > 0;
    const group1GrossMxn = data.group1GrossMxn ?? (hasTeamBreakdowns
        ? group1TeamBreakdowns.reduce((sum, team) => sum + team.grossMxn, 0)
        : sumIncludedCommissionRows(data.executionRecords));
    const group2TotalMxn = data.group2TotalMxn ?? sumIncludedCommissionRows(data.clientRecords);
    const group3TotalMxn = data.group3TotalMxn ?? sumIncludedCommissionRows(data.closingRecords);
    const group1NetMxn = data.group1NetMxn ?? (hasTeamBreakdowns
        ? group1TeamBreakdowns.reduce((sum, team) => sum + team.payableMxn, 0)
        : group1GrossMxn - data.deductionMxn);
    const group1PayableMxn = data.group1PayableMxn ?? (hasTeamBreakdowns ? group1NetMxn : Math.max(group1NetMxn, 0));
    const totalCommissionsMxn = data.totalCommissionsMxn ?? data.netTotalMxn ?? (group1PayableMxn +
        group2TotalMxn +
        group3TotalMxn);
    return {
        group1GrossMxn,
        group1NetMxn,
        group1PayableMxn,
        group2TotalMxn,
        group3TotalMxn,
        totalCommissionsMxn,
        group1TeamBreakdowns
    };
}
function formatDate(value) {
    if (!value) {
        return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "-";
    }
    return date.toLocaleDateString();
}
function toDateKey(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 10);
}
function getErrorMessage(error) {
    return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}
function calculateFinanceStats(record) {
    const totalPaidMxn = record.paidThisMonthMxn + record.payment2Mxn + record.payment3Mxn;
    const totalExpensesMxn = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
    const netFeesMxn = totalPaidMxn - totalExpensesMxn;
    const remainingMxn = record.conceptFeesMxn - record.previousPaymentsMxn;
    const dueTodayMxn = remainingMxn - totalPaidMxn;
    const clientCommissionMxn = netFeesMxn * 0.2;
    const closingCommissionMxn = netFeesMxn * 0.1;
    const commissionableBaseMxn = netFeesMxn - clientCommissionMxn - closingCommissionMxn;
    const pctSum = record.pctLitigation +
        record.pctCorporateLabor +
        record.pctSettlements +
        record.pctFinancialLaw +
        record.pctTaxCompliance;
    const calculateExecutionCommission = (baseRate, percentage) => percentage <= 0 ? 0 : commissionableBaseMxn * baseRate * (percentage / 100);
    const litigationLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctLitigation);
    const litigationCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctLitigation);
    const corporateLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctCorporateLabor);
    const corporateCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctCorporateLabor);
    const settlementsLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctSettlements);
    const settlementsCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctSettlements);
    const financialLeaderCommissionMxn = calculateExecutionCommission(0.1, record.pctFinancialLaw);
    const financialCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctFinancialLaw);
    const taxLeaderCommissionMxn = calculateExecutionCommission(0.08, record.pctTaxCompliance);
    const taxCollaboratorCommissionMxn = calculateExecutionCommission(0.01, record.pctTaxCompliance);
    const clientRelationsCommissionMxn = commissionableBaseMxn * 0.01;
    const financeCommissionMxn = commissionableBaseMxn * 0.01;
    const netProfitMxn = netFeesMxn -
        (clientCommissionMxn +
            closingCommissionMxn +
            litigationLeaderCommissionMxn +
            litigationCollaboratorCommissionMxn +
            corporateLeaderCommissionMxn +
            corporateCollaboratorCommissionMxn +
            settlementsLeaderCommissionMxn +
            settlementsCollaboratorCommissionMxn +
            financialLeaderCommissionMxn +
            financialCollaboratorCommissionMxn +
            taxLeaderCommissionMxn +
            taxCollaboratorCommissionMxn +
            clientRelationsCommissionMxn +
            financeCommissionMxn);
    return {
        totalPaidMxn,
        totalExpensesMxn,
        netFeesMxn,
        remainingMxn,
        dueTodayMxn,
        clientCommissionMxn,
        closingCommissionMxn,
        commissionableBaseMxn,
        pctSum,
        litigationLeaderCommissionMxn,
        litigationCollaboratorCommissionMxn,
        corporateLeaderCommissionMxn,
        corporateCollaboratorCommissionMxn,
        settlementsLeaderCommissionMxn,
        settlementsCollaboratorCommissionMxn,
        financialLeaderCommissionMxn,
        financialCollaboratorCommissionMxn,
        taxLeaderCommissionMxn,
        taxCollaboratorCommissionMxn,
        clientRelationsCommissionMxn,
        financeCommissionMxn,
        netProfitMxn
    };
}
function resolveEffectiveClientNumber(record, clients) {
    if (record.clientNumber) {
        return record.clientNumber;
    }
    const match = clients.find((client) => normalizeText(client.name) === normalizeText(record.clientName));
    return match?.clientNumber;
}
function getExecutionAmount(record, stats, section) {
    const normalizedSection = normalizeText(section);
    switch (normalizedSection) {
        case normalizeText("Litigio (lider)"):
            return record.responsibleTeam === "LITIGATION" ? stats.litigationLeaderCommissionMxn : 0;
        case normalizeText("Litigio (colaborador)"):
            return record.responsibleTeam === "LITIGATION" ? stats.litigationCollaboratorCommissionMxn : 0;
        case normalizeText("Corporativo-laboral (lider)"):
            return record.responsibleTeam === "CORPORATE_LABOR" ? stats.corporateLeaderCommissionMxn : 0;
        case normalizeText("Corporativo-laboral (colaborador)"):
            return record.responsibleTeam === "CORPORATE_LABOR" ? stats.corporateCollaboratorCommissionMxn : 0;
        case normalizeText("Convenios (lider)"):
            return record.responsibleTeam === "SETTLEMENTS" ? stats.settlementsLeaderCommissionMxn : 0;
        case normalizeText("Convenios (colaborador)"):
            return record.responsibleTeam === "SETTLEMENTS" ? stats.settlementsCollaboratorCommissionMxn : 0;
        case normalizeText("Der Financiero (lider)"):
            return record.responsibleTeam === "FINANCIAL_LAW" ? stats.financialLeaderCommissionMxn : 0;
        case normalizeText("Der Financiero (colaborador)"):
            return record.responsibleTeam === "FINANCIAL_LAW" ? stats.financialCollaboratorCommissionMxn : 0;
        case normalizeText("Compliance Fiscal (lider)"):
            return record.responsibleTeam === "TAX_COMPLIANCE" ? stats.taxLeaderCommissionMxn : 0;
        case normalizeText("Compliance Fiscal (colaborador)"):
            return record.responsibleTeam === "TAX_COMPLIANCE" ? stats.taxCollaboratorCommissionMxn : 0;
        case normalizeText("Comunicacion con cliente"):
            return stats.clientRelationsCommissionMxn;
        case normalizeText("Finanzas"):
            return stats.financeCommissionMxn;
        default:
            return 0;
    }
}
function getDeductionConfiguration(section) {
    const normalizedSection = normalizeText(section);
    switch (normalizedSection) {
        case normalizeText("Litigio (lider)"):
            return { rate: 0.08, teamLabel: "Litigio", distributionKey: "pctLitigation", useAllExpenses: false };
        case normalizeText("Litigio (colaborador)"):
            return { rate: 0.01, teamLabel: "Litigio", distributionKey: "pctLitigation", useAllExpenses: false };
        case normalizeText("Corporativo-laboral (lider)"):
            return { rate: 0.08, teamLabel: "Corporativo y laboral", distributionKey: "pctCorporateLabor", useAllExpenses: false };
        case normalizeText("Corporativo-laboral (colaborador)"):
            return { rate: 0.01, teamLabel: "Corporativo y laboral", distributionKey: "pctCorporateLabor", useAllExpenses: false };
        case normalizeText("Convenios (lider)"):
            return { rate: 0.08, teamLabel: "Convenios", distributionKey: "pctSettlements", useAllExpenses: false };
        case normalizeText("Convenios (colaborador)"):
            return { rate: 0.01, teamLabel: "Convenios", distributionKey: "pctSettlements", useAllExpenses: false };
        case normalizeText("Der Financiero (lider)"):
            return { rate: 0, teamLabel: "Der Financiero", distributionKey: "pctFinancialLaw", useAllExpenses: false };
        case normalizeText("Der Financiero (colaborador)"):
            return { rate: 0.01, teamLabel: "Der Financiero", distributionKey: "pctFinancialLaw", useAllExpenses: false };
        case normalizeText("Compliance Fiscal (lider)"):
            return { rate: 0.08, teamLabel: "Compliance Fiscal", distributionKey: "pctTaxCompliance", useAllExpenses: false };
        case normalizeText("Compliance Fiscal (colaborador)"):
            return { rate: 0.01, teamLabel: "Compliance Fiscal", distributionKey: "pctTaxCompliance", useAllExpenses: false };
        case normalizeText("Comunicacion con cliente"):
        case normalizeText("Finanzas"):
            return { rate: 0.01, teamLabel: "", distributionKey: undefined, useAllExpenses: true };
        default:
            return { rate: 0, teamLabel: "", distributionKey: undefined, useAllExpenses: false };
    }
}
function getExpenseDistributionSum(expense) {
    return (Number(expense.pctLitigation || 0) +
        Number(expense.pctCorporateLabor || 0) +
        Number(expense.pctSettlements || 0) +
        Number(expense.pctFinancialLaw || 0) +
        Number(expense.pctTaxCompliance || 0));
}
function getExpenseDeductionBaseAmount(expense, deductionConfiguration) {
    const amount = Number(expense.amountMxn || 0);
    if (deductionConfiguration.useAllExpenses) {
        return amount;
    }
    if (expense.expenseWithoutTeam) {
        return 0;
    }
    if (expense.generalExpense) {
        return amount / 5;
    }
    if (deductionConfiguration.distributionKey && getExpenseDistributionSum(expense) > 0) {
        return amount * (Number(expense[deductionConfiguration.distributionKey] || 0) / 100);
    }
    const isGeneralExpense = normalizeText(expense.team) === normalizeText("General");
    if (isGeneralExpense) {
        return amount / 5;
    }
    if (normalizeText(expense.team) === normalizeText(deductionConfiguration.teamLabel)) {
        return amount;
    }
    return 0;
}
function buildOnePercentGroupTeamBreakdowns(executionRecords, generalExpenses) {
    return COMMISSION_GROUP_TEAMS.map((team) => {
        const grossMxn = executionRecords
            .filter((record) => !record.excluded && record.teamKey === team.teamKey)
            .reduce((sum, record) => sum + record.amountMxn, 0);
        const deductionBaseMxn = generalExpenses.reduce((sum, expense) => {
            return sum + getExpenseDeductionBaseAmount(expense, {
                rate: 0.01,
                teamLabel: team.expenseTeamLabel,
                distributionKey: team.distributionKey,
                useAllExpenses: false
            });
        }, 0);
        const deductionMxn = deductionBaseMxn * 0.01;
        const netMxn = grossMxn - deductionMxn;
        return {
            teamKey: team.teamKey,
            teamLabel: team.teamLabel,
            grossMxn,
            deductionBaseMxn,
            deductionMxn,
            netMxn,
            payableMxn: Math.max(netMxn, 0)
        };
    });
}
function buildHighlightReason(record, stats, clients) {
    const effectiveClientNumber = resolveEffectiveClientNumber(record, clients);
    const requiredFields = [
        { label: "numero_cliente", missing: !effectiveClientNumber },
        { label: "cliente", missing: normalizeText(record.clientName).length === 0 },
        { label: "numero_cotizacion", missing: normalizeText(record.quoteNumber).length === 0 },
        { label: "asunto", missing: normalizeText(record.subject).length === 0 },
        { label: "total_asunto", missing: record.totalMatterMxn <= 0 },
        { label: "honorarios_conceptos", missing: record.conceptFeesMxn <= 0 },
        { label: "conceptos_trabajando", missing: normalizeText(record.workingConcepts).length === 0 },
        { label: "fecha_pactada_pago", missing: normalizeText(record.nextPaymentDate).length === 0 },
        { label: "detalle_fecha_pactada", missing: normalizeText(record.nextPaymentNotes).length === 0 },
        { label: "equipo_responsable", missing: !record.responsibleTeam },
        { label: "comision_cliente_quien", missing: normalizeText(record.clientCommissionRecipient).length === 0 },
        { label: "comision_cierre_quien", missing: normalizeText(record.closingCommissionRecipient).length === 0 }
    ];
    const missing = requiredFields.filter((field) => field.missing).map((field) => field.label);
    const today = new Date();
    const todayKey = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
    const nextPaymentDateKey = toDateKey(record.nextPaymentDate);
    const isDateUrgent = Boolean(nextPaymentDateKey) && nextPaymentDateKey <= todayKey && stats.dueTodayMxn > 1;
    const isSumIncorrect = stats.pctSum !== 100;
    const isContractPending = record.contractSignedStatus === "NO";
    const parts = [];
    if (missing.length > 0) {
        parts.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
    }
    if (isContractPending) {
        parts.push("Contrato firmado en NO.");
    }
    if (isDateUrgent) {
        parts.push("ATENCION: tarea urgente por fecha pactada vencida o de hoy sin pago suficiente.");
    }
    if (isSumIncorrect) {
        parts.push(`ATENCION: la suma de porcentajes es ${stats.pctSum}%, debe ser 100%.`);
    }
    return parts.join(" ");
}
function calculateSection(financeRecords, generalExpenses, clients, section, year, month, exclusions) {
    if (!section) {
        return EMPTY_CALCULATION;
    }
    const exclusionKeys = new Set(exclusions
        .filter((exclusion) => exclusion.year === year &&
        exclusion.month === month &&
        normalizeText(exclusion.section) === normalizeText(section))
        .map((exclusion) => buildCommissionExclusionKey(exclusion)));
    const applyExclusions = (records) => records.map((record) => ({
        ...record,
        excluded: exclusionKeys.has(buildCommissionExclusionKey({
            year,
            month,
            section,
            group: record.group,
            financeRecordId: record.financeRecordId
        }))
    }));
    const computedRecords = financeRecords.map((record) => {
        const stats = calculateFinanceStats(record);
        const highlightReason = buildHighlightReason(record, stats, clients);
        return {
            ...record,
            ...stats,
            effectiveClientNumber: resolveEffectiveClientNumber(record, clients),
            highlighted: highlightReason.length > 0,
            highlightReason: highlightReason || undefined
        };
    });
    const executionRecords = applyExclusions(computedRecords
        .map((record) => {
        const amountMxn = getExecutionAmount(record, record, section);
        if (amountMxn <= 0) {
            return null;
        }
        const showOnePercentBase = usesOnePercentGroupBreakdown(section);
        const teamConfig = COMMISSION_GROUP_TEAMS.find((team) => team.teamKey === record.responsibleTeam);
        if (showOnePercentBase && !teamConfig) {
            return null;
        }
        return {
            financeRecordId: record.id,
            clientName: record.clientName,
            clientNumber: record.effectiveClientNumber,
            quoteNumber: record.quoteNumber,
            subject: `${record.subject}${showOnePercentBase ? " (1% Base)" : ""}`,
            group: "EXECUTION",
            baseNetMxn: record.netFeesMxn,
            amountMxn,
            teamKey: teamConfig?.teamKey,
            teamLabel: teamConfig?.teamLabel,
            highlighted: record.highlighted,
            highlightReason: record.highlightReason
        };
    })
        .filter((record) => record !== null));
    const clientRecords = applyExclusions(computedRecords
        .filter((record) => normalizeText(record.clientCommissionRecipient) === normalizeText(section) && record.clientCommissionMxn > 0)
        .map((record) => ({
        financeRecordId: record.id,
        clientName: record.clientName,
        clientNumber: record.effectiveClientNumber,
        quoteNumber: record.quoteNumber,
        subject: record.subject,
        group: "CLIENT",
        baseNetMxn: record.netFeesMxn,
        amountMxn: record.clientCommissionMxn,
        highlighted: record.highlighted,
        highlightReason: record.highlightReason
    })));
    const closingRecords = applyExclusions(computedRecords
        .filter((record) => normalizeText(record.closingCommissionRecipient) === normalizeText(section) && record.closingCommissionMxn > 0)
        .map((record) => ({
        financeRecordId: record.id,
        clientName: record.clientName,
        clientNumber: record.effectiveClientNumber,
        quoteNumber: record.quoteNumber,
        subject: record.subject,
        group: "CLOSING",
        baseNetMxn: record.netFeesMxn,
        amountMxn: record.closingCommissionMxn,
        highlighted: record.highlighted,
        highlightReason: record.highlightReason
    })));
    const group2TotalMxn = sumIncludedCommissionRows(clientRecords);
    const group3TotalMxn = sumIncludedCommissionRows(closingRecords);
    const deductionConfiguration = getDeductionConfiguration(section);
    let group1TeamBreakdowns = [];
    let group1GrossMxn = sumIncludedCommissionRows(executionRecords);
    let deductionBaseMxn = generalExpenses.reduce((sum, expense) => {
        return sum + getExpenseDeductionBaseAmount(expense, deductionConfiguration);
    }, 0);
    if (usesOnePercentGroupBreakdown(section)) {
        group1TeamBreakdowns = buildOnePercentGroupTeamBreakdowns(executionRecords, generalExpenses);
        group1GrossMxn = group1TeamBreakdowns.reduce((sum, team) => sum + team.grossMxn, 0);
        deductionBaseMxn = group1TeamBreakdowns.reduce((sum, team) => sum + team.deductionBaseMxn, 0);
    }
    const deductionMxn = usesOnePercentGroupBreakdown(section)
        ? group1TeamBreakdowns.reduce((sum, team) => sum + team.deductionMxn, 0)
        : deductionBaseMxn * deductionConfiguration.rate;
    const rawGroup1NetMxn = group1GrossMxn - deductionMxn;
    const group1NetMxn = usesOnePercentGroupBreakdown(section)
        ? group1TeamBreakdowns.reduce((sum, team) => sum + team.payableMxn, 0)
        : rawGroup1NetMxn;
    const group1PayableMxn = usesOnePercentGroupBreakdown(section)
        ? group1NetMxn
        : Math.max(group1NetMxn, 0);
    const grossTotalMxn = group1GrossMxn + group2TotalMxn + group3TotalMxn;
    const totalCommissionsMxn = group1PayableMxn + group2TotalMxn + group3TotalMxn;
    return {
        financeRecords: computedRecords,
        executionRecords,
        clientRecords,
        closingRecords,
        group1TeamBreakdowns,
        highlightedCount: computedRecords.filter((record) => record.highlighted).length,
        group1GrossMxn,
        group1NetMxn,
        group1PayableMxn,
        group2TotalMxn,
        group3TotalMxn,
        totalCommissionsMxn,
        grossTotalMxn,
        deductionRate: deductionConfiguration.rate,
        deductionBaseMxn,
        deductionMxn,
        netTotalMxn: totalCommissionsMxn
    };
}
function CurrencyMetricCard(props) {
    return (_jsxs("article", { className: `commissions-metric-card ${props.accentClass}`, children: [_jsx("span", { children: props.label }), _jsx("strong", { children: formatCurrency(props.value) }), props.helper ? _jsx("small", { children: props.helper }) : null] }));
}
function CountMetricCard(props) {
    return (_jsxs("article", { className: `commissions-metric-card ${props.accentClass}`, children: [_jsx("span", { children: props.label }), _jsx("strong", { children: props.value }), props.helper ? _jsx("small", { children: props.helper }) : null] }));
}
function CommissionTeamBreakdownCards(props) {
    return (_jsxs("div", { className: "commissions-team-breakdown-grid", children: [props.teams.map((team) => (_jsx(CurrencyMetricCard, { label: `Brutas ${team.teamLabel} (1%)`, value: team.grossMxn, accentClass: "is-primary" }, `${team.teamKey}-gross`))), props.teams.map((team) => (_jsx(CurrencyMetricCard, { label: `Deduccion ${team.teamLabel}`, value: team.deductionMxn, accentClass: "is-warning", helper: `Neto: ${formatCurrency(team.netMxn)} | aporta ${formatCurrency(team.payableMxn)}` }, `${team.teamKey}-deduction`)))] }));
}
function CommissionGroupTable(props) {
    const total = props.rows.reduce((sum, row) => sum + (row.excluded ? 0 : row.amountMxn), 0);
    const totalColumns = (props.showBaseNet ? 4 : 3) + (props.showExclusionControls ? 1 : 0);
    const totalLabelColumns = props.showBaseNet ? 3 : 2;
    return (_jsxs("section", { className: "panel commissions-group-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: props.title }), _jsxs("span", { children: [props.rows.length, " registros"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: `data-table commissions-group-table ${props.toneClass}`, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), props.showBaseNet ? _jsx("th", { children: "Base Neta" }) : null, _jsx("th", { children: props.showBaseNet ? "Comision" : "Monto" }), props.showExclusionControls ? _jsx("th", { className: "commissions-exclusion-heading", children: "Excluir gasto" }) : null] }) }), _jsx("tbody", { children: props.rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: totalColumns, children: "Sin comisiones en este rubro." }) })) : (props.rows.map((row) => {
                                const exclusionKey = props.year && props.month && props.section
                                    ? buildCommissionExclusionKey({
                                        year: props.year,
                                        month: props.month,
                                        section: props.section,
                                        group: row.group,
                                        financeRecordId: row.financeRecordId
                                    })
                                    : `${row.group}-${row.financeRecordId}`;
                                const savingExclusion = props.savingExclusionKeys?.has(exclusionKey) ?? false;
                                const rowClassName = [
                                    row.highlighted ? "commissions-row-alert" : "",
                                    row.excluded ? "commissions-row-excluded" : ""
                                ].filter(Boolean).join(" ") || undefined;
                                const rowTitle = [
                                    row.highlightReason,
                                    row.excluded ? "Excluido del calculo de esta seccion." : ""
                                ].filter(Boolean).join(" ");
                                return (_jsxs("tr", { className: rowClassName, style: row.highlighted ? { backgroundColor: "#fee2e2" } : undefined, title: rowTitle || undefined, children: [_jsx("td", { children: row.clientName || "-" }), _jsx("td", { children: row.subject || "-" }), props.showBaseNet ? _jsx("td", { children: formatCurrency(row.baseNetMxn) }) : null, _jsx("td", { className: "commissions-amount-cell", children: _jsx("span", { className: row.excluded ? "commissions-amount-excluded" : undefined, children: formatCurrency(row.amountMxn) }) }), props.showExclusionControls ? (_jsx("td", { className: "commissions-exclusion-cell", children: _jsx("label", { className: "commissions-exclusion-toggle", title: props.canManageExclusions
                                                    ? "Excluir del calculo de esta seccion"
                                                    : "Solo Eduardo Rusconi o Finanzas puede cambiar esta exclusion", children: _jsx("input", { type: "checkbox", checked: Boolean(row.excluded), disabled: !props.canManageExclusions || savingExclusion, "aria-label": `Excluir ${row.clientName || "registro"} del calculo de esta seccion`, onChange: (event) => props.onToggleExclusion?.(row, event.target.checked) }) }) })) : null] }, `${row.group}-${row.financeRecordId}`));
                            })) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: totalLabelColumns, children: "Total rubro" }), _jsx("td", { children: formatCurrency(total) }), props.showExclusionControls ? _jsx("td", { className: "commissions-exclusion-cell", "aria-label": "Excluir gasto" }) : null] }) })] }) })] }));
}
function CommissionTotalsTable(props) {
    const totalCommissionsMxn = props.rows.reduce((sum, row) => sum + row.calculation.totalCommissionsMxn, 0);
    return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Comisiones a pagar por receptor" }), _jsxs("span", { children: [props.rows.length, " secciones"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table commissions-totals-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Receptor" }), _jsx("th", { children: "Comision a pagar" })] }) }), _jsx("tbody", { children: props.rows.map((row) => (_jsxs("tr", { children: [_jsx("td", { children: row.section }), _jsx("td", { className: "commissions-total-strong", children: formatCurrency(row.calculation.totalCommissionsMxn) })] }, row.section))) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { children: "Total general" }), _jsx("td", { children: formatCurrency(totalCommissionsMxn) })] }) })] }) })] }));
}
function SnapshotDetailModal(props) {
    const data = props.snapshot.snapshotData;
    const totals = data ? getSnapshotCommissionTotals(data) : null;
    const snapshotGroup1RateLabel = getGroup1RateLabel(props.snapshot.section);
    const snapshotUsesTeamBreakdown = Boolean(totals?.group1TeamBreakdowns.length);
    return (_jsx("div", { className: "commissions-modal-backdrop", onClick: props.onClose, children: _jsxs("div", { className: "commissions-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "commissions-modal-header", children: [_jsxs("div", { children: [_jsx("h2", { children: props.snapshot.title }), _jsxs("p", { className: "muted", children: [props.snapshot.section, " | ", MONTH_NAMES[props.snapshot.month - 1], " ", props.snapshot.year] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: props.onClose, children: "Cerrar" })] }), !data ? (_jsx("div", { className: "commissions-modal-body", children: _jsx("p", { className: "muted", children: "No hay detalle disponible para esta estampa." }) })) : (_jsxs("div", { className: "commissions-modal-body", children: [_jsxs("div", { className: "commissions-metrics-grid", children: [snapshotUsesTeamBreakdown ? (_jsx(CommissionTeamBreakdownCards, { teams: totals?.group1TeamBreakdowns ?? [] })) : (_jsxs(_Fragment, { children: [_jsx(CurrencyMetricCard, { label: `Comisiones brutas Grupo 1 (${snapshotGroup1RateLabel})`, value: totals?.group1GrossMxn ?? 0, accentClass: "is-primary" }), _jsx(CurrencyMetricCard, { label: "Deduccion por gastos", value: data.deductionMxn, accentClass: "is-warning", helper: `${Math.round(data.deductionRate * 100)}% de ${formatCurrency(data.deductionBaseMxn)}` })] })), _jsx(CurrencyMetricCard, { label: `Comisiones netas Grupo 1 (${snapshotGroup1RateLabel})`, value: totals?.group1NetMxn ?? 0, accentClass: "is-success" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 2 (20%)", value: totals?.group2TotalMxn ?? 0, accentClass: "is-neutral" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 3 (10%)", value: totals?.group3TotalMxn ?? 0, accentClass: "is-neutral" }), _jsx(CurrencyMetricCard, { label: "Comisiones totales", value: totals?.totalCommissionsMxn ?? 0, accentClass: "is-success" })] }), _jsx(CommissionGroupTable, { title: "1. Comision por ejecucion", toneClass: "tone-primary", rows: data.executionRecords, showBaseNet: true }), _jsx(CommissionGroupTable, { title: "2. Comision por cliente", toneClass: "tone-secondary", rows: data.clientRecords, showBaseNet: true }), _jsx(CommissionGroupTable, { title: "3. Comision por cierre", toneClass: "tone-tertiary", rows: data.closingRecords, showBaseNet: true })] }))] }) }));
}
export function CommissionsPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState("calculation");
    const [activeSection, setActiveSection] = useState("");
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [financeRecords, setFinanceRecords] = useState([]);
    const [generalExpenses, setGeneralExpenses] = useState([]);
    const [receivers, setReceivers] = useState([]);
    const [clients, setClients] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [exclusions, setExclusions] = useState([]);
    const [savingExclusionKeys, setSavingExclusionKeys] = useState(new Set());
    const [loadingBoard, setLoadingBoard] = useState(true);
    const [loadingSnapshots, setLoadingSnapshots] = useState(true);
    const [savingSnapshot, setSavingSnapshot] = useState(false);
    const [savingReceiver, setSavingReceiver] = useState(false);
    const [flash, setFlash] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [newReceiverName, setNewReceiverName] = useState("");
    const [editingReceiverId, setEditingReceiverId] = useState(null);
    const [editingReceiverName, setEditingReceiverName] = useState("");
    const [viewingSnapshot, setViewingSnapshot] = useState(null);
    const canWriteCommissions = canWriteModule(user, "commissions");
    const canReadAllCommissions = canWriteCommissions || hasPermission(user, "commissions:all:read");
    const canWriteClientRelationsCommissions = hasPermission(user, "commissions:client-relations:write");
    const canWriteOwnCommissionSection = hasPermission(user, "commissions:own-section:write");
    const canReadClients = hasPermission(user, "clients:read");
    const canManageExclusions = canManageCommissionExclusions(user);
    const visibleSections = useMemo(() => {
        const userRole = normalizeText(user?.specificRole);
        if (canReadAllCommissions || user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN") {
            return [...COMMISSION_SECTIONS, COMMISSION_TOTALS_SECTION];
        }
        if (canWriteClientRelationsCommissions) {
            return COMMISSION_SECTIONS.filter((section) => normalizeText(section) === normalizeText(CLIENT_RELATIONS_COMMISSION_SECTION));
        }
        return COMMISSION_SECTIONS.filter((section) => normalizeText(section) === userRole);
    }, [canReadAllCommissions, canWriteClientRelationsCommissions, user?.legacyRole, user?.role, user?.specificRole]);
    const canAccessCalculation = visibleSections.length > 0;
    const visibleSectionKeys = useMemo(() => new Set(visibleSections.map((section) => normalizeText(section))), [visibleSections]);
    const isTotalsActiveSection = isCommissionTotalsSection(activeSection);
    const canWriteActiveSection = Boolean(!isTotalsActiveSection &&
        (canWriteCommissions ||
            (canWriteClientRelationsCommissions &&
                normalizeText(activeSection) === normalizeText(CLIENT_RELATIONS_COMMISSION_SECTION)) ||
            (canWriteOwnCommissionSection &&
                visibleSectionKeys.has(normalizeText(activeSection)))));
    useEffect(() => {
        if (visibleSections.length === 0) {
            setActiveSection("");
            return;
        }
        if (!visibleSections.includes(activeSection)) {
            setActiveSection(visibleSections[0]);
        }
    }, [activeSection, visibleSections]);
    useEffect(() => {
        if (activeTab === "receivers" && !canReadAllCommissions) {
            setActiveTab("calculation");
        }
    }, [activeTab, canReadAllCommissions]);
    async function loadBoard() {
        setLoadingBoard(true);
        setErrorMessage(null);
        try {
            const [overview, clientsResponse] = await Promise.all([
                apiGet(`/commissions/overview?year=${selectedYear}&month=${selectedMonth}`),
                canReadClients ? apiGet("/clients") : Promise.resolve([])
            ]);
            setFinanceRecords(overview.financeRecords);
            setGeneralExpenses(overview.generalExpenses);
            setReceivers(overview.receivers);
            setExclusions(overview.exclusions ?? []);
            setClients(clientsResponse);
        }
        catch (error) {
            setErrorMessage(getErrorMessage(error));
        }
        finally {
            setLoadingBoard(false);
        }
    }
    async function loadSnapshots() {
        setLoadingSnapshots(true);
        try {
            const data = await apiGet("/commissions/snapshots");
            setSnapshots(data);
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setLoadingSnapshots(false);
        }
    }
    useEffect(() => {
        void loadBoard();
    }, [selectedYear, selectedMonth]);
    useEffect(() => {
        void loadSnapshots();
    }, []);
    const sectionCalculation = useMemo(() => calculateSection(financeRecords, generalExpenses, clients, activeSection, selectedYear, selectedMonth, exclusions), [activeSection, clients, exclusions, financeRecords, generalExpenses, selectedMonth, selectedYear]);
    const commissionTotalsRows = useMemo(() => {
        if (!isTotalsActiveSection) {
            return [];
        }
        return COMMISSION_SECTIONS
            .filter((section) => normalizeText(section) !== normalizeText("Direccion general"))
            .map((section) => ({
            section,
            calculation: calculateSection(financeRecords, generalExpenses, clients, section, selectedYear, selectedMonth, exclusions)
        }));
    }, [clients, exclusions, financeRecords, generalExpenses, isTotalsActiveSection, selectedMonth, selectedYear]);
    const commissionTotalsSummary = useMemo(() => commissionTotalsRows.reduce((acc, row) => ({
        group1PayableMxn: acc.group1PayableMxn + row.calculation.group1PayableMxn,
        group2TotalMxn: acc.group2TotalMxn + row.calculation.group2TotalMxn,
        group3TotalMxn: acc.group3TotalMxn + row.calculation.group3TotalMxn,
        totalCommissionsMxn: acc.totalCommissionsMxn + row.calculation.totalCommissionsMxn
    }), {
        group1PayableMxn: 0,
        group2TotalMxn: 0,
        group3TotalMxn: 0,
        totalCommissionsMxn: 0
    }), [commissionTotalsRows]);
    async function handleToggleCommissionExclusion(row, excluded) {
        if (!canManageExclusions || !activeSection) {
            return;
        }
        const payload = {
            year: selectedYear,
            month: selectedMonth,
            section: activeSection,
            group: row.group,
            financeRecordId: row.financeRecordId,
            excluded
        };
        const exclusionKey = buildCommissionExclusionKey(payload);
        setSavingExclusionKeys((current) => new Set(current).add(exclusionKey));
        setFlash(null);
        try {
            const response = await apiPatch("/commissions/exclusions", payload);
            setExclusions((current) => {
                const withoutCurrent = current.filter((entry) => buildCommissionExclusionKey(entry) !== exclusionKey);
                if (!excluded) {
                    return withoutCurrent;
                }
                return [...withoutCurrent, response];
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingExclusionKeys((current) => {
                const next = new Set(current);
                next.delete(exclusionKey);
                return next;
            });
        }
    }
    async function handleCreateReceiver() {
        if (!canWriteCommissions) {
            return;
        }
        const name = newReceiverName.trim();
        if (!name) {
            return;
        }
        setSavingReceiver(true);
        setFlash(null);
        try {
            const receiver = await apiPost("/commissions/receivers", { name });
            setReceivers((current) => [...current, receiver].sort((left, right) => left.name.localeCompare(right.name)));
            setNewReceiverName("");
            setFlash({ tone: "success", text: "Receptor agregado correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingReceiver(false);
        }
    }
    async function handleUpdateReceiver() {
        if (!canWriteCommissions) {
            return;
        }
        if (!editingReceiverId || !editingReceiverName.trim()) {
            return;
        }
        setSavingReceiver(true);
        setFlash(null);
        try {
            const receiver = await apiPatch(`/commissions/receivers/${editingReceiverId}`, {
                name: editingReceiverName.trim()
            });
            setReceivers((current) => current
                .map((entry) => (entry.id === receiver.id ? receiver : entry))
                .sort((left, right) => left.name.localeCompare(right.name)));
            setEditingReceiverId(null);
            setEditingReceiverName("");
            setFlash({ tone: "success", text: "Receptor actualizado correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingReceiver(false);
        }
    }
    async function handleDeleteReceiver(receiverId) {
        if (!canWriteCommissions) {
            return;
        }
        if (!window.confirm("Eliminar este receptor puede afectar calculos historicos. Deseas continuar?")) {
            return;
        }
        setSavingReceiver(true);
        setFlash(null);
        try {
            await apiDelete(`/commissions/receivers/${receiverId}`);
            setReceivers((current) => current.filter((entry) => entry.id !== receiverId));
            setFlash({ tone: "success", text: "Receptor eliminado correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingReceiver(false);
        }
    }
    async function handleCreateSnapshot() {
        if (!canWriteActiveSection) {
            return;
        }
        if (!activeSection) {
            setFlash({ tone: "error", text: "Selecciona primero una seccion para guardar la estampa." });
            return;
        }
        setSavingSnapshot(true);
        setFlash(null);
        const snapshotData = {
            section: activeSection,
            financeRecords: sectionCalculation.financeRecords,
            generalExpenses,
            executionRecords: sectionCalculation.executionRecords,
            clientRecords: sectionCalculation.clientRecords,
            closingRecords: sectionCalculation.closingRecords,
            group1TeamBreakdowns: sectionCalculation.group1TeamBreakdowns,
            group1GrossMxn: sectionCalculation.group1GrossMxn,
            group1NetMxn: sectionCalculation.group1NetMxn,
            group1PayableMxn: sectionCalculation.group1PayableMxn,
            group2TotalMxn: sectionCalculation.group2TotalMxn,
            group3TotalMxn: sectionCalculation.group3TotalMxn,
            totalCommissionsMxn: sectionCalculation.totalCommissionsMxn,
            grossTotalMxn: sectionCalculation.grossTotalMxn,
            deductionRate: sectionCalculation.deductionRate,
            deductionBaseMxn: sectionCalculation.deductionBaseMxn,
            deductionMxn: sectionCalculation.deductionMxn,
            netTotalMxn: sectionCalculation.netTotalMxn,
            createdAt: new Date().toISOString()
        };
        try {
            const snapshot = await apiPost("/commissions/snapshots", {
                year: selectedYear,
                month: selectedMonth,
                section: activeSection,
                title: `Estampa: ${activeSection} - ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`,
                totalNetMxn: sectionCalculation.totalCommissionsMxn,
                snapshotData
            });
            setSnapshots((current) => [...current, snapshot]);
            setFlash({ tone: "success", text: "Estampa guardada correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingSnapshot(false);
        }
    }
    const snapshotCards = loadingSnapshots
        ? []
        : canReadAllCommissions
            ? snapshots
            : snapshots.filter((snapshot) => visibleSectionKeys.has(normalizeText(snapshot.section)));
    const activeSectionLabel = activeSection || "Sin seccion";
    const shouldShowDeductionPanel = Boolean(activeSection && normalizeText(activeSection) !== normalizeText("Direccion general"));
    const group1RateLabel = getGroup1RateLabel(activeSection);
    const usesTeamGroup1Breakdown = sectionCalculation.group1TeamBreakdowns.length > 0;
    const hasNegativeTeamBalance = sectionCalculation.group1TeamBreakdowns.some((team) => team.netMxn < 0);
    const yearOptions = Array.from({ length: 7 }, (_, index) => 2024 + index);
    return (_jsxs("section", { className: "page-stack commissions-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Com" }), _jsx("div", { children: _jsx("h2", { children: "Comisiones" }) })] }), _jsx("p", { className: "muted", children: "Calculo por seccion, deduccion por gastos pagados, receptores editables, estampas historicas y resaltado visual en rojo sobre filas derivadas de registros incompletos." })] }), flash ? _jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text }) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsx("section", { className: "panel", children: _jsxs("div", { className: "commissions-tabs", role: "tablist", "aria-label": "Pestanas de comisiones", children: [_jsx("button", { type: "button", className: `commissions-tab ${activeTab === "calculation" ? "is-active" : ""}`, onClick: () => setActiveTab("calculation"), children: "Calculo de comisiones" }), canReadAllCommissions ? (_jsx("button", { type: "button", className: `commissions-tab ${activeTab === "receivers" ? "is-active" : ""}`, onClick: () => setActiveTab("receivers"), children: "Receptores" })) : null, _jsx("button", { type: "button", className: `commissions-tab ${activeTab === "snapshots" ? "is-active" : ""}`, onClick: () => setActiveTab("snapshots"), children: "Estampas guardadas" })] }) }), activeTab === "calculation" ? (canAccessCalculation ? (_jsxs("div", { className: "commissions-layout", children: [_jsxs("aside", { className: "panel commissions-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Secciones" }), _jsx("span", { children: visibleSections.length })] }), _jsx("div", { className: "commissions-sidebar-list", children: visibleSections.map((section) => (_jsx("button", { type: "button", className: `commissions-sidebar-button ${section === activeSection ? "is-active" : ""}`, onClick: () => setActiveSection(section), children: section }, section))) })] }), _jsxs("div", { className: "commissions-main", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: activeSectionLabel }), _jsxs("span", { children: [MONTH_NAMES[selectedMonth - 1], " ", selectedYear] })] }), _jsxs("div", { className: "commissions-toolbar", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: yearOptions.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthLabel, index) => (_jsx("option", { value: index + 1, children: monthLabel }, monthLabel))) })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadBoard(), children: "Refrescar" }), !isTotalsActiveSection ? (_jsx("button", { className: "primary-button", type: "button", onClick: () => void handleCreateSnapshot(), disabled: savingSnapshot || !canWriteActiveSection, children: savingSnapshot ? "Guardando..." : "Guardar estampa" })) : null] }), _jsxs("div", { className: `commissions-metrics-grid${isTotalsActiveSection ? " is-totals" : ""}`, children: [!isTotalsActiveSection ? (usesTeamGroup1Breakdown ? (_jsx(CommissionTeamBreakdownCards, { teams: sectionCalculation.group1TeamBreakdowns })) : (_jsxs(_Fragment, { children: [_jsx(CurrencyMetricCard, { label: `Comisiones brutas Grupo 1 (${group1RateLabel})`, value: sectionCalculation.group1GrossMxn, accentClass: "is-primary" }), _jsx(CurrencyMetricCard, { label: "Deduccion por gastos", value: sectionCalculation.deductionMxn, accentClass: "is-warning", helper: `${Math.round(sectionCalculation.deductionRate * 100)}% de ${formatCurrency(sectionCalculation.deductionBaseMxn)}` })] }))) : null, _jsx(CurrencyMetricCard, { label: isTotalsActiveSection ? "Comisiones Grupo 1" : `Comisiones netas Grupo 1 (${group1RateLabel})`, value: isTotalsActiveSection ? commissionTotalsSummary.group1PayableMxn : sectionCalculation.group1NetMxn, accentClass: "is-success" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 2 (20%)", value: isTotalsActiveSection ? commissionTotalsSummary.group2TotalMxn : sectionCalculation.group2TotalMxn, accentClass: "is-neutral" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 3 (10%)", value: isTotalsActiveSection ? commissionTotalsSummary.group3TotalMxn : sectionCalculation.group3TotalMxn, accentClass: "is-neutral" }), isTotalsActiveSection ? (_jsx(CurrencyMetricCard, { label: "Total a pagar", value: commissionTotalsSummary.totalCommissionsMxn, accentClass: "is-success" })) : (_jsx(CurrencyMetricCard, { label: "Comisiones totales", value: sectionCalculation.totalCommissionsMxn, accentClass: "is-success", helper: usesTeamGroup1Breakdown && hasNegativeTeamBalance
                                                    ? "Los equipos negativos aportan $0 y no afectan a los equipos positivos"
                                                    : sectionCalculation.group1NetMxn < 0
                                                        ? "El saldo negativo del Grupo 1 no se resta a los grupos 2 y 3"
                                                        : undefined }))] })] }), loadingBoard ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando informacion de comisiones..." }) })) : isTotalsActiveSection ? (_jsx(CommissionTotalsTable, { rows: commissionTotalsRows })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "commissions-group-grid", children: [_jsx(CommissionGroupTable, { title: "PRIMER GRUPO: Comisiones de Ejecucion", toneClass: "tone-primary", rows: sectionCalculation.executionRecords, showExclusionControls: true, canManageExclusions: canManageExclusions, savingExclusionKeys: savingExclusionKeys, year: selectedYear, month: selectedMonth, section: activeSection, onToggleExclusion: handleToggleCommissionExclusion }), _jsx(CommissionGroupTable, { title: "SEGUNDO GRUPO: Comisiones de Cliente (20%)", toneClass: "tone-secondary", rows: sectionCalculation.clientRecords, showExclusionControls: true, canManageExclusions: canManageExclusions, savingExclusionKeys: savingExclusionKeys, year: selectedYear, month: selectedMonth, section: activeSection, onToggleExclusion: handleToggleCommissionExclusion }), _jsx(CommissionGroupTable, { title: "TERCER GRUPO: Comisiones de Cierre (10%)", toneClass: "tone-tertiary", rows: sectionCalculation.closingRecords, showExclusionControls: true, canManageExclusions: canManageExclusions, savingExclusionKeys: savingExclusionKeys, year: selectedYear, month: selectedMonth, section: activeSection, onToggleExclusion: handleToggleCommissionExclusion })] }), shouldShowDeductionPanel ? (_jsxs("section", { className: "panel commissions-deduction-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Deduccion de gastos sobre Grupo 1 (", Math.round(sectionCalculation.deductionRate * 100), "%)"] }), _jsx("span", { children: formatCurrency(sectionCalculation.deductionMxn) })] }), usesTeamGroup1Breakdown ? (_jsx("p", { className: "muted commissions-caption", children: "Para Finanzas y Comunicacion con cliente, el 1% se calcula por equipo. Si el neto de un equipo queda en cero o negativo, ese equipo aporta $0 y no resta a los equipos con saldo positivo." })) : (_jsxs("p", { className: "muted commissions-caption", children: ["El total de gastos atribuibles a tu equipo este mes asciende a", " ", _jsx("strong", { children: formatCurrency(sectionCalculation.deductionBaseMxn) }), ". De dicha suma, el", " ", Math.round(sectionCalculation.deductionRate * 100), "%, que asciende a", " ", _jsx("strong", { children: formatCurrency(sectionCalculation.deductionMxn) }), ", se restara unicamente de las comisiones del Grupo 1. Las comisiones de los grupos 2 y 3 se entregan completas, aunque el Grupo 1 quede con saldo negativo."] })), _jsxs("div", { className: "commissions-deduction-summary", children: [_jsxs("span", { children: ["Comisiones brutas Grupo 1 (", group1RateLabel, "): ", _jsx("strong", { children: formatCurrency(sectionCalculation.group1GrossMxn) })] }), _jsxs("span", { children: ["(-) Deduccion Gastos: ", _jsx("strong", { children: formatCurrency(sectionCalculation.deductionMxn) })] }), _jsxs("span", { children: ["Comisiones netas Grupo 1 (", group1RateLabel, "): ", _jsx("strong", { children: formatCurrency(sectionCalculation.group1NetMxn) })] }), _jsxs("span", { children: ["Grupo 1 aplicado al total: ", _jsx("strong", { children: formatCurrency(sectionCalculation.group1PayableMxn) })] }), _jsxs("span", { children: ["(+) Comisiones Grupo 2 (20%): ", _jsx("strong", { children: formatCurrency(sectionCalculation.group2TotalMxn) })] }), _jsxs("span", { children: ["(+) Comisiones Grupo 3 (10%): ", _jsx("strong", { children: formatCurrency(sectionCalculation.group3TotalMxn) })] }), _jsxs("span", { children: ["Comisiones totales: ", _jsx("strong", { children: formatCurrency(sectionCalculation.totalCommissionsMxn) })] })] })] })) : null] }))] })] })) : (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No tienes asignado un rol de comisiones o no cuentas con permisos para esta pestana." }) }))) : null, activeTab === "receivers" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Receptores de comisiones" }), _jsxs("span", { children: [receivers.length, " registros"] })] }), canWriteCommissions ? (_jsxs("div", { className: "commissions-receiver-form", children: [_jsxs("label", { className: "form-field commissions-receiver-input", children: [_jsx("span", { children: "Nuevo receptor" }), _jsx("input", { type: "text", value: newReceiverName, onChange: (event) => setNewReceiverName(event.target.value), placeholder: "Ej. Juan Perez o un puesto", onKeyDown: (event) => {
                                            if (event.key === "Enter") {
                                                event.preventDefault();
                                                void handleCreateReceiver();
                                            }
                                        } })] }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void handleCreateReceiver(), disabled: savingReceiver || !newReceiverName.trim(), children: savingReceiver ? "Guardando..." : "Agregar receptor" })] })) : null, _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Nombre / Puesto" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: receivers.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 2, children: "No hay receptores registrados." }) })) : (receivers.map((receiver) => (_jsxs("tr", { children: [_jsx("td", { children: editingReceiverId === receiver.id ? (_jsx("input", { value: editingReceiverName, onChange: (event) => setEditingReceiverName(event.target.value), className: "commissions-inline-input", autoFocus: true })) : (receiver.name) }), _jsx("td", { children: _jsx("div", { className: "table-actions", children: !canWriteCommissions ? (_jsx("span", { className: "muted", children: "Solo lectura" })) : editingReceiverId === receiver.id ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "primary-button", type: "button", onClick: () => void handleUpdateReceiver(), disabled: savingReceiver, children: "Guardar" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => {
                                                                    setEditingReceiverId(null);
                                                                    setEditingReceiverName("");
                                                                }, children: "Cancelar" })] })) : (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => {
                                                                    setEditingReceiverId(receiver.id);
                                                                    setEditingReceiverName(receiver.name);
                                                                }, children: "Editar" }), _jsx("button", { className: "danger-button", type: "button", onClick: () => void handleDeleteReceiver(receiver.id), disabled: savingReceiver, children: "Borrar" })] })) }) })] }, receiver.id)))) })] }) })] })) : null, activeTab === "snapshots" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Estampas de comisiones" }), _jsx("span", { children: loadingSnapshots ? "Cargando..." : `${snapshotCards.length} registros` })] }), loadingSnapshots ? _jsx("div", { className: "centered-inline-message", children: "Cargando estampas..." }) : null, !loadingSnapshots ? (_jsx("div", { className: "commissions-snapshot-grid", children: snapshotCards.length === 0 ? (_jsx("article", { className: "commissions-snapshot-card is-empty", children: _jsx("p", { className: "muted", children: "No hay estampas guardadas aun." }) })) : (snapshotCards.map((snapshot) => {
                            const data = snapshot.snapshotData;
                            const totals = data ? getSnapshotCommissionTotals(data) : null;
                            return (_jsxs("article", { className: "commissions-snapshot-card", children: [_jsxs("div", { className: "commissions-snapshot-head", children: [_jsx("strong", { children: snapshot.title }), _jsxs("span", { children: ["ID: ", snapshot.id] })] }), _jsx("div", { className: "commissions-snapshot-total", children: formatCurrency(snapshot.totalNetMxn) }), _jsxs("div", { className: "commissions-snapshot-meta", children: [_jsxs("span", { children: ["Seccion: ", snapshot.section] }), _jsxs("span", { children: ["Periodo: ", MONTH_NAMES[snapshot.month - 1], " ", snapshot.year] }), _jsxs("span", { children: ["Guardado: ", formatDate(snapshot.createdAt)] })] }), data ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "commissions-snapshot-financials", children: [_jsxs("span", { children: ["Grupo 1 bruto: ", _jsx("strong", { children: formatCurrency(totals?.group1GrossMxn ?? 0) })] }), _jsxs("span", { children: ["Deduccion: ", _jsxs("strong", { children: ["-", formatCurrency(data.deductionMxn)] })] }), _jsxs("span", { children: ["Total: ", _jsx("strong", { children: formatCurrency(totals?.totalCommissionsMxn ?? snapshot.totalNetMxn) })] })] }), _jsxs("div", { className: "commissions-snapshot-breakdown", children: [_jsxs("span", { children: [_jsx("strong", { children: formatCurrency(totals?.group1NetMxn ?? 0) }), " Neto Grupo 1 (", data.executionRecords.length, ")"] }), _jsxs("span", { children: [_jsx("strong", { children: formatCurrency(totals?.group2TotalMxn ?? 0) }), " Cliente (", data.clientRecords.length, ")"] }), _jsxs("span", { children: [_jsx("strong", { children: formatCurrency(totals?.group3TotalMxn ?? 0) }), " Cierre (", data.closingRecords.length, ")"] })] })] })) : (_jsxs("div", { className: "commissions-snapshot-breakdown", children: [_jsx("span", { children: "Reg. Finanzas: 0" }), _jsx("span", { children: "Gastos Gral.: 0" }), _jsx("span", { children: "Reg. Manuales: 0" })] })), data ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => setViewingSnapshot(snapshot), children: "Ver detalle" })) : null] }, snapshot.id));
                        })) })) : null] })) : null, viewingSnapshot ? _jsx(SnapshotDetailModal, { snapshot: viewingSnapshot, onClose: () => setViewingSnapshot(null) }) : null] }));
}
