import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { COMMISSION_SECTIONS } from "@sige/contracts";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canWriteModule, hasPermission } from "../auth/permissions";
import { buildCommissionMoneyReceipt, DocumentPreview, downloadPdfDocument, downloadWordDocument, generatedDocumentToHtml } from "../modules/DailyDocumentsPage";
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
    matterCommissions: [],
    matterCommissionsTotalMxn: 0,
    group1TeamBreakdowns: [],
    highlightedCount: 0,
    group1GrossMxn: 0,
    group1NetMxn: 0,
    group1PayableMxn: 0,
    group2TotalMxn: 0,
    group3TotalMxn: 0,
    projectorPayableMxn: 0,
    projectorBonusMxn: 0,
    projectorCommissions: [],
    totalCommissionsMxn: 0,
    grossTotalMxn: 0,
    deductionRate: 0,
    deductionBaseMxn: 0,
    deductionMxn: 0,
    netTotalMxn: 0
};
const CLIENT_RELATIONS_COMMISSION_SECTION = "Comunicacion con cliente";
const SALES_COMMISSION_SECTION = "Ventas";
const SALES_COMMISSION_RATE = 0.01;
const COMMISSION_TOTALS_SECTION = "Totales de comisiones";
const LITIGATION_LEADER_COMMISSION_SECTION = "Litigio (lider)";
const LITIGATION_COLLABORATOR_COMMISSION_SECTION = "Litigio (colaborador)";
const PROJECTOR_COMMISSION_SECTIONS = [
    { role: "Proyectista 1", code: "EKPO", section: "Proyectista 1 (EKPO)" },
    { role: "Proyectista 2", code: "NBSG", section: "Proyectista 2 (NBSG)" }
];
const RUSCONI_COMMISSION_SECTIONS = COMMISSION_SECTIONS.flatMap((section) => normalizeText(section) === normalizeText("Litigio (colaborador)")
    ? [section, ...PROJECTOR_COMMISSION_SECTIONS.map((entry) => entry.section)]
    : [section]);
const LEGALFLOW_COMMISSION_SECTIONS = [
    SALES_COMMISSION_SECTION,
    CLIENT_RELATIONS_COMMISSION_SECTION,
    "Direccion general"
];
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
const MAX_SIGNED_RECEIPT_BYTES = 10 * 1024 * 1024;
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result ?? "");
            const separatorIndex = result.indexOf(",");
            resolve(separatorIndex >= 0 ? result.slice(separatorIndex + 1) : result);
        };
        reader.onerror = () => reject(new Error("No fue posible leer el recibo firmado."));
        reader.readAsDataURL(file);
    });
}
function isPdfFile(file) {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
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
function hasSuperadminAccess(user) {
    return Boolean(user?.permissions?.includes("*") ||
        user?.role === "SUPERADMIN" ||
        user?.legacyRole === "SUPERADMIN");
}
function isEduardoRusconiUser(user) {
    const emailLocalPart = user?.email?.includes("@") ? user.email.slice(0, user.email.indexOf("@")) : user?.email;
    return [user?.shortName, user?.username, user?.displayName, user?.email, emailLocalPart].some((value) => {
        const normalized = normalizeIdentityText(value);
        return normalized === "emrt" || (normalized.includes("eduardo") && normalized.includes("rusconi"));
    });
}
function isRusconiTenant(user) {
    return Boolean(user?.organizationId === "org-rusconi"
        || normalizeText(user?.organizationSlug) === "rusconi-consulting"
        || normalizeText(user?.organizationName) === "rusconi consulting");
}
function isFinanceTeamUser(user) {
    return Boolean(user?.team === "FINANCE"
        || user?.secondaryTeam === "FINANCE"
        || [user?.legacyTeam, user?.secondaryLegacyTeam, user?.specificRole, user?.secondarySpecificRole]
            .some((value) => normalizeText(value) === "finanzas"));
}
function isAraceliLozanoUser(user) {
    const identities = [user?.username, user?.displayName, user?.email].map(normalizeText);
    return isRusconiTenant(user) && isFinanceTeamUser(user) && identities.some((identity) => identity === "araceli lozano"
        || identity === "araceli lozano escamilla"
        || identity.startsWith("araceli.lozano")
        || identity.startsWith("araceli lozano"));
}
function canManageCommissionExclusions(user) {
    const canWriteCommissionExclusions = Boolean(user?.permissions?.includes("commissions:exclusions:write"));
    return canWriteCommissionExclusions || (hasSuperadminAccess(user) && isEduardoRusconiUser(user));
}
function canManageCommissionTotalsReceiverExclusions(user) {
    return hasSuperadminAccess(user) && isEduardoRusconiUser(user);
}
function canManageProjectorCommissions(user) {
    const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
    return !isLegalFlowTenant(user) && isSuperadmin && isEduardoRusconiUser(user);
}
function isLegalFlowTenant(user) {
    return Boolean(user?.organizationId === "org-legalflow" ||
        normalizeText(user?.organizationSlug) === "legalflow" ||
        normalizeText(user?.organizationName) === "legalflow");
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
function buildCommissionTotalsReceiverExclusionKey(input) {
    return [
        input.year,
        input.month,
        normalizeText(input.section)
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
function isSalesCommissionSection(section) {
    return normalizeText(section) === normalizeText(SALES_COMMISSION_SECTION);
}
function getProjectorCommissionSectionForRole(role) {
    return PROJECTOR_COMMISSION_SECTIONS.find((entry) => normalizeText(entry.role) === normalizeText(role))?.section;
}
function isProjectorCommissionSection(section) {
    return PROJECTOR_COMMISSION_SECTIONS.some((entry) => normalizeText(entry.section) === normalizeText(section));
}
function isLitigationLeaderCommissionSection(section) {
    return normalizeText(section) === normalizeText(LITIGATION_LEADER_COMMISSION_SECTION);
}
function isLitigationCollaboratorCommissionSection(section) {
    return normalizeText(section) === normalizeText(LITIGATION_COLLABORATOR_COMMISSION_SECTION);
}
function isCommissionTotalsSection(section) {
    return normalizeText(section) === normalizeText(COMMISSION_TOTALS_SECTION);
}
function getGroup1RateLabel(section) {
    const normalizedSection = normalizeText(section);
    if (isSalesCommissionSection(section)) {
        return "1%";
    }
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
function withSalesCommissionBase(records) {
    return records.map((record) => ({
        ...record,
        baseNetMxn: record.amountMxn / SALES_COMMISSION_RATE
    }));
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
    const projectorPayableMxn = data.projectorPayableMxn ?? 0;
    const projectorBonusMxn = data.projectorBonusMxn ?? 0;
    const matterCommissionsTotalMxn = data.matterCommissionsTotalMxn ?? (data.matterCommissions ?? []).reduce((sum, entry) => sum + (entry.excluded ? 0 : entry.amountMxn), 0);
    const totalCommissionsMxn = data.totalCommissionsMxn ?? data.netTotalMxn ?? (group1PayableMxn +
        group2TotalMxn +
        group3TotalMxn +
        matterCommissionsTotalMxn +
        projectorPayableMxn +
        projectorBonusMxn);
    return {
        group1GrossMxn,
        group1NetMxn,
        group1PayableMxn,
        group2TotalMxn,
        group3TotalMxn,
        projectorPayableMxn,
        projectorBonusMxn,
        matterCommissionsTotalMxn,
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
function formatDateTime(value) {
    if (!value) {
        return "";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }
    return date.toLocaleString("es-MX", {
        dateStyle: "short",
        timeStyle: "short"
    });
}
function isPaymentReceived(method, received) {
    return method === "T" || (method === "E" && received === true);
}
function hasPaymentDate(value) {
    return Boolean(value);
}
function getReceivedPaymentsMxn(record) {
    const payment1Mxn = hasPaymentDate(record.paymentDate1) && isPaymentReceived(record.paymentMethod, record.paymentReceived)
        ? record.paidThisMonthMxn
        : 0;
    const payment2Mxn = hasPaymentDate(record.paymentDate2) && isPaymentReceived(record.paymentMethod2, record.paymentReceived2)
        ? record.payment2Mxn
        : 0;
    const payment3Mxn = hasPaymentDate(record.paymentDate3) && isPaymentReceived(record.paymentMethod3, record.paymentReceived3)
        ? record.payment3Mxn
        : 0;
    return payment1Mxn + payment2Mxn + payment3Mxn;
}
function calculateFinanceStats(record) {
    const totalPaidMxn = getReceivedPaymentsMxn(record);
    const totalExpensesMxn = record.expenseAmount1Mxn + record.expenseAmount2Mxn + record.expenseAmount3Mxn;
    const netFeesMxn = totalPaidMxn - totalExpensesMxn;
    const remainingMxn = record.totalMatterMxn - record.previousPaymentsMxn;
    const dueTodayMxn = record.conceptFeesMxn - totalPaidMxn;
    const futurePaymentsMxn = Math.round((record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn) * 100) / 100;
    const totalNetDueMxn = record.totalMatterMxn - record.previousPaymentsMxn - totalPaidMxn;
    const feeBreakdownDifferenceMxn = Math.round((record.totalMatterMxn - record.previousPaymentsMxn - record.conceptFeesMxn - futurePaymentsMxn) * 100) / 100;
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
    const salesCommissionMxn = record.salesCommissionMxn;
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
            financeCommissionMxn +
            salesCommissionMxn);
    return {
        totalPaidMxn,
        totalExpensesMxn,
        netFeesMxn,
        remainingMxn,
        dueTodayMxn,
        futurePaymentsMxn,
        totalNetDueMxn,
        feeBreakdownDifferenceMxn,
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
        salesCommissionMxn,
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
        case normalizeText(SALES_COMMISSION_SECTION):
            return stats.salesCommissionMxn;
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
function calculateSection(financeRecords, generalExpenses, clients, section, year, month, exclusions, projectorCommissions, matterCommissions) {
    if (!section) {
        return EMPTY_CALCULATION;
    }
    const periodProjectorCommissions = projectorCommissions.filter((entry) => entry.year === year && entry.month === month);
    if (isProjectorCommissionSection(section)) {
        const sectionProjectorCommissions = periodProjectorCommissions.filter((entry) => normalizeText(entry.section) === normalizeText(section));
        const projectorPayableMxn = sectionProjectorCommissions.reduce((sum, entry) => sum + (entry.authorized ? entry.amountMxn : 0), 0);
        return {
            ...EMPTY_CALCULATION,
            projectorPayableMxn,
            projectorCommissions: sectionProjectorCommissions,
            totalCommissionsMxn: projectorPayableMxn,
            grossTotalMxn: projectorPayableMxn,
            netTotalMxn: projectorPayableMxn
        };
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
        const showSalesCommissionBase = isSalesCommissionSection(section);
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
            baseNetMxn: showSalesCommissionBase ? amountMxn / SALES_COMMISSION_RATE : record.netFeesMxn,
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
    const sectionMatterCommissions = isLitigationCollaboratorCommissionSection(section)
        ? matterCommissions
        : [];
    const matterCommissionsTotalMxn = sectionMatterCommissions.reduce((sum, entry) => sum + (entry.excluded ? 0 : entry.amountMxn), 0);
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
    const mirroredProjectorCommissions = isLitigationLeaderCommissionSection(section)
        ? periodProjectorCommissions.filter((entry) => entry.authorized)
        : [];
    const projectorBonusMxn = mirroredProjectorCommissions.reduce((sum, entry) => sum + entry.amountMxn, 0);
    const grossTotalMxn = group1GrossMxn + group2TotalMxn + group3TotalMxn
        + matterCommissionsTotalMxn + projectorBonusMxn;
    const totalCommissionsMxn = group1PayableMxn + group2TotalMxn + group3TotalMxn
        + matterCommissionsTotalMxn + projectorBonusMxn;
    return {
        financeRecords: computedRecords,
        executionRecords,
        clientRecords,
        closingRecords,
        matterCommissions: sectionMatterCommissions,
        matterCommissionsTotalMxn,
        group1TeamBreakdowns,
        highlightedCount: computedRecords.filter((record) => record.highlighted).length,
        group1GrossMxn,
        group1NetMxn,
        group1PayableMxn,
        group2TotalMxn,
        group3TotalMxn,
        projectorPayableMxn: 0,
        projectorBonusMxn,
        projectorCommissions: mirroredProjectorCommissions,
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
    const baseNetLabel = props.baseNetLabel ?? "Base Neta";
    const amountLabel = props.amountLabel ?? (props.showBaseNet ? "Comision" : "Monto");
    return (_jsxs("section", { className: "panel commissions-group-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: props.title }), _jsxs("span", { children: [props.rows.length, " registros"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: `data-table commissions-group-table ${props.toneClass}`, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), props.showBaseNet ? _jsx("th", { children: baseNetLabel }) : null, _jsx("th", { children: amountLabel }), props.showExclusionControls ? _jsx("th", { className: "commissions-exclusion-heading", children: "Excluir gasto" }) : null] }) }), _jsx("tbody", { children: props.rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: totalColumns, children: "Sin comisiones en este rubro." }) })) : (props.rows.map((row) => {
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
                                return (_jsxs("tr", { className: rowClassName, style: row.highlighted ? { backgroundColor: "#fee2e2" } : undefined, title: rowTitle || undefined, children: [_jsx("td", { children: row.clientName || "-" }), _jsx("td", { children: row.subject || "-" }), props.showBaseNet ? (_jsx("td", { children: _jsx("span", { className: row.excluded ? "commissions-amount-excluded" : undefined, children: formatCurrency(row.baseNetMxn) }) })) : null, _jsx("td", { className: "commissions-amount-cell", children: _jsx("span", { className: row.excluded ? "commissions-amount-excluded" : undefined, children: formatCurrency(row.amountMxn) }) }), props.showExclusionControls ? (_jsx("td", { className: "commissions-exclusion-cell", children: _jsx("label", { className: "commissions-exclusion-toggle", title: props.canManageExclusions
                                                    ? "Excluir del calculo de esta seccion"
                                                    : "Solo Eduardo Rusconi o Finanzas puede cambiar esta exclusion", children: _jsx("input", { type: "checkbox", checked: Boolean(row.excluded), disabled: !props.canManageExclusions || savingExclusion, "aria-label": `Excluir ${row.clientName || "registro"} del calculo de esta seccion`, onChange: (event) => props.onToggleExclusion?.(row, event.target.checked) }) }) })) : null] }, `${row.group}-${row.financeRecordId}`));
                            })) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: totalLabelColumns, children: "Total rubro" }), _jsx("td", { children: formatCurrency(total) }), props.showExclusionControls ? _jsx("td", { className: "commissions-exclusion-cell", "aria-label": "Excluir gasto" }) : null] }) })] }) })] }));
}
function CommissionMatterTable(props) {
    const totalMxn = props.rows.reduce((sum, entry) => sum + (entry.excluded ? 0 : entry.amountMxn), 0);
    return (_jsxs("section", { className: "panel commissions-matter-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "COMISIONES POR ASUNTO: Litigio (colaborador)" }), _jsxs("span", { children: [props.rows.length, " asuntos vigentes"] })] }), _jsx("p", { className: "muted commissions-caption", children: "Cada asunto vigente genera $100 mensuales. Las exclusiones que marque EMRT aplican desde el mes seleccionado y permanecen en los meses siguientes hasta que se reviertan." }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table commissions-matter-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. asunto" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Registrado en Litigio" }), _jsx("th", { children: "Monto" }), _jsx("th", { className: "commissions-exclusion-heading", children: "Excluir comision" })] }) }), _jsx("tbody", { children: props.rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, children: "No hay asuntos de Litigio vigentes para este mes." }) })) : props.rows.map((entry) => {
                                const saving = props.savingMatterIds?.has(entry.matterId) ?? false;
                                return (_jsxs("tr", { className: entry.excluded ? "commissions-row-excluded" : undefined, children: [_jsxs("td", { children: [_jsx("strong", { children: entry.clientName || "-" }), entry.clientNumber ? _jsx("small", { children: entry.clientNumber }) : null] }), _jsx("td", { children: entry.matterNumber || "-" }), _jsx("td", { children: entry.subject || "-" }), _jsx("td", { children: formatDate(entry.registeredAt) }), _jsx("td", { className: "commissions-amount-cell", children: _jsx("span", { className: entry.excluded ? "commissions-amount-excluded" : undefined, children: formatCurrency(entry.amountMxn) }) }), _jsx("td", { className: "commissions-exclusion-cell", children: _jsx("label", { className: "commissions-exclusion-toggle", title: props.canManageExclusions
                                                    ? "Excluir esta comision desde el mes seleccionado"
                                                    : "Solo EMRT puede cambiar esta exclusion", children: _jsx("input", { "aria-label": `Excluir comision del asunto ${entry.matterNumber || entry.subject}`, checked: entry.excluded, disabled: !props.canManageExclusions || saving, onChange: (event) => props.onToggleExclusion?.(entry, event.target.checked), type: "checkbox" }) }) })] }, entry.matterId));
                            }) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: 4, children: "Total comisiones por asunto" }), _jsx("td", { children: formatCurrency(totalMxn) }), _jsx("td", { className: "commissions-exclusion-cell", "aria-label": "Excluir comision" })] }) })] }) })] }));
}
function ProjectorCommissionTable(props) {
    const isProjectorView = props.mode === "projector";
    const totalAuthorizedMxn = props.rows.reduce((sum, entry) => sum + (entry.authorized ? entry.amountMxn : 0), 0);
    const totalColumns = 5;
    const totalLabelColumns = isProjectorView ? 3 : 4;
    return (_jsxs("section", { className: "panel commissions-group-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: props.title }), _jsxs("span", { children: [props.rows.length, " registros"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table commissions-group-table commissions-projector-table tone-primary", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), !isProjectorView ? _jsx("th", { children: "Proyectista" }) : null, _jsx("th", { children: "Fecha terminada" }), _jsx("th", { children: "Monto (MXN)" }), isProjectorView ? _jsx("th", { className: "commissions-projector-authorization-heading", children: "Autorizar pago" }) : null] }) }), _jsx("tbody", { children: props.rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: totalColumns, children: "No hay escritos terminados en este periodo." }) })) : (props.rows.map((entry) => {
                                const saving = props.savingIds?.has(entry.id) ?? false;
                                const amountDraft = props.amountDrafts?.[entry.id] ?? entry.amountMxn.toFixed(2);
                                return (_jsxs("tr", { className: !entry.authorized ? "commissions-row-pending-authorization" : undefined, title: !entry.authorized ? "Pendiente de autorización; no forma parte del total." : "Comisión autorizada.", children: [_jsx("td", { children: entry.clientName || "-" }), _jsx("td", { children: entry.subject || "-" }), !isProjectorView ? (_jsxs("td", { children: [entry.projectorName, " (", entry.responsibleCode, ")"] })) : null, _jsx("td", { children: formatDate(entry.completedAt) }), _jsx("td", { className: "commissions-projector-amount-cell", children: isProjectorView && props.canManage ? (_jsxs("div", { className: "commissions-projector-amount-control", children: [_jsx("span", { className: "commissions-projector-currency-symbol", "aria-hidden": "true", children: "$" }), _jsx("input", { className: "commissions-projector-amount-input", type: "number", min: "0", step: "50", value: amountDraft, disabled: saving, "aria-label": `Monto en pesos mexicanos de la comisión para ${entry.subject || entry.clientName}`, onChange: (event) => props.onAmountDraftChange?.(entry.id, event.target.value), onBlur: () => props.onCommitAmount?.(entry), onKeyDown: (event) => {
                                                            if (event.key === "Enter") {
                                                                event.currentTarget.blur();
                                                            }
                                                        } }), _jsx("span", { className: "commissions-projector-currency-code", children: "MXN" })] })) : (_jsx("span", { children: formatCurrency(entry.amountMxn) })) }), isProjectorView ? (_jsx("td", { className: "commissions-projector-authorization-cell", children: _jsx("label", { className: "commissions-projector-authorization-toggle", title: props.canManage ? "Autorizar el pago de esta comisión" : "Solo Eduardo Rusconi puede autorizar este pago", children: _jsx("input", { type: "checkbox", checked: entry.authorized, disabled: !props.canManage || saving, "aria-label": `Autorizar comisión de ${entry.projectorName} por ${entry.subject || entry.clientName}`, onChange: (event) => props.onToggleAuthorization?.(entry, event.target.checked) }) }) })) : null] }, entry.id));
                            })) }), _jsx("tfoot", { children: _jsxs("tr", { children: [_jsx("td", { colSpan: totalLabelColumns, children: "Total autorizado" }), _jsx("td", { children: formatCurrency(totalAuthorizedMxn) }), isProjectorView ? _jsx("td", { className: "commissions-projector-authorization-cell", "aria-label": "Autorizar pago" }) : null] }) })] }) })] }));
}
function CommissionTotalsTable(props) {
    const isReceiverExcluded = (section) => props.excludedReceiverKeys.has(buildCommissionTotalsReceiverExclusionKey({
        year: props.year,
        month: props.month,
        section
    }));
    const totalCommissionsMxn = props.rows.reduce((sum, row) => sum + (isReceiverExcluded(row.section) ? 0 : row.calculation.totalCommissionsMxn), 0);
    const pendingCommissionsMxn = props.rows.reduce((sum, row) => {
        if (isReceiverExcluded(row.section)) {
            return sum;
        }
        const acknowledgement = props.acknowledgementsBySection.get(normalizeText(row.section));
        return acknowledgement?.paidByTransfer || acknowledgement?.receivedByEmrt
            ? sum
            : sum + row.calculation.totalCommissionsMxn;
    }, 0);
    return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Comisiones a pagar por receptor" }), _jsxs("span", { children: [props.rows.length, " secciones"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table commissions-totals-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Receptor" }), _jsx("th", { children: "Comision a pagar" })] }) }), _jsx("tbody", { children: props.rows.map((row) => {
                                const excluded = isReceiverExcluded(row.section);
                                const acknowledgement = props.acknowledgementsBySection.get(normalizeText(row.section));
                                const recipientAssignment = props.recipientAssignmentsBySection.get(normalizeText(row.section));
                                const recipientName = recipientAssignment?.recipientName;
                                const releaseEligibility = recipientAssignment?.userId
                                    ? props.releaseEligibilityByUserId.get(recipientAssignment.userId)
                                    : undefined;
                                const paymentBlocked = Boolean(releaseEligibility?.blocked);
                                const amountMxn = row.calculation.totalCommissionsMxn;
                                const eligible = !excluded && amountMxn > 0;
                                const saving = props.savingSections.has(normalizeText(row.section));
                                const uploadingSignedReceipt = props.uploadingSignedReceiptSections.has(normalizeText(row.section));
                                const paidByTransfer = Boolean(acknowledgement?.paidByTransfer);
                                const araceliLocked = paidByTransfer || Boolean(acknowledgement?.receivedByEmrt);
                                const hasSignedReceipt = Boolean(acknowledgement?.signedReceiptUploadedAt && acknowledgement.signedReceiptFileName);
                                const missingSignedReceipt = Boolean(acknowledgement?.receivedByEmrt && !hasSignedReceipt);
                                const rowClassName = [
                                    excluded ? "commissions-row-excluded" : "",
                                    missingSignedReceipt ? "commissions-row-missing-signed-receipt" : ""
                                ].filter(Boolean).join(" ") || undefined;
                                return (_jsxs("tr", { className: rowClassName, children: [_jsx("td", { children: _jsxs("div", { className: "commissions-total-receiver-cell", children: [props.canManageReceiverExclusions ? (_jsx("label", { className: "commissions-total-exclusion-toggle", title: excluded ? "Incluir receptor en el Total general" : "Excluir receptor del Total general", children: _jsx("input", { "aria-label": `${excluded ? "Incluir" : "Excluir"} ${row.section} del Total general`, checked: excluded, disabled: props.periodLocked || saving, onChange: (event) => props.onToggleReceiverExclusion(row.section, event.target.checked), type: "checkbox" }) })) : null, _jsxs("span", { className: `commissions-total-receiver-identity${excluded ? " commissions-amount-excluded" : ""}`, children: [_jsx("strong", { children: recipientName ?? row.section }), recipientName && normalizeText(recipientName) !== normalizeText(row.section) ? (_jsx("small", { children: row.section })) : null, !recipientName ? _jsx("small", { children: "Titular activo no asignado" }) : null] })] }) }), _jsx("td", { className: "commissions-total-strong", children: _jsxs("div", { className: "commissions-payment-flow", children: [_jsx("span", { className: excluded ? "commissions-amount-excluded" : undefined, children: formatCurrency(amountMxn) }), _jsxs("div", { className: "commissions-payment-flow-controls", children: [_jsxs("label", { className: !eligible || paymentBlocked || !props.canMarkPaidByTransfer || props.periodLocked ? "is-disabled" : undefined, children: [_jsx("input", { type: "checkbox", checked: paidByTransfer, disabled: !acknowledgement
                                                                            || !eligible
                                                                            || (paymentBlocked && !paidByTransfer)
                                                                            || !props.canMarkPaidByTransfer
                                                                            || props.periodLocked
                                                                            || saving, onChange: (event) => props.onTogglePaidByTransfer(row.section, event.target.checked) }), _jsx("span", { children: "Pagado mediante transferencia" })] }), _jsxs("label", { className: !eligible || !props.canConfirmAsAraceli || araceliLocked ? "is-disabled" : undefined, children: [_jsx("input", { type: "checkbox", checked: Boolean(acknowledgement?.receivedByAraceli), disabled: !acknowledgement
                                                                            || !eligible
                                                                            || !props.canConfirmAsAraceli
                                                                            || araceliLocked
                                                                            || saving, onChange: (event) => props.onToggleReceivedByAraceli(row.section, event.target.checked) }), _jsx("span", { children: "Recibido por Araceli Lozano" })] }), _jsxs("label", { className: !eligible || paymentBlocked || !props.canConfirmAsEmrt || !acknowledgement?.receivedByAraceli ? "is-disabled" : undefined, children: [_jsx("input", { type: "checkbox", checked: Boolean(acknowledgement?.receivedByEmrt), disabled: !acknowledgement
                                                                            || !eligible
                                                                            || (paymentBlocked && !acknowledgement.receivedByEmrt)
                                                                            || !props.canConfirmAsEmrt
                                                                            || !acknowledgement.receivedByAraceli
                                                                            || paidByTransfer
                                                                            || saving, onChange: (event) => props.onToggleReceivedByEmrt(row.section, event.target.checked) }), _jsx("span", { children: "Pagado por EMRT" })] })] }), releaseEligibility?.blocked ? (_jsxs("section", { className: "commissions-kpi-payment-block", role: "alert", children: [_jsx("strong", { children: "Pago retenido" }), _jsx("span", { children: "Estas comisiones no pueden pagarse hasta reparar los pendientes aplicables a este mes." }), _jsx("ul", { children: releaseEligibility.requirements.map((requirement) => (_jsxs("li", { children: [_jsx("strong", { children: requirement.metricLabel }), _jsxs("span", { children: [requirement.pendingAmount, " ", requirement.unit, requirement.oldestOriginDate ? `; pendiente desde ${requirement.oldestOriginDate}` : ""] }), _jsx("div", { className: "commissions-kpi-payment-requirements", children: requirement.requirements.map((item) => (_jsxs("small", { children: [item.summary, " (", item.originDate, ")"] }, item.obligationId))) })] }, requirement.metricId))) }), releaseEligibility.auditAlert ? (_jsx("span", { className: "commissions-kpi-payment-audit", children: "Alerta de auditoria: el pago ya estaba registrado cuando se detecto este incumplimiento retroactivo. No se revirtio." })) : null] })) : null, _jsx("button", { className: "secondary-button commissions-generate-receipt-button", disabled: !eligible || !props.canGenerateReceipts || !recipientName, onClick: () => recipientName && props.onGenerateReceipt(row, recipientName), title: !recipientName ? "Asigna un titular activo a este cargo para generar el recibo" : undefined, type: "button", children: "Generar recibo" }), _jsxs("div", { className: "commissions-signed-receipt-controls", children: [_jsxs("label", { className: `secondary-button commissions-signed-receipt-upload${!eligible || !props.canManageSignedReceipts || uploadingSignedReceipt ? " is-disabled" : ""}`, children: [_jsx("input", { accept: ".pdf,application/pdf", "aria-label": `${hasSignedReceipt ? "Reemplazar" : "Cargar"} recibo firmado de ${recipientName ?? row.section}`, disabled: !acknowledgement || !eligible || !props.canManageSignedReceipts || uploadingSignedReceipt, onChange: (event) => {
                                                                            const file = event.currentTarget.files?.[0];
                                                                            event.currentTarget.value = "";
                                                                            if (file) {
                                                                                props.onUploadSignedReceipt(row.section, file);
                                                                            }
                                                                        }, type: "file" }), _jsx("span", { children: uploadingSignedReceipt
                                                                            ? "Cargando PDF..."
                                                                            : hasSignedReceipt
                                                                                ? "Reemplazar recibo firmado"
                                                                                : "Cargar recibo firmado" })] }), hasSignedReceipt && acknowledgement ? (_jsx("button", { className: "secondary-button commissions-signed-receipt-open", onClick: () => props.onOpenSignedReceipt(acknowledgement), type: "button", children: "Ver recibo firmado" })) : null] }), hasSignedReceipt && acknowledgement ? (_jsxs("div", { className: "commissions-signed-receipt-meta", children: [_jsx("span", { children: acknowledgement.signedReceiptFileName }), acknowledgement.signedReceiptSizeBytes ? (_jsx("span", { children: formatFileSize(acknowledgement.signedReceiptSizeBytes) })) : null, acknowledgement.signedReceiptUploadedAt ? (_jsxs("span", { children: ["Cargado: ", formatDateTime(acknowledgement.signedReceiptUploadedAt)] })) : null] })) : null, missingSignedReceipt ? (_jsx("div", { className: "commissions-signed-receipt-alert", role: "alert", children: "Falta cargar el recibo firmado en PDF." })) : null, acknowledgement ? (_jsxs("div", { className: "commissions-payment-flow-meta", children: [acknowledgement.receivedByAraceliAt ? (_jsxs("span", { children: ["Araceli: ", formatDateTime(acknowledgement.receivedByAraceliAt)] })) : null, acknowledgement.receivedByEmrtAt ? (_jsxs("span", { children: ["Pagado por EMRT: ", formatDateTime(acknowledgement.receivedByEmrtAt)] })) : null, acknowledgement.reopenedAt ? (_jsxs("span", { children: ["Reabierto: ", formatDateTime(acknowledgement.reopenedAt), acknowledgement.reopenedByName ? ` por ${acknowledgement.reopenedByName}` : ""] })) : null] })) : null, !eligible ? (_jsx("small", { children: excluded ? "Receptor excluido del pago" : "Sin monto por confirmar" })) : null] }) })] }, row.section));
                            }) }), _jsxs("tfoot", { children: [_jsxs("tr", { children: [_jsx("td", { children: "Total general" }), _jsx("td", { children: formatCurrency(totalCommissionsMxn) })] }), _jsxs("tr", { children: [_jsx("td", { children: "Total pendiente de pago" }), _jsx("td", { children: formatCurrency(pendingCommissionsMxn) })] })] })] }) })] }));
}
function CommissionReceiptModal(props) {
    const [busyAction, setBusyAction] = useState(null);
    const [status, setStatus] = useState("");
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                props.onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [props.onClose]);
    async function downloadWord() {
        setBusyAction("word");
        setStatus("Generando Word...");
        try {
            await downloadWordDocument(props.draft.document, props.draft.filenameBase);
            setStatus("Word descargado.");
        }
        catch {
            setStatus("No se pudo generar el archivo Word.");
        }
        finally {
            setBusyAction(null);
        }
    }
    async function downloadPdf() {
        setBusyAction("pdf");
        setStatus("Generando PDF...");
        try {
            await downloadPdfDocument(props.draft.document, props.draft.filenameBase);
            setStatus("PDF descargado.");
        }
        catch {
            setStatus("No se pudo generar el archivo PDF.");
        }
        finally {
            setBusyAction(null);
        }
    }
    function printReceipt() {
        const popup = window.open("", "_blank");
        if (!popup) {
            setStatus("No se pudo abrir la vista de impresion.");
            return;
        }
        popup.document.write(generatedDocumentToHtml(props.draft.document));
        popup.document.close();
        popup.focus();
        popup.print();
    }
    return (_jsx("div", { className: "commissions-modal-backdrop", onClick: props.onClose, children: _jsxs("div", { "aria-labelledby": "commission-receipt-modal-title", "aria-modal": "true", className: "commissions-modal commissions-receipt-modal", onClick: (event) => event.stopPropagation(), role: "dialog", children: [_jsxs("div", { className: "commissions-modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "commission-receipt-modal-title", children: "Recibo de comisiones" }), _jsxs("p", { className: "muted", children: [props.draft.recipientName, " | ", props.draft.section, " | ", props.draft.periodLabel, " | ", formatCurrency(props.draft.amountMxn)] })] }), _jsxs("div", { className: "commissions-receipt-actions", children: [_jsx("button", { className: "secondary-button", disabled: busyAction !== null, onClick: () => void downloadWord(), type: "button", children: busyAction === "word" ? "Generando..." : "Word" }), _jsx("button", { className: "secondary-button", disabled: busyAction !== null, onClick: () => void downloadPdf(), type: "button", children: busyAction === "pdf" ? "Generando..." : "PDF" }), _jsx("button", { className: "secondary-button", disabled: busyAction !== null, onClick: printReceipt, type: "button", children: "Imprimir" }), _jsx("button", { className: "secondary-button", onClick: props.onClose, type: "button", children: "Cerrar" })] })] }), _jsxs("div", { className: "commissions-modal-body commissions-receipt-modal-body", children: [status ? _jsx("p", { className: "muted commissions-receipt-status", children: status }) : null, _jsx("div", { className: "daily-doc-preview-viewport commissions-receipt-preview", children: _jsx(DocumentPreview, { document: props.draft.document }) })] })] }) }));
}
function SnapshotDetailModal(props) {
    const data = props.snapshot.snapshotData;
    const totals = data ? getSnapshotCommissionTotals(data) : null;
    const snapshotGroup1RateLabel = getGroup1RateLabel(props.snapshot.section);
    const snapshotUsesTeamBreakdown = Boolean(totals?.group1TeamBreakdowns.length);
    const snapshotIsSalesSection = isSalesCommissionSection(props.snapshot.section);
    const snapshotIsProjectorSection = isProjectorCommissionSection(props.snapshot.section);
    const snapshotIsLitigationLeaderSection = isLitigationLeaderCommissionSection(props.snapshot.section);
    const snapshotIsLitigationCollaboratorSection = isLitigationCollaboratorCommissionSection(props.snapshot.section);
    const snapshotProjectorCommissions = data?.projectorCommissions ?? [];
    const snapshotProjectorPendingMxn = snapshotProjectorCommissions.reduce((sum, entry) => sum + (entry.authorized ? 0 : entry.amountMxn), 0);
    const snapshotExecutionRecords = snapshotIsSalesSection
        ? withSalesCommissionBase(data?.executionRecords ?? [])
        : data?.executionRecords ?? [];
    return (_jsx("div", { className: "commissions-modal-backdrop", onClick: props.onClose, children: _jsxs("div", { className: "commissions-modal", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "commissions-modal-header", children: [_jsxs("div", { children: [_jsx("h2", { children: props.snapshot.title }), _jsxs("p", { className: "muted", children: [props.snapshot.section, " | ", MONTH_NAMES[props.snapshot.month - 1], " ", props.snapshot.year] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: props.onClose, children: "Cerrar" })] }), !data ? (_jsx("div", { className: "commissions-modal-body", children: _jsx("p", { className: "muted", children: "No hay detalle disponible para esta estampa." }) })) : (_jsxs("div", { className: "commissions-modal-body", children: [_jsx("div", { className: "commissions-metrics-grid", children: snapshotIsProjectorSection ? (_jsxs(_Fragment, { children: [_jsx(CurrencyMetricCard, { label: "Comisiones pendientes de autorizar", value: snapshotProjectorPendingMxn, accentClass: "is-warning" }), _jsx(CurrencyMetricCard, { label: "Comisiones autorizadas", value: totals?.projectorPayableMxn ?? 0, accentClass: "is-primary" }), _jsx(CurrencyMetricCard, { label: "Comisiones totales", value: totals?.totalCommissionsMxn ?? 0, accentClass: "is-success" })] })) : (_jsxs(_Fragment, { children: [snapshotUsesTeamBreakdown ? (_jsx(CommissionTeamBreakdownCards, { teams: totals?.group1TeamBreakdowns ?? [] })) : (_jsxs(_Fragment, { children: [_jsx(CurrencyMetricCard, { label: `Comisiones brutas Grupo 1 (${snapshotGroup1RateLabel})`, value: totals?.group1GrossMxn ?? 0, accentClass: "is-primary" }), _jsx(CurrencyMetricCard, { label: "Deducci\u00F3n por gastos", value: data.deductionMxn, accentClass: "is-warning", helper: `${Math.round(data.deductionRate * 100)}% de ${formatCurrency(data.deductionBaseMxn)}` })] })), _jsx(CurrencyMetricCard, { label: `Comisiones netas Grupo 1 (${snapshotGroup1RateLabel})`, value: totals?.group1NetMxn ?? 0, accentClass: "is-success" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 2 (20%)", value: totals?.group2TotalMxn ?? 0, accentClass: "is-neutral" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 3 (10%)", value: totals?.group3TotalMxn ?? 0, accentClass: "is-neutral" }), snapshotIsLitigationCollaboratorSection ? (_jsx(CurrencyMetricCard, { label: "Comisiones por asunto", value: totals?.matterCommissionsTotalMxn ?? 0, accentClass: "is-primary" })) : null, snapshotIsLitigationLeaderSection ? (_jsx(CurrencyMetricCard, { label: "Comisiones espejo de proyectistas", value: totals?.projectorBonusMxn ?? 0, accentClass: "is-primary" })) : null, _jsx(CurrencyMetricCard, { label: "Comisiones totales", value: totals?.totalCommissionsMxn ?? 0, accentClass: "is-success" })] })) }), snapshotIsProjectorSection ? (_jsx(ProjectorCommissionTable, { title: `Comisiones por escritos de fondo - ${props.snapshot.section}`, rows: snapshotProjectorCommissions, mode: "projector" })) : (_jsxs(_Fragment, { children: [_jsx(CommissionGroupTable, { title: "1. Comision por ejecucion", toneClass: "tone-primary", rows: snapshotExecutionRecords, showBaseNet: true, baseNetLabel: snapshotIsSalesSection ? "Primer pago recibido" : undefined, amountLabel: snapshotIsSalesSection ? "1%" : undefined }), _jsx(CommissionGroupTable, { title: "2. Comision por cliente", toneClass: "tone-secondary", rows: data.clientRecords, showBaseNet: true }), _jsx(CommissionGroupTable, { title: "3. Comision por cierre", toneClass: "tone-tertiary", rows: data.closingRecords, showBaseNet: true }), snapshotIsLitigationCollaboratorSection ? (_jsx(CommissionMatterTable, { rows: data.matterCommissions ?? [] })) : null, snapshotIsLitigationLeaderSection ? (_jsx(ProjectorCommissionTable, { title: "COMISIONES ESPEJO: Escritos de fondo autorizados", rows: snapshotProjectorCommissions, mode: "leader-mirror" })) : null] }))] }))] }) }));
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
    const [recipientAssignments, setRecipientAssignments] = useState([]);
    const [clients, setClients] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [exclusions, setExclusions] = useState([]);
    const [matterCommissions, setMatterCommissions] = useState([]);
    const [projectorCommissions, setProjectorCommissions] = useState([]);
    const [paymentAcknowledgements, setPaymentAcknowledgements] = useState([]);
    const [commissionReleaseEligibilities, setCommissionReleaseEligibilities] = useState([]);
    const [periodLocked, setPeriodLocked] = useState(false);
    const [confirmedByEmrtCount, setConfirmedByEmrtCount] = useState(0);
    const [savingExclusionKeys, setSavingExclusionKeys] = useState(new Set());
    const [savingMatterExclusionIds, setSavingMatterExclusionIds] = useState(new Set());
    const [savingProjectorCommissionIds, setSavingProjectorCommissionIds] = useState(new Set());
    const [savingPaymentSections, setSavingPaymentSections] = useState(new Set());
    const [uploadingSignedReceiptSections, setUploadingSignedReceiptSections] = useState(new Set());
    const [projectorAmountDrafts, setProjectorAmountDrafts] = useState({});
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
    const [commissionReceiptDraft, setCommissionReceiptDraft] = useState(null);
    const canWriteCommissions = canWriteModule(user, "commissions");
    const canReadAllCommissions = canWriteCommissions || hasPermission(user, "commissions:all:read");
    const canWriteClientRelationsCommissions = hasPermission(user, "commissions:client-relations:write");
    const canWriteOwnCommissionSection = hasPermission(user, "commissions:own-section:write");
    const canReadClients = hasPermission(user, "clients:read");
    const canManageExclusions = canManageCommissionExclusions(user);
    const canManageTotalsReceiverExclusions = canManageCommissionTotalsReceiverExclusions(user);
    const canManageProjectorEntries = canManageProjectorCommissions(user);
    const canManageMatterExclusions = canManageProjectorCommissions(user);
    const canMarkPaymentsByTransfer = isRusconiTenant(user) && (isFinanceTeamUser(user) || (hasSuperadminAccess(user) && isEduardoRusconiUser(user)));
    const canConfirmPaymentsAsAraceli = isAraceliLozanoUser(user);
    const canConfirmPaymentsAsEmrt = isRusconiTenant(user) && hasSuperadminAccess(user) && isEduardoRusconiUser(user);
    const isLegalFlow = isLegalFlowTenant(user);
    const availableCommissionSections = useMemo(() => isLegalFlow ? [...LEGALFLOW_COMMISSION_SECTIONS] : [...RUSCONI_COMMISSION_SECTIONS], [isLegalFlow]);
    const visibleSections = useMemo(() => {
        const userRole = normalizeText(user?.specificRole);
        const projectorRoleSection = getProjectorCommissionSectionForRole(user?.specificRole);
        if (canReadAllCommissions || user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN") {
            return isLegalFlow ? availableCommissionSections : [...availableCommissionSections, COMMISSION_TOTALS_SECTION];
        }
        if (canWriteClientRelationsCommissions) {
            return availableCommissionSections.filter((section) => normalizeText(section) === normalizeText(CLIENT_RELATIONS_COMMISSION_SECTION));
        }
        return availableCommissionSections.filter((section) => normalizeText(section) === normalizeText(projectorRoleSection ?? userRole));
    }, [
        availableCommissionSections,
        canReadAllCommissions,
        canWriteClientRelationsCommissions,
        isLegalFlow,
        user?.legacyRole,
        user?.role,
        user?.specificRole
    ]);
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
            setRecipientAssignments(overview.recipientAssignments ?? []);
            setExclusions(overview.exclusions ?? []);
            setMatterCommissions(overview.matterCommissions ?? []);
            setProjectorCommissions(overview.projectorCommissions ?? []);
            setPaymentAcknowledgements(overview.paymentAcknowledgements ?? []);
            setCommissionReleaseEligibilities(overview.commissionReleaseEligibilities ?? []);
            setPeriodLocked(Boolean(overview.periodLocked));
            setConfirmedByEmrtCount((overview.paymentAcknowledgements ?? []).filter((entry) => entry.receivedByEmrt).length);
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
    const sectionCalculation = useMemo(() => calculateSection(financeRecords, generalExpenses, clients, activeSection, selectedYear, selectedMonth, exclusions, projectorCommissions, matterCommissions), [
        activeSection,
        clients,
        exclusions,
        financeRecords,
        generalExpenses,
        matterCommissions,
        projectorCommissions,
        selectedMonth,
        selectedYear
    ]);
    const commissionTotalsRows = useMemo(() => {
        if (!isTotalsActiveSection) {
            return [];
        }
        return availableCommissionSections
            .filter((section) => normalizeText(section) !== normalizeText("Direccion general"))
            .map((section) => ({
            section,
            calculation: calculateSection(financeRecords, generalExpenses, clients, section, selectedYear, selectedMonth, exclusions, projectorCommissions, matterCommissions)
        }));
    }, [
        availableCommissionSections,
        clients,
        exclusions,
        financeRecords,
        generalExpenses,
        isTotalsActiveSection,
        matterCommissions,
        projectorCommissions,
        selectedMonth,
        selectedYear
    ]);
    const paymentAcknowledgementsBySection = useMemo(() => new Map(paymentAcknowledgements.map((entry) => [normalizeText(entry.section), entry])), [paymentAcknowledgements]);
    const recipientAssignmentsBySection = useMemo(() => new Map(recipientAssignments.map((entry) => [normalizeText(entry.section), entry])), [recipientAssignments]);
    const releaseEligibilityByUserId = useMemo(() => new Map(commissionReleaseEligibilities.map((entry) => [entry.userId, entry])), [commissionReleaseEligibilities]);
    const effectiveExcludedTotalsReceiverKeys = useMemo(() => new Set(paymentAcknowledgements
        .filter((entry) => entry.excluded)
        .map((entry) => buildCommissionTotalsReceiverExclusionKey({
        year: entry.year,
        month: entry.month,
        section: entry.section
    }))), [paymentAcknowledgements]);
    const includedCommissionTotalsRows = useMemo(() => commissionTotalsRows.filter((row) => !effectiveExcludedTotalsReceiverKeys.has(buildCommissionTotalsReceiverExclusionKey({
        year: selectedYear,
        month: selectedMonth,
        section: row.section
    }))), [commissionTotalsRows, effectiveExcludedTotalsReceiverKeys, selectedMonth, selectedYear]);
    const commissionTotalsSummary = useMemo(() => includedCommissionTotalsRows.reduce((acc, row) => ({
        group1PayableMxn: acc.group1PayableMxn + row.calculation.group1PayableMxn,
        group2TotalMxn: acc.group2TotalMxn + row.calculation.group2TotalMxn,
        group3TotalMxn: acc.group3TotalMxn + row.calculation.group3TotalMxn,
        projectorPayableMxn: acc.projectorPayableMxn + row.calculation.projectorPayableMxn,
        projectorBonusMxn: acc.projectorBonusMxn + row.calculation.projectorBonusMxn,
        totalCommissionsMxn: acc.totalCommissionsMxn + row.calculation.totalCommissionsMxn
    }), {
        group1PayableMxn: 0,
        group2TotalMxn: 0,
        group3TotalMxn: 0,
        projectorPayableMxn: 0,
        projectorBonusMxn: 0,
        totalCommissionsMxn: 0
    }), [includedCommissionTotalsRows]);
    const paymentReconcileSignature = useMemo(() => commissionTotalsRows
        .map((row) => `${normalizeText(row.section)}:${row.calculation.totalCommissionsMxn.toFixed(2)}`)
        .join("|"), [commissionTotalsRows]);
    useEffect(() => {
        if (!isTotalsActiveSection || isLegalFlow || loadingBoard || commissionTotalsRows.length === 0) {
            return;
        }
        let cancelled = false;
        void apiPost("/commissions/payment-acknowledgements/reconcile", {
            year: selectedYear,
            month: selectedMonth,
            rows: commissionTotalsRows.map((row) => ({
                section: row.section,
                amountMxn: row.calculation.totalCommissionsMxn
            }))
        })
            .then((state) => {
            if (!cancelled) {
                setPaymentAcknowledgements(state.acknowledgements);
                setPeriodLocked(state.locked);
                setConfirmedByEmrtCount(state.confirmedByEmrtCount);
            }
        })
            .catch((error) => {
            if (!cancelled) {
                setFlash({ tone: "error", text: getErrorMessage(error) });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [
        commissionTotalsRows,
        isLegalFlow,
        isTotalsActiveSection,
        loadingBoard,
        paymentReconcileSignature,
        selectedMonth,
        selectedYear
    ]);
    async function updatePaymentAcknowledgement(section, payload) {
        const savingKey = normalizeText(section);
        setSavingPaymentSections((current) => new Set(current).add(savingKey));
        setFlash(null);
        try {
            const state = await apiPatch("/commissions/payment-acknowledgements", {
                year: selectedYear,
                month: selectedMonth,
                section,
                ...payload
            });
            setPaymentAcknowledgements(state.acknowledgements);
            setPeriodLocked(state.locked);
            setConfirmedByEmrtCount(state.confirmedByEmrtCount);
            setFlash({
                tone: "success",
                text: payload.paidByTransfer !== undefined
                    ? payload.paidByTransfer
                        ? "Pago mediante transferencia registrado. Las confirmaciones de recepcion quedaron deshabilitadas."
                        : "Pago mediante transferencia desmarcado. Las confirmaciones de recepcion volvieron a estar disponibles."
                    : payload.receivedByEmrt === false
                        ? state.locked
                            ? "Pago por EMRT reabierto. El periodo sigue bloqueado por otros pagos de EMRT."
                            : "Todos los pagos por EMRT fueron reabiertos; Finanzas y Gastos generales quedaron habilitados."
                        : "Flujo de pago de comisiones actualizado."
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
            if (payload.receivedByEmrt) {
                void loadBoard();
            }
        }
        finally {
            setSavingPaymentSections((current) => {
                const next = new Set(current);
                next.delete(savingKey);
                return next;
            });
        }
    }
    function handleToggleCommissionTotalsReceiverExclusion(section, excluded) {
        if (!canManageTotalsReceiverExclusions || periodLocked) {
            return;
        }
        void updatePaymentAcknowledgement(section, { excluded });
    }
    function handleGenerateCommissionReceipt(row, recipientName) {
        if (!canMarkPaymentsByTransfer || row.calculation.totalCommissionsMxn <= 0) {
            return;
        }
        const periodLabel = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;
        const filenamePeriod = `${selectedYear}-${`${selectedMonth}`.padStart(2, "0")}`;
        setCommissionReceiptDraft({
            amountMxn: row.calculation.totalCommissionsMxn,
            document: buildCommissionMoneyReceipt({
                amountMxn: row.calculation.totalCommissionsMxn,
                concept: `Comisiones correspondientes a ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}`,
                recipientName
            }),
            filenameBase: `recibo-comisiones-${recipientName}-${filenamePeriod}`,
            periodLabel,
            recipientName,
            section: row.section
        });
    }
    async function handleUploadSignedReceipt(section, file) {
        if (!canMarkPaymentsByTransfer) {
            return;
        }
        if (!isPdfFile(file)) {
            setFlash({ tone: "error", text: "El recibo firmado debe ser un archivo PDF." });
            return;
        }
        if (file.size <= 0 || file.size > MAX_SIGNED_RECEIPT_BYTES) {
            setFlash({ tone: "error", text: "El recibo firmado debe pesar entre 1 byte y 10 MB." });
            return;
        }
        const uploadingKey = normalizeText(section);
        setUploadingSignedReceiptSections((current) => new Set(current).add(uploadingKey));
        setFlash(null);
        try {
            const fileBase64 = await readFileAsBase64(file);
            const state = await apiPost("/commissions/payment-acknowledgements/signed-receipt", {
                year: selectedYear,
                month: selectedMonth,
                section,
                originalFileName: file.name,
                fileBase64
            });
            setPaymentAcknowledgements(state.acknowledgements);
            setPeriodLocked(state.locked);
            setConfirmedByEmrtCount(state.confirmedByEmrtCount);
            setFlash({ tone: "success", text: "Recibo firmado cargado correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setUploadingSignedReceiptSections((current) => {
                const next = new Set(current);
                next.delete(uploadingKey);
                return next;
            });
        }
    }
    async function handleOpenSignedReceipt(acknowledgement) {
        setFlash(null);
        try {
            const query = new URLSearchParams({
                year: String(acknowledgement.year),
                month: String(acknowledgement.month),
                section: acknowledgement.section
            });
            const { blob } = await apiDownload(`/commissions/payment-acknowledgements/signed-receipt?${query.toString()}`);
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
    }
    function handleTogglePaymentReceivedByAraceli(section, receivedByAraceli) {
        if (!canConfirmPaymentsAsAraceli) {
            return;
        }
        void updatePaymentAcknowledgement(section, { receivedByAraceli });
    }
    function handleTogglePaymentPaidByTransfer(section, paidByTransfer) {
        if (!canMarkPaymentsByTransfer || periodLocked) {
            return;
        }
        void updatePaymentAcknowledgement(section, { paidByTransfer });
    }
    function handleTogglePaymentReceivedByEmrt(section, receivedByEmrt) {
        if (!canConfirmPaymentsAsEmrt) {
            return;
        }
        if (!receivedByEmrt && !window.confirm("Reabrir este pago por EMRT? El periodo solo se habilitara cuando no quede ningun pago de EMRT.")) {
            return;
        }
        void updatePaymentAcknowledgement(section, { receivedByEmrt });
    }
    async function handleToggleCommissionExclusion(row, excluded) {
        if (!canManageExclusions || periodLocked || !activeSection) {
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
    async function handleToggleMatterCommissionExclusion(entry, excluded) {
        if (!canManageMatterExclusions || periodLocked) {
            return;
        }
        setSavingMatterExclusionIds((current) => new Set(current).add(entry.matterId));
        setFlash(null);
        try {
            await apiPatch("/commissions/matter-exclusions", {
                year: selectedYear,
                month: selectedMonth,
                matterId: entry.matterId,
                excluded
            });
            setMatterCommissions((current) => current.map((candidate) => candidate.matterId === entry.matterId ? { ...candidate, excluded } : candidate));
            setFlash({
                tone: "success",
                text: excluded
                    ? `Asunto excluido desde ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}.`
                    : `Asunto reincluido desde ${MONTH_NAMES[selectedMonth - 1]} de ${selectedYear}.`
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingMatterExclusionIds((current) => {
                const next = new Set(current);
                next.delete(entry.matterId);
                return next;
            });
        }
    }
    function handleProjectorAmountDraftChange(entryId, value) {
        setProjectorAmountDrafts((current) => ({ ...current, [entryId]: value }));
    }
    async function updateProjectorCommission(entry, payload) {
        if (!canManageProjectorEntries || periodLocked) {
            return;
        }
        setSavingProjectorCommissionIds((current) => new Set(current).add(entry.id));
        setFlash(null);
        try {
            const updated = await apiPatch(`/commissions/projector-commissions/${entry.id}`, payload);
            setProjectorCommissions((current) => current.map((item) => item.id === updated.id ? updated : item));
            setProjectorAmountDrafts((current) => {
                const next = { ...current };
                delete next[entry.id];
                return next;
            });
            setFlash({
                tone: "success",
                text: updated.authorized
                    ? "Comisión autorizada para la proyectista y para Litigio líder."
                    : "Comisión actualizada; permanece fuera de ambos totales."
            });
        }
        catch (error) {
            setFlash({ tone: "error", text: getErrorMessage(error) });
        }
        finally {
            setSavingProjectorCommissionIds((current) => {
                const next = new Set(current);
                next.delete(entry.id);
                return next;
            });
        }
    }
    function handleCommitProjectorAmount(entry) {
        const draft = projectorAmountDrafts[entry.id];
        if (draft === undefined) {
            return;
        }
        const amountMxn = Number(draft);
        if (!Number.isFinite(amountMxn) || amountMxn < 0) {
            setProjectorAmountDrafts((current) => {
                const next = { ...current };
                delete next[entry.id];
                return next;
            });
            setFlash({ tone: "error", text: "El monto de la comisión debe ser un número igual o mayor a cero." });
            return;
        }
        if (amountMxn === entry.amountMxn) {
            setProjectorAmountDrafts((current) => {
                const next = { ...current };
                delete next[entry.id];
                return next;
            });
            return;
        }
        void updateProjectorCommission(entry, { amountMxn });
    }
    function handleToggleProjectorAuthorization(entry, authorized) {
        const draft = projectorAmountDrafts[entry.id];
        const amountMxn = draft === undefined ? entry.amountMxn : Number(draft);
        if (!Number.isFinite(amountMxn) || amountMxn < 0) {
            setFlash({ tone: "error", text: "Corrige el monto antes de autorizar la comisión." });
            return;
        }
        void updateProjectorCommission(entry, {
            authorized,
            ...(amountMxn === entry.amountMxn ? {} : { amountMxn })
        });
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
            matterCommissions: sectionCalculation.matterCommissions,
            matterCommissionsTotalMxn: sectionCalculation.matterCommissionsTotalMxn,
            group1TeamBreakdowns: sectionCalculation.group1TeamBreakdowns,
            group1GrossMxn: sectionCalculation.group1GrossMxn,
            group1NetMxn: sectionCalculation.group1NetMxn,
            group1PayableMxn: sectionCalculation.group1PayableMxn,
            group2TotalMxn: sectionCalculation.group2TotalMxn,
            group3TotalMxn: sectionCalculation.group3TotalMxn,
            projectorPayableMxn: sectionCalculation.projectorPayableMxn,
            projectorBonusMxn: sectionCalculation.projectorBonusMxn,
            projectorCommissions: sectionCalculation.projectorCommissions,
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
        : canReadAllCommissions && !isLegalFlow
            ? snapshots
            : snapshots.filter((snapshot) => visibleSectionKeys.has(normalizeText(snapshot.section)));
    const activeSectionLabel = activeSection || "Sin seccion";
    const shouldShowDeductionPanel = Boolean(activeSection
        && normalizeText(activeSection) !== normalizeText("Direccion general")
        && !isProjectorCommissionSection(activeSection));
    const isProjectorActiveSection = isProjectorCommissionSection(activeSection);
    const isLitigationLeaderActiveSection = isLitigationLeaderCommissionSection(activeSection);
    const isLitigationCollaboratorActiveSection = isLitigationCollaboratorCommissionSection(activeSection);
    const projectorPendingMxn = sectionCalculation.projectorCommissions.reduce((sum, entry) => sum + (entry.authorized ? 0 : entry.amountMxn), 0);
    const isSalesActiveSection = isSalesCommissionSection(activeSection);
    const group1RateLabel = getGroup1RateLabel(activeSection);
    const group1RateLabelSuffix = group1RateLabel ? ` (${group1RateLabel})` : "";
    const usesTeamGroup1Breakdown = sectionCalculation.group1TeamBreakdowns.length > 0;
    const hasNegativeTeamBalance = sectionCalculation.group1TeamBreakdowns.some((team) => team.netMxn < 0);
    const yearOptions = Array.from({ length: 7 }, (_, index) => 2024 + index);
    return (_jsxs("section", { className: "page-stack commissions-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Com" }), _jsx("div", { children: _jsx("h2", { children: "Comisiones" }) })] }), _jsx("p", { className: "muted", children: "Calculo por seccion, deduccion por gastos pagados, receptores editables, estampas historicas y resaltado visual en rojo sobre filas derivadas de registros incompletos." })] }), flash ? _jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text }) : null, errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, periodLocked && !isLegalFlow ? (_jsxs("div", { className: "message-banner commissions-period-lock-banner", children: ["Periodo cerrado por EMRT con ", confirmedByEmrtCount, " confirmacion", confirmedByEmrtCount === 1 ? "" : "es", ". Finanzas, Gastos generales y los ajustes que cambian comisiones permanecen bloqueados hasta reabrir todas."] })) : null, _jsx("section", { className: "panel", children: _jsxs("div", { className: "commissions-tabs", role: "tablist", "aria-label": "Pestanas de comisiones", children: [_jsx("button", { type: "button", className: `commissions-tab ${activeTab === "calculation" ? "is-active" : ""}`, onClick: () => setActiveTab("calculation"), children: "Calculo de comisiones" }), canReadAllCommissions ? (_jsx("button", { type: "button", className: `commissions-tab ${activeTab === "receivers" ? "is-active" : ""}`, onClick: () => setActiveTab("receivers"), children: "Receptores" })) : null, _jsx("button", { type: "button", className: `commissions-tab ${activeTab === "snapshots" ? "is-active" : ""}`, onClick: () => setActiveTab("snapshots"), children: "Estampas guardadas" })] }) }), activeTab === "calculation" ? (canAccessCalculation ? (_jsxs("div", { className: "commissions-layout", children: [_jsxs("aside", { className: "panel commissions-sidebar", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Secciones" }), _jsx("span", { children: visibleSections.length })] }), _jsx("div", { className: "commissions-sidebar-list", children: visibleSections.map((section) => (_jsx("button", { type: "button", className: `commissions-sidebar-button ${section === activeSection ? "is-active" : ""}`, onClick: () => setActiveSection(section), children: section }, section))) })] }), _jsxs("div", { className: "commissions-main", children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: activeSectionLabel }), _jsxs("span", { children: [MONTH_NAMES[selectedMonth - 1], " ", selectedYear] })] }), _jsxs("div", { className: "commissions-toolbar", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: yearOptions.map((year) => (_jsx("option", { value: year, children: year }, year))) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthLabel, index) => (_jsx("option", { value: index + 1, children: monthLabel }, monthLabel))) })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadBoard(), children: "Refrescar" }), !isTotalsActiveSection ? (_jsx("button", { className: "primary-button", type: "button", onClick: () => void handleCreateSnapshot(), disabled: savingSnapshot || !canWriteActiveSection, children: savingSnapshot ? "Guardando..." : "Guardar estampa" })) : null] }), _jsx("div", { className: `commissions-metrics-grid${isTotalsActiveSection ? " is-totals" : ""}`, children: isProjectorActiveSection ? (_jsxs(_Fragment, { children: [_jsx(CurrencyMetricCard, { label: "Comisiones pendientes de autorizar", value: projectorPendingMxn, accentClass: "is-warning" }), _jsx(CurrencyMetricCard, { label: "Comisiones autorizadas", value: sectionCalculation.projectorPayableMxn, accentClass: "is-primary" }), _jsx(CurrencyMetricCard, { label: "Total a pagar", value: sectionCalculation.totalCommissionsMxn, accentClass: "is-success", helper: "Solo las entradas autorizadas forman parte del total" })] })) : (_jsxs(_Fragment, { children: [!isTotalsActiveSection ? (usesTeamGroup1Breakdown ? (_jsx(CommissionTeamBreakdownCards, { teams: sectionCalculation.group1TeamBreakdowns })) : (_jsxs(_Fragment, { children: [_jsx(CurrencyMetricCard, { label: `Comisiones brutas Grupo 1${group1RateLabelSuffix}`, value: sectionCalculation.group1GrossMxn, accentClass: "is-primary" }), _jsx(CurrencyMetricCard, { label: "Deducci\u00F3n por gastos", value: sectionCalculation.deductionMxn, accentClass: "is-warning", helper: `${Math.round(sectionCalculation.deductionRate * 100)}% de ${formatCurrency(sectionCalculation.deductionBaseMxn)}` })] }))) : null, _jsx(CurrencyMetricCard, { label: isTotalsActiveSection ? "Comisiones Grupo 1" : `Comisiones netas Grupo 1${group1RateLabelSuffix}`, value: isTotalsActiveSection ? commissionTotalsSummary.group1PayableMxn : sectionCalculation.group1NetMxn, accentClass: "is-success" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 2 (20%)", value: isTotalsActiveSection ? commissionTotalsSummary.group2TotalMxn : sectionCalculation.group2TotalMxn, accentClass: "is-neutral" }), _jsx(CurrencyMetricCard, { label: "Comisiones Grupo 3 (10%)", value: isTotalsActiveSection ? commissionTotalsSummary.group3TotalMxn : sectionCalculation.group3TotalMxn, accentClass: "is-neutral" }), isLitigationCollaboratorActiveSection ? (_jsx(CurrencyMetricCard, { label: "Comisiones por asunto", value: sectionCalculation.matterCommissionsTotalMxn, accentClass: "is-primary", helper: "$100 por cada asunto de Litigio vigente" })) : null, isTotalsActiveSection ? (_jsx(CurrencyMetricCard, { label: "Proyectistas y espejo Litigio l\u00EDder", value: commissionTotalsSummary.projectorPayableMxn + commissionTotalsSummary.projectorBonusMxn, accentClass: "is-neutral" })) : isLitigationLeaderActiveSection ? (_jsx(CurrencyMetricCard, { label: "Comisiones espejo de proyectistas", value: sectionCalculation.projectorBonusMxn, accentClass: "is-primary", helper: "Se entregan completas y no est\u00E1n sujetas a deducciones" })) : null, isTotalsActiveSection ? (_jsx(CurrencyMetricCard, { label: "Total a pagar", value: commissionTotalsSummary.totalCommissionsMxn, accentClass: "is-success" })) : (_jsx(CurrencyMetricCard, { label: "Comisiones totales", value: sectionCalculation.totalCommissionsMxn, accentClass: "is-success", helper: usesTeamGroup1Breakdown && hasNegativeTeamBalance
                                                        ? "Los equipos negativos aportan $0 y no afectan a los equipos positivos"
                                                        : sectionCalculation.group1NetMxn < 0
                                                            ? "El saldo negativo del Grupo 1 no se resta a los grupos 2 y 3"
                                                            : undefined }))] })) })] }), loadingBoard ? (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando informacion de comisiones..." }) })) : isTotalsActiveSection ? (_jsx(CommissionTotalsTable, { rows: commissionTotalsRows, year: selectedYear, month: selectedMonth, excludedReceiverKeys: effectiveExcludedTotalsReceiverKeys, acknowledgementsBySection: paymentAcknowledgementsBySection, recipientAssignmentsBySection: recipientAssignmentsBySection, releaseEligibilityByUserId: releaseEligibilityByUserId, periodLocked: periodLocked, canManageReceiverExclusions: canManageTotalsReceiverExclusions, canMarkPaidByTransfer: canMarkPaymentsByTransfer, canGenerateReceipts: canMarkPaymentsByTransfer, canManageSignedReceipts: canMarkPaymentsByTransfer, canConfirmAsAraceli: canConfirmPaymentsAsAraceli, canConfirmAsEmrt: canConfirmPaymentsAsEmrt, savingSections: savingPaymentSections, uploadingSignedReceiptSections: uploadingSignedReceiptSections, onToggleReceiverExclusion: handleToggleCommissionTotalsReceiverExclusion, onTogglePaidByTransfer: handleTogglePaymentPaidByTransfer, onToggleReceivedByAraceli: handleTogglePaymentReceivedByAraceli, onToggleReceivedByEmrt: handleTogglePaymentReceivedByEmrt, onGenerateReceipt: handleGenerateCommissionReceipt, onUploadSignedReceipt: handleUploadSignedReceipt, onOpenSignedReceipt: handleOpenSignedReceipt })) : isProjectorActiveSection ? (_jsx(ProjectorCommissionTable, { title: `Comisiones por escritos de fondo - ${activeSection}`, rows: sectionCalculation.projectorCommissions, mode: "projector", canManage: canManageProjectorEntries && !periodLocked, savingIds: savingProjectorCommissionIds, amountDrafts: projectorAmountDrafts, onAmountDraftChange: handleProjectorAmountDraftChange, onCommitAmount: handleCommitProjectorAmount, onToggleAuthorization: handleToggleProjectorAuthorization })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "commissions-group-grid", children: [_jsx(CommissionGroupTable, { title: "PRIMER GRUPO: Comisiones de Ejecucion", toneClass: "tone-primary", rows: sectionCalculation.executionRecords, showBaseNet: isSalesActiveSection, baseNetLabel: isSalesActiveSection ? "Primer pago recibido" : undefined, amountLabel: isSalesActiveSection ? "1%" : undefined, showExclusionControls: true, canManageExclusions: canManageExclusions && !periodLocked, savingExclusionKeys: savingExclusionKeys, year: selectedYear, month: selectedMonth, section: activeSection, onToggleExclusion: handleToggleCommissionExclusion }), _jsx(CommissionGroupTable, { title: "SEGUNDO GRUPO: Comisiones de Cliente (20%)", toneClass: "tone-secondary", rows: sectionCalculation.clientRecords, showExclusionControls: true, canManageExclusions: canManageExclusions && !periodLocked, savingExclusionKeys: savingExclusionKeys, year: selectedYear, month: selectedMonth, section: activeSection, onToggleExclusion: handleToggleCommissionExclusion }), _jsx(CommissionGroupTable, { title: "TERCER GRUPO: Comisiones de Cierre (10%)", toneClass: "tone-tertiary", rows: sectionCalculation.closingRecords, showExclusionControls: true, canManageExclusions: canManageExclusions && !periodLocked, savingExclusionKeys: savingExclusionKeys, year: selectedYear, month: selectedMonth, section: activeSection, onToggleExclusion: handleToggleCommissionExclusion })] }), isLitigationCollaboratorActiveSection ? (_jsx(CommissionMatterTable, { rows: sectionCalculation.matterCommissions, canManageExclusions: canManageMatterExclusions && !periodLocked, savingMatterIds: savingMatterExclusionIds, onToggleExclusion: handleToggleMatterCommissionExclusion })) : null, isLitigationLeaderActiveSection ? (_jsx(ProjectorCommissionTable, { title: "COMISIONES ESPEJO: Escritos de fondo autorizados", rows: sectionCalculation.projectorCommissions, mode: "leader-mirror" })) : null, shouldShowDeductionPanel ? (_jsxs("section", { className: "panel commissions-deduction-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("h2", { children: ["Deduccion de gastos sobre Grupo 1 (", Math.round(sectionCalculation.deductionRate * 100), "%)"] }), _jsx("span", { children: formatCurrency(sectionCalculation.deductionMxn) })] }), usesTeamGroup1Breakdown ? (_jsx("p", { className: "muted commissions-caption", children: "Para Finanzas y Comunicacion con cliente, el 1% se calcula por equipo. Si el neto de un equipo queda en cero o negativo, ese equipo aporta $0 y no resta a los equipos con saldo positivo." })) : (_jsxs("p", { className: "muted commissions-caption", children: ["El total de gastos atribuibles a tu equipo este mes asciende a", " ", _jsx("strong", { children: formatCurrency(sectionCalculation.deductionBaseMxn) }), ". De dicha suma, el", " ", Math.round(sectionCalculation.deductionRate * 100), "%, que asciende a", " ", _jsx("strong", { children: formatCurrency(sectionCalculation.deductionMxn) }), ", se restara unicamente de las comisiones del Grupo 1. Las comisiones de los grupos 2 y 3 se entregan completas, aunque el Grupo 1 quede con saldo negativo."] })), _jsxs("div", { className: "commissions-deduction-summary", children: [_jsxs("span", { children: ["Comisiones brutas Grupo 1", group1RateLabelSuffix, ": ", _jsx("strong", { children: formatCurrency(sectionCalculation.group1GrossMxn) })] }), _jsxs("span", { children: ["(-) Deduccion Gastos: ", _jsx("strong", { children: formatCurrency(sectionCalculation.deductionMxn) })] }), _jsxs("span", { children: ["Comisiones netas Grupo 1", group1RateLabelSuffix, ": ", _jsx("strong", { children: formatCurrency(sectionCalculation.group1NetMxn) })] }), _jsxs("span", { children: ["Grupo 1 aplicado al total: ", _jsx("strong", { children: formatCurrency(sectionCalculation.group1PayableMxn) })] }), _jsxs("span", { children: ["(+) Comisiones Grupo 2 (20%): ", _jsx("strong", { children: formatCurrency(sectionCalculation.group2TotalMxn) })] }), _jsxs("span", { children: ["(+) Comisiones Grupo 3 (10%): ", _jsx("strong", { children: formatCurrency(sectionCalculation.group3TotalMxn) })] }), sectionCalculation.matterCommissionsTotalMxn > 0 ? (_jsxs("span", { children: ["(+) Comisiones por asunto: ", _jsx("strong", { children: formatCurrency(sectionCalculation.matterCommissionsTotalMxn) })] })) : null, sectionCalculation.projectorBonusMxn > 0 ? (_jsxs("span", { children: ["(+) Comisiones espejo de proyectistas: ", _jsx("strong", { children: formatCurrency(sectionCalculation.projectorBonusMxn) })] })) : null, _jsxs("span", { children: ["Comisiones totales: ", _jsx("strong", { children: formatCurrency(sectionCalculation.totalCommissionsMxn) })] })] })] })) : null] }))] })] })) : (_jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "No tienes asignado un rol de comisiones o no cuentas con permisos para esta pestana." }) }))) : null, activeTab === "receivers" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Receptores de comisiones" }), _jsxs("span", { children: [receivers.length, " registros"] })] }), canWriteCommissions ? (_jsxs("div", { className: "commissions-receiver-form", children: [_jsxs("label", { className: "form-field commissions-receiver-input", children: [_jsx("span", { children: "Nuevo receptor" }), _jsx("input", { type: "text", value: newReceiverName, onChange: (event) => setNewReceiverName(event.target.value), placeholder: "Ej. Juan Perez o un puesto", onKeyDown: (event) => {
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
                        })) })) : null] })) : null, viewingSnapshot ? _jsx(SnapshotDetailModal, { snapshot: viewingSnapshot, onClose: () => setViewingSnapshot(null) }) : null, commissionReceiptDraft ? (_jsx(CommissionReceiptModal, { draft: commissionReceiptDraft, onClose: () => setCommissionReceiptDraft(null) })) : null] }));
}
