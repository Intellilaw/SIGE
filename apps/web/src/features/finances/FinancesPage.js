import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { TEAM_OPTIONS } from "@sige/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
const MONTHLY_COLUMN_WIDTHS = [
    "56px",
    "120px",
    "240px",
    "140px",
    "110px",
    "360px",
    "170px",
    "220px",
    "150px",
    "300px",
    "170px",
    "170px",
    "150px",
    "170px",
    "280px",
    "180px",
    "180px",
    "160px",
    "170px",
    "190px",
    "220px",
    "190px",
    "220px",
    "220px",
    "96px",
    "96px",
    "96px",
    "96px",
    "96px",
    "100px",
    "230px",
    "230px",
    "230px",
    "230px",
    "230px",
    "230px",
    "230px",
    "230px",
    "230px",
    "230px",
    "190px",
    "190px",
    "180px",
    "220px",
    "110px",
    "320px",
    "110px"
];
const ACTIVE_COLUMN_WIDTHS = [
    "120px",
    "260px",
    "150px",
    "110px",
    "360px",
    "170px",
    "150px",
    "220px",
    "220px",
    "150px",
    "120px"
];
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeText(value) {
    return (value ?? "").trim();
}
function normalizeComparableText(value) {
    return normalizeText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function formatDateList(values) {
    const dates = values.map(toDateInput).filter(Boolean);
    return dates.length > 0 ? dates.join(" / ") : "-";
}
function getMonthName(month) {
    return [
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
    ][month - 1] ?? String(month);
}
function getMatterTypeLabel(type) {
    return type === "RETAINER" ? "Iguala" : "Unico";
}
function getDefaultPercentages(team) {
    return {
        pctLitigation: team === "LITIGATION" ? 100 : 0,
        pctCorporateLabor: team === "CORPORATE_LABOR" ? 100 : 0,
        pctSettlements: team === "SETTLEMENTS" ? 100 : 0,
        pctFinancialLaw: team === "FINANCIAL_LAW" ? 100 : 0,
        pctTaxCompliance: team === "TAX_COMPLIANCE" ? 100 : 0
    };
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
function buildMatchKeys(input) {
    const keys = [];
    const normalizedQuote = normalizeComparableText(input.quoteNumber);
    const normalizedClient = normalizeComparableText(input.clientName);
    const normalizedSubject = normalizeComparableText(input.subject);
    if (normalizedQuote) {
        keys.push(`quote:${normalizedQuote}`);
    }
    if (normalizedClient && normalizedSubject) {
        keys.push(`matter:${normalizedClient}|${normalizedSubject}`);
    }
    return keys;
}
function normalizeRecordPatchForState(patch) {
    return {
        ...patch,
        clientNumber: patch.clientNumber ?? undefined,
        quoteNumber: patch.quoteNumber ?? undefined,
        responsibleTeam: patch.responsibleTeam ?? undefined,
        workingConcepts: patch.workingConcepts ?? undefined,
        nextPaymentDate: patch.nextPaymentDate ?? undefined,
        nextPaymentNotes: patch.nextPaymentNotes ?? undefined,
        paymentDate1: patch.paymentDate1 ?? undefined,
        paymentDate2: patch.paymentDate2 ?? undefined,
        paymentDate3: patch.paymentDate3 ?? undefined,
        expenseNotes1: patch.expenseNotes1 ?? undefined,
        expenseNotes2: patch.expenseNotes2 ?? undefined,
        expenseNotes3: patch.expenseNotes3 ?? undefined,
        clientCommissionRecipient: patch.clientCommissionRecipient ?? undefined,
        closingCommissionRecipient: patch.closingCommissionRecipient ?? undefined,
        milestone: patch.milestone ?? undefined,
        financeComments: patch.financeComments ?? undefined
    };
}
function MonthSummaryCards({ records }) {
    const totals = useMemo(() => {
        return records.reduce((acc, record) => {
            const stats = calculateFinanceStats(record);
            return {
                income: acc.income + stats.totalPaidMxn,
                expenses: acc.expenses + stats.totalExpensesMxn,
                remainingExpectedThisMonth: acc.remainingExpectedThisMonth + stats.remainingMxn,
                netBeforeCommissions: acc.netBeforeCommissions + stats.netFeesMxn,
                commissions: acc.commissions +
                    stats.clientCommissionMxn +
                    stats.closingCommissionMxn +
                    stats.litigationLeaderCommissionMxn +
                    stats.litigationCollaboratorCommissionMxn +
                    stats.corporateLeaderCommissionMxn +
                    stats.corporateCollaboratorCommissionMxn +
                    stats.settlementsLeaderCommissionMxn +
                    stats.settlementsCollaboratorCommissionMxn +
                    stats.financialLeaderCommissionMxn +
                    stats.financialCollaboratorCommissionMxn +
                    stats.taxLeaderCommissionMxn +
                    stats.taxCollaboratorCommissionMxn,
                netAfterCommissions: acc.netAfterCommissions + stats.netProfitMxn
            };
        }, {
            income: 0,
            expenses: 0,
            remainingExpectedThisMonth: 0,
            netBeforeCommissions: 0,
            commissions: 0,
            netAfterCommissions: 0
        });
    }, [records]);
    const cards = [
        { label: "Ingresos cobrados", value: totals.income, accent: "finance-card-green" },
        { label: "Remanente esperado este mes", value: totals.remainingExpectedThisMonth, accent: "finance-card-red" },
        { label: "Neto antes comisiones", value: totals.netBeforeCommissions, accent: "finance-card-blue" },
        { label: "Comisiones totales", value: totals.commissions, accent: "finance-card-orange" },
        { label: "Neto despues comisiones", value: totals.netAfterCommissions, accent: "finance-card-rose" }
    ];
    return (_jsx("div", { className: "finance-summary-grid", children: cards.map((card) => (_jsxs("article", { className: `finance-summary-card ${card.accent}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: formatCurrency(card.value) })] }, card.label))) }));
}
export function FinancesPage() {
    const { user } = useAuth();
    const canReadFinances = canReadModule(user, "finances");
    const canWriteFinances = canWriteModule(user, "finances");
    const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
    const canDeleteFinanceRecords = isSuperadmin || canWriteFinances;
    const pageRef = useRef(null);
    const tabsPanelRef = useRef(null);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const [activeTab, setActiveTab] = useState("active-matters");
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [records, setRecords] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [viewingSnapshot, setViewingSnapshot] = useState(null);
    const [activeMatters, setActiveMatters] = useState([]);
    const [clients, setClients] = useState([]);
    const [receivers, setReceivers] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [currentMonthMatchKeys, setCurrentMonthMatchKeys] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    useEffect(() => {
        const page = pageRef.current;
        const tabsPanel = tabsPanelRef.current;
        if (!page || !tabsPanel) {
            return;
        }
        const syncStickyTableOffset = () => {
            const tabsHeight = Math.ceil(tabsPanel.getBoundingClientRect().height);
            page.style.setProperty("--finance-sticky-tabs-height", `${tabsHeight}px`);
            page.style.setProperty("--finance-sticky-table-top", `${tabsHeight}px`);
        };
        syncStickyTableOffset();
        const resizeObserver = new ResizeObserver(syncStickyTableOffset);
        resizeObserver.observe(tabsPanel);
        window.addEventListener("resize", syncStickyTableOffset);
        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("resize", syncStickyTableOffset);
        };
    }, []);
    function handleFinanceTableScroll(event) {
        event.currentTarget.parentElement?.style.setProperty("--finance-table-scroll-left", `${event.currentTarget.scrollLeft}px`);
    }
    const clientNumberByName = useMemo(() => {
        const lookup = new Map();
        clients.forEach((client) => {
            lookup.set(normalizeComparableText(client.name), client.clientNumber);
        });
        return lookup;
    }, [clients]);
    const sortedActiveMatters = useMemo(() => {
        return [...activeMatters].sort((left, right) => {
            const leftNumber = Number.parseInt(clientNumberByName.get(normalizeComparableText(left.clientName)) ?? normalizeText(left.clientNumber), 10);
            const rightNumber = Number.parseInt(clientNumberByName.get(normalizeComparableText(right.clientName)) ?? normalizeText(right.clientNumber), 10);
            if (Number.isNaN(leftNumber) && Number.isNaN(rightNumber)) {
                return left.createdAt.localeCompare(right.createdAt);
            }
            if (Number.isNaN(leftNumber)) {
                return 1;
            }
            if (Number.isNaN(rightNumber)) {
                return -1;
            }
            if (leftNumber !== rightNumber) {
                return leftNumber - rightNumber;
            }
            return left.createdAt.localeCompare(right.createdAt);
        });
    }, [activeMatters, clientNumberByName]);
    const uniqueMatters = useMemo(() => sortedActiveMatters.filter((matter) => matter.matterType !== "RETAINER"), [sortedActiveMatters]);
    const retainerMatters = useMemo(() => sortedActiveMatters.filter((matter) => matter.matterType === "RETAINER"), [sortedActiveMatters]);
    async function loadCurrentMonthPresence() {
        if (!canReadFinances) {
            setCurrentMonthMatchKeys(new Set());
            return;
        }
        const currentRecords = await apiGet(`/finances/records?year=${currentYear}&month=${currentMonth}`);
        const nextKeys = new Set();
        currentRecords.forEach((record) => {
            buildMatchKeys(record).forEach((key) => nextKeys.add(key));
        });
        setCurrentMonthMatchKeys(nextKeys);
    }
    async function loadMonthlyView() {
        if (!canReadFinances) {
            setRecords([]);
            setClients([]);
            setReceivers([]);
            setSelectedIds(new Set());
            setLoading(false);
            setError("No tienes permisos para consultar Finanzas.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [nextRecords, nextClients, nextReceivers] = await Promise.all([
                apiGet(`/finances/records?year=${selectedYear}&month=${selectedMonth}`),
                canWriteFinances ? apiGet("/clients") : Promise.resolve([]),
                apiGet("/finances/commission-receivers")
            ]);
            setRecords(nextRecords);
            setClients(nextClients);
            setReceivers(nextReceivers);
            setSelectedIds(new Set());
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadSnapshotsView() {
        if (!canReadFinances) {
            setSnapshots([]);
            setLoading(false);
            setError("No tienes permisos para consultar Finanzas.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const nextSnapshots = await apiGet("/finances/snapshots");
            setSnapshots(nextSnapshots);
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
        finally {
            setLoading(false);
        }
    }
    async function loadActiveMattersView() {
        if (!canReadFinances) {
            setClients([]);
            setActiveMatters([]);
            setLoading(false);
            setError("No tienes permisos para consultar Finanzas.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [matters, nextClients] = await Promise.all([
                apiGet("/matters"),
                canWriteFinances ? apiGet("/clients") : Promise.resolve([])
            ]);
            setClients(nextClients);
            setActiveMatters(matters.map((matter) => ({
                ...matter,
                transferYear: currentYear,
                transferMonth: currentMonth
            })));
            await loadCurrentMonthPresence();
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (activeTab === "monthly-view") {
            void loadMonthlyView();
            return;
        }
        if (activeTab === "snapshots") {
            void loadSnapshotsView();
            return;
        }
        void loadActiveMattersView();
    }, [activeTab, canReadFinances, selectedMonth, selectedYear]);
    function resolveClientNumber(clientName, fallback) {
        return clientNumberByName.get(normalizeComparableText(clientName)) ?? normalizeText(fallback);
    }
    function shouldHighlightMatter(matter) {
        if (!matter.nextPaymentDate) {
            return true;
        }
        const dueDate = new Date(`${matter.nextPaymentDate.slice(0, 10)}T12:00:00`);
        if (Number.isNaN(dueDate.getTime())) {
            return false;
        }
        const endOfCurrentMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
        if (dueDate > endOfCurrentMonth) {
            return false;
        }
        const matchKeys = buildMatchKeys(matter);
        if (matchKeys.length === 0) {
            return false;
        }
        return !matchKeys.some((key) => currentMonthMatchKeys.has(key));
    }
    function getMatterHighlightMessage() {
        return "Falta la fecha de proximo pago o ya vence este mes o antes, y aun no esta en Finanzas > Ver mes del mes actual.";
    }
    function evaluateMonthlyRecord(record) {
        const stats = calculateFinanceStats(record);
        const effectiveClientNumber = resolveClientNumber(record.clientName, record.clientNumber);
        const requiredChecks = [
            { label: "numero_cliente", present: Boolean(normalizeText(effectiveClientNumber)) },
            { label: "cliente", present: Boolean(normalizeText(record.clientName)) },
            { label: "numero_cotizacion", present: Boolean(normalizeText(record.quoteNumber)) },
            { label: "asunto", present: Boolean(normalizeText(record.subject)) },
            { label: "total_asunto", present: Boolean(record.totalMatterMxn) },
            { label: "honorarios_conceptos", present: Boolean(record.conceptFeesMxn) },
            { label: "conceptos_trabajando", present: Boolean(normalizeText(record.workingConcepts)) },
            { label: "fecha_pactada_pago", present: Boolean(record.nextPaymentDate) },
            { label: "detalle_fecha_pactada", present: Boolean(normalizeText(record.nextPaymentNotes)) },
            { label: "equipo_responsable", present: Boolean(record.responsibleTeam) },
            { label: "comision_cliente_quien", present: Boolean(normalizeText(record.clientCommissionRecipient)) },
            { label: "comision_cierre_quien", present: Boolean(normalizeText(record.closingCommissionRecipient)) }
        ];
        const missing = requiredChecks.filter((field) => !field.present).map((field) => field.label);
        const today = new Date();
        const todayValue = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const isContractPending = record.contractSignedStatus === "NO";
        const isDateUrgent = Boolean(record.nextPaymentDate && toDateInput(record.nextPaymentDate) <= todayValue && stats.dueTodayMxn > 1);
        const isPctInvalid = stats.pctSum !== 100;
        const reasons = [];
        if (missing.length > 0) {
            reasons.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
        }
        if (isContractPending) {
            reasons.push("Contrato firmado en NO.");
        }
        if (isDateUrgent) {
            reasons.push("Atencion: tarea urgente (atrasada/hoy no pagada).");
        }
        if (isPctInvalid) {
            reasons.push(`Atencion: la suma de porcentajes es ${stats.pctSum}% y debe ser 100%.`);
        }
        return {
            stats,
            effectiveClientNumber,
            shouldHighlight: reasons.length > 0,
            reason: reasons.join(" ")
        };
    }
    function updateRecordLocal(recordId, patch) {
        const normalizedPatch = normalizeRecordPatchForState(patch);
        setRecords((current) => current.map((record) => (record.id === recordId ? { ...record, ...normalizedPatch } : record)));
    }
    async function persistRecordPatch(recordId, patch) {
        if (!canWriteFinances) {
            return;
        }
        try {
            const updated = await apiPatch(`/finances/records/${recordId}`, patch);
            setRecords((current) => current.map((record) => (record.id === recordId ? updated : record)));
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    async function handleMatterNextPaymentDateChange(matterId, value) {
        if (!canWriteFinances) {
            return;
        }
        const previous = activeMatters;
        setActiveMatters((current) => current.map((matter) => (matter.id === matterId ? { ...matter, nextPaymentDate: value || undefined } : matter)));
        try {
            const updated = await apiPatch(`/matters/${matterId}`, {
                nextPaymentDate: value || null
            });
            setActiveMatters((current) => current.map((matter) => matter.id === matterId ? { ...matter, nextPaymentDate: updated.nextPaymentDate } : matter));
        }
        catch (caughtError) {
            setActiveMatters(previous);
            setError(toErrorMessage(caughtError));
        }
    }
    function updateMatterTransferTarget(matterId, field, value) {
        if (!canWriteFinances) {
            return;
        }
        setActiveMatters((current) => current.map((matter) => (matter.id === matterId ? { ...matter, [field]: value } : matter)));
    }
    async function handleSendMatterToFinance(matter) {
        if (!canWriteFinances) {
            return;
        }
        try {
            await apiPost("/finances/send-matter", {
                matterId: matter.id,
                year: matter.transferYear,
                month: matter.transferMonth
            });
            window.alert(`Asunto enviado a Finanzas (${getMonthName(matter.transferMonth)} ${matter.transferYear}).`);
            if (matter.transferYear === currentYear && matter.transferMonth === currentMonth) {
                await loadCurrentMonthPresence();
            }
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    function toggleRecordSelection(recordId) {
        setSelectedIds((current) => {
            const next = new Set(current);
            if (next.has(recordId)) {
                next.delete(recordId);
            }
            else {
                next.add(recordId);
            }
            return next;
        });
    }
    function toggleAllRecords() {
        setSelectedIds((current) => {
            if (current.size === records.length && records.length > 0) {
                return new Set();
            }
            return new Set(records.map((record) => record.id));
        });
    }
    async function handleDeleteRecord(recordId) {
        if (!canDeleteFinanceRecords) {
            window.alert("Solo el equipo de Finanzas puede borrar registros.");
            return;
        }
        if (!window.confirm("Borrar este registro?")) {
            return;
        }
        try {
            await apiDelete(`/finances/records/${recordId}`);
            setRecords((current) => current.filter((record) => record.id !== recordId));
            setSelectedIds((current) => {
                const next = new Set(current);
                next.delete(recordId);
                return next;
            });
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    async function handleBulkDelete() {
        if (!canDeleteFinanceRecords) {
            window.alert("Solo el equipo de Finanzas puede borrar registros.");
            return;
        }
        if (selectedIds.size === 0) {
            return;
        }
        if (!window.confirm(`Borrar ${selectedIds.size} registros seleccionados?`)) {
            return;
        }
        try {
            await apiPost("/finances/records/bulk-delete", { ids: Array.from(selectedIds) });
            setRecords((current) => current.filter((record) => !selectedIds.has(record.id)));
            setSelectedIds(new Set());
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    async function handleCreateSnapshot() {
        if (!canWriteFinances) {
            return;
        }
        try {
            await apiPost("/finances/snapshots", {
                year: selectedYear,
                month: selectedMonth
            });
            window.alert("Estampa guardada correctamente.");
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    async function handleCopyToNextMonth() {
        if (!canWriteFinances) {
            return;
        }
        try {
            const result = await apiPost("/finances/records/copy-to-next-month", {
                year: selectedYear,
                month: selectedMonth
            });
            window.alert(`Se copiaron ${result.copied} registros a ${getMonthName(result.month)} ${result.year}.`);
            setCopyModalOpen(false);
            setSelectedYear(result.year);
            setSelectedMonth(result.month);
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    function renderMonthlyTable() {
        const totals = records.reduce((acc, record) => {
            const stats = calculateFinanceStats(record);
            return {
                totalMatterMxn: acc.totalMatterMxn + record.totalMatterMxn,
                conceptFeesMxn: acc.conceptFeesMxn + record.conceptFeesMxn,
                previousPaymentsMxn: acc.previousPaymentsMxn + record.previousPaymentsMxn,
                remainingMxn: acc.remainingMxn + stats.remainingMxn,
                totalPaidMxn: acc.totalPaidMxn + stats.totalPaidMxn,
                dueTodayMxn: acc.dueTodayMxn + stats.dueTodayMxn,
                netFeesMxn: acc.netFeesMxn + stats.netFeesMxn,
                clientCommissionMxn: acc.clientCommissionMxn + stats.clientCommissionMxn,
                closingCommissionMxn: acc.closingCommissionMxn + stats.closingCommissionMxn,
                litigationLeaderCommissionMxn: acc.litigationLeaderCommissionMxn + stats.litigationLeaderCommissionMxn,
                litigationCollaboratorCommissionMxn: acc.litigationCollaboratorCommissionMxn + stats.litigationCollaboratorCommissionMxn,
                corporateLeaderCommissionMxn: acc.corporateLeaderCommissionMxn + stats.corporateLeaderCommissionMxn,
                corporateCollaboratorCommissionMxn: acc.corporateCollaboratorCommissionMxn + stats.corporateCollaboratorCommissionMxn,
                settlementsLeaderCommissionMxn: acc.settlementsLeaderCommissionMxn + stats.settlementsLeaderCommissionMxn,
                settlementsCollaboratorCommissionMxn: acc.settlementsCollaboratorCommissionMxn + stats.settlementsCollaboratorCommissionMxn,
                financialLeaderCommissionMxn: acc.financialLeaderCommissionMxn + stats.financialLeaderCommissionMxn,
                financialCollaboratorCommissionMxn: acc.financialCollaboratorCommissionMxn + stats.financialCollaboratorCommissionMxn,
                taxLeaderCommissionMxn: acc.taxLeaderCommissionMxn + stats.taxLeaderCommissionMxn,
                taxCollaboratorCommissionMxn: acc.taxCollaboratorCommissionMxn + stats.taxCollaboratorCommissionMxn,
                clientRelationsCommissionMxn: acc.clientRelationsCommissionMxn + stats.clientRelationsCommissionMxn,
                financeCommissionMxn: acc.financeCommissionMxn + stats.financeCommissionMxn,
                netProfitMxn: acc.netProfitMxn + stats.netProfitMxn
            };
        }, {
            totalMatterMxn: 0,
            conceptFeesMxn: 0,
            previousPaymentsMxn: 0,
            remainingMxn: 0,
            totalPaidMxn: 0,
            dueTodayMxn: 0,
            netFeesMxn: 0,
            clientCommissionMxn: 0,
            closingCommissionMxn: 0,
            litigationLeaderCommissionMxn: 0,
            litigationCollaboratorCommissionMxn: 0,
            corporateLeaderCommissionMxn: 0,
            corporateCollaboratorCommissionMxn: 0,
            settlementsLeaderCommissionMxn: 0,
            settlementsCollaboratorCommissionMxn: 0,
            financialLeaderCommissionMxn: 0,
            financialCollaboratorCommissionMxn: 0,
            taxLeaderCommissionMxn: 0,
            taxCollaboratorCommissionMxn: 0,
            clientRelationsCommissionMxn: 0,
            financeCommissionMxn: 0,
            netProfitMxn: 0
        });
        const renderMonthlyColGroup = () => (_jsx("colgroup", { children: MONTHLY_COLUMN_WIDTHS.map((width, index) => (_jsx("col", { style: { width } }, `finance-monthly-col-${index}`))) }));
        const renderMonthlyHeader = () => (_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: _jsx("input", { type: "checkbox", checked: records.length > 0 && selectedIds.size === records.length, onChange: toggleAllRecords }) }), _jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Contrato firmado" }), _jsx("th", { children: "Equipo Responsable" }), _jsx("th", { children: "Total Asunto" }), _jsx("th", { children: "Conceptos trabajando" }), _jsx("th", { children: "Honorarios conceptos" }), _jsx("th", { children: "Pagos previos" }), _jsx("th", { children: "Remanente esperado este mes" }), _jsx("th", { children: "Fecha de proximo pago" }), _jsx("th", { children: "Detalle Fecha" }), _jsx("th", { children: "Pagado este mes" }), _jsx("th", { children: "Fecha Pago Real" }), _jsx("th", { children: "Adeudado hoy" }), _jsx("th", { children: "Honorarios netos" }), _jsx("th", { children: "Comision cliente 20%" }), _jsx("th", { children: "Para quien" }), _jsx("th", { children: "Comision cierre 10%" }), _jsx("th", { children: "Para quien" }), _jsx("th", { children: "Ingresos menos 20% y 10%" }), _jsx("th", { children: "% Litigio" }), _jsx("th", { children: "% Corp-Lab" }), _jsx("th", { children: "% Convenios" }), _jsx("th", { children: "% Der Fin" }), _jsx("th", { children: "% Compl. Fis." }), _jsx("th", { children: "SUM %" }), _jsx("th", { children: "COM. EJEC. LITIGIO (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. LITIGIO (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. CORP-LAB (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. CORP-LAB (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. CONVENIOS (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. CONVENIOS (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. DER FIN (LIDER 10%)" }), _jsx("th", { children: "COM. EJEC. DER FIN (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. COMPL FIS (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. COMPL FIS (COLAB 1%)" }), _jsx("th", { children: "Com. Com. Cliente (1% Neto)" }), _jsx("th", { children: "Com. Finanzas (1% Neto)" }), _jsx("th", { children: "Utilidad neta" }), _jsx("th", { children: "Hito conclusion" }), _jsx("th", { children: "Concluyo?" }), _jsx("th", { children: "Comentarios" }), _jsx("th", { children: "Accion" })] }) }));
        return (_jsx("fieldset", { className: "finance-readonly-fieldset", disabled: !canWriteFinances, children: _jsxs("div", { className: "finance-table-shell finance-table-shell-sticky", children: [_jsx("div", { className: "finance-table-sticky-head", children: _jsxs("table", { className: "finance-table finance-table-monthly", children: [renderMonthlyColGroup(), renderMonthlyHeader()] }) }), _jsx("div", { className: "finance-table-scroll", onScroll: handleFinanceTableScroll, children: _jsxs("table", { className: "finance-table finance-table-monthly", children: [renderMonthlyColGroup(), _jsxs("tbody", { children: [records.map((record) => {
                                            const { stats, effectiveClientNumber, shouldHighlight, reason } = evaluateMonthlyRecord(record);
                                            const isSelected = selectedIds.has(record.id);
                                            const rowClassName = `${shouldHighlight ? "finance-row-danger" : ""} ${isSelected ? "finance-row-selected" : ""}`.trim();
                                            return (_jsxs("tr", { className: rowClassName, title: reason, children: [_jsx("td", { className: "finance-cell-checkbox", children: _jsx("input", { type: "checkbox", checked: isSelected, onChange: () => toggleRecordSelection(record.id) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: effectiveClientNumber, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.clientName, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.quoteNumber ?? "", readOnly: true }) }), _jsx("td", { children: _jsx("span", { className: `finance-type-pill ${record.matterType === "RETAINER" ? "is-retainer" : ""}`, children: getMatterTypeLabel(record.matterType) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.subject, readOnly: true }) }), _jsx("td", { children: _jsxs("select", { className: `finance-input ${record.contractSignedStatus === "NO" ? "finance-select-danger" : ""}`, value: record.contractSignedStatus, onChange: (event) => {
                                                                const contractSignedStatus = event.target.value;
                                                                updateRecordLocal(record.id, { contractSignedStatus });
                                                                void persistRecordPatch(record.id, { contractSignedStatus });
                                                            }, children: [_jsx("option", { value: "NO", children: "NO" }), _jsx("option", { value: "YES", children: "SI" }), _jsx("option", { value: "NOT_REQUIRED", children: "No es necesario" })] }) }), _jsx("td", { children: record.matterType === "RETAINER" ? (_jsxs("select", { className: "finance-input", value: record.responsibleTeam ?? "", onChange: (event) => {
                                                                const responsibleTeam = (event.target.value || null);
                                                                const percentages = getDefaultPercentages(responsibleTeam);
                                                                updateRecordLocal(record.id, { responsibleTeam, ...percentages });
                                                                void persistRecordPatch(record.id, { responsibleTeam, ...percentages });
                                                            }, children: [_jsx("option", { value: "", children: "Seleccionar..." }), TEAM_OPTIONS.filter((option) => ["LITIGATION", "CORPORATE_LABOR", "SETTLEMENTS", "FINANCIAL_LAW", "TAX_COMPLIANCE"].includes(option.key)).map((option) => (_jsx("option", { value: option.key, children: option.label }, option.key)))] })) : (_jsx("input", { className: "finance-input finance-input-readonly", value: TEAM_OPTIONS.find((option) => option.key === record.responsibleTeam)?.label ?? "", readOnly: true })) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly finance-input-number", value: record.totalMatterMxn, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input", value: record.workingConcepts ?? "", onChange: (event) => updateRecordLocal(record.id, { workingConcepts: event.target.value }), onBlur: (event) => void persistRecordPatch(record.id, { workingConcepts: event.target.value }) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", step: "0.01", value: record.conceptFeesMxn, onChange: (event) => updateRecordLocal(record.id, { conceptFeesMxn: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { conceptFeesMxn: Number(event.target.value || 0) }) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", step: "0.01", value: record.previousPaymentsMxn, onChange: (event) => updateRecordLocal(record.id, { previousPaymentsMxn: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { previousPaymentsMxn: Number(event.target.value || 0) }) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly finance-input-number", value: stats.remainingMxn, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", type: "date", value: toDateInput(record.nextPaymentDate), readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input", value: record.nextPaymentNotes ?? "", onChange: (event) => updateRecordLocal(record.id, { nextPaymentNotes: event.target.value }), onBlur: (event) => void persistRecordPatch(record.id, { nextPaymentNotes: event.target.value }) }) }), _jsx("td", { children: _jsxs("div", { className: "finance-stack", children: [_jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", step: "0.01", value: record.paidThisMonthMxn, onChange: (event) => updateRecordLocal(record.id, { paidThisMonthMxn: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { paidThisMonthMxn: Number(event.target.value || 0) }) }), _jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", step: "0.01", value: record.payment2Mxn, onChange: (event) => updateRecordLocal(record.id, { payment2Mxn: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { payment2Mxn: Number(event.target.value || 0) }) }), _jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", step: "0.01", value: record.payment3Mxn, onChange: (event) => updateRecordLocal(record.id, { payment3Mxn: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { payment3Mxn: Number(event.target.value || 0) }) })] }) }), _jsx("td", { children: _jsxs("div", { className: "finance-stack", children: [_jsx("input", { className: "finance-input", type: "date", value: toDateInput(record.paymentDate1), onChange: (event) => updateRecordLocal(record.id, { paymentDate1: event.target.value || null }), onBlur: (event) => void persistRecordPatch(record.id, { paymentDate1: event.target.value || null }) }), _jsx("input", { className: "finance-input", type: "date", value: toDateInput(record.paymentDate2), onChange: (event) => updateRecordLocal(record.id, { paymentDate2: event.target.value || null }), onBlur: (event) => void persistRecordPatch(record.id, { paymentDate2: event.target.value || null }) }), _jsx("input", { className: "finance-input", type: "date", value: toDateInput(record.paymentDate3), onChange: (event) => updateRecordLocal(record.id, { paymentDate3: event.target.value || null }), onBlur: (event) => void persistRecordPatch(record.id, { paymentDate3: event.target.value || null }) })] }) }), _jsx("td", { children: _jsx("input", { className: `finance-input finance-input-readonly finance-input-number ${stats.dueTodayMxn > 0 ? "finance-cell-negative" : ""}`, value: stats.dueTodayMxn, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly finance-input-number finance-cell-positive", value: stats.netFeesMxn, readOnly: true }) }), _jsx("td", { children: formatCurrency(stats.clientCommissionMxn) }), _jsx("td", { children: _jsxs("select", { className: "finance-input", value: record.clientCommissionRecipient ?? "", onChange: (event) => { const clientCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { clientCommissionRecipient }); void persistRecordPatch(record.id, { clientCommissionRecipient }); }, children: [_jsx("option", { value: "", children: "Seleccionar..." }), receivers.map((receiver) => _jsx("option", { value: receiver.name, children: receiver.name }, receiver.id))] }) }), _jsx("td", { children: formatCurrency(stats.closingCommissionMxn) }), _jsx("td", { children: _jsxs("select", { className: "finance-input", value: record.closingCommissionRecipient ?? "", onChange: (event) => { const closingCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { closingCommissionRecipient }); void persistRecordPatch(record.id, { closingCommissionRecipient }); }, children: [_jsx("option", { value: "", children: "Seleccionar..." }), receivers.map((receiver) => _jsx("option", { value: receiver.name, children: receiver.name }, receiver.id))] }) }), _jsx("td", { className: "finance-total-cell", children: formatCurrency(stats.netFeesMxn - stats.clientCommissionMxn - stats.closingCommissionMxn) }), [
                                                        ["pctLitigation", record.pctLitigation],
                                                        ["pctCorporateLabor", record.pctCorporateLabor],
                                                        ["pctSettlements", record.pctSettlements],
                                                        ["pctFinancialLaw", record.pctFinancialLaw],
                                                        ["pctTaxCompliance", record.pctTaxCompliance]
                                                    ].map(([field, value]) => (_jsx("td", { children: _jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", max: "100", step: "1", value: value, onChange: (event) => updateRecordLocal(record.id, { [field]: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { [field]: Number(event.target.value || 0) }) }) }, field))), _jsxs("td", { className: stats.pctSum === 100 ? "finance-pct-ok" : "finance-pct-danger", children: [stats.pctSum, "%"] }), _jsx("td", { children: formatCurrency(stats.litigationLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.litigationCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.corporateLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.corporateCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.settlementsLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.settlementsCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.financialLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.financialCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.taxLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.taxCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.clientRelationsCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.financeCommissionMxn) }), _jsx("td", { className: "finance-profit-cell", children: formatCurrency(stats.netProfitMxn) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.milestone ?? "", readOnly: true }) }), _jsx("td", { className: "finance-cell-checkbox", children: _jsx("input", { type: "checkbox", checked: record.concluded, onChange: (event) => { updateRecordLocal(record.id, { concluded: event.target.checked }); void persistRecordPatch(record.id, { concluded: event.target.checked }); } }) }), _jsx("td", { children: _jsx("textarea", { className: "finance-input finance-textarea", value: record.financeComments ?? "", onChange: (event) => updateRecordLocal(record.id, { financeComments: event.target.value }), onBlur: (event) => void persistRecordPatch(record.id, { financeComments: event.target.value }) }) }), _jsx("td", { children: _jsx("button", { className: "danger-button finance-inline-button", type: "button", onClick: () => void handleDeleteRecord(record.id), children: "Borrar" }) })] }, record.id));
                                        }), !loading && records.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 47, children: "Sin registros para esta fecha." }) })) : null] }), _jsx("tfoot", { children: _jsxs("tr", { className: "finance-total-row", children: [_jsx("td", { colSpan: 8, children: "Totales" }), _jsx("td", { children: formatCurrency(totals.totalMatterMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.conceptFeesMxn) }), _jsx("td", { children: formatCurrency(totals.previousPaymentsMxn) }), _jsx("td", { children: formatCurrency(totals.remainingMxn) }), _jsx("td", { colSpan: 2 }), _jsx("td", { children: formatCurrency(totals.totalPaidMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.dueTodayMxn) }), _jsx("td", { children: formatCurrency(totals.netFeesMxn) }), _jsx("td", { children: formatCurrency(totals.clientCommissionMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.closingCommissionMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.netFeesMxn - totals.clientCommissionMxn - totals.closingCommissionMxn) }), _jsx("td", { colSpan: 6 }), _jsx("td", { children: formatCurrency(totals.litigationLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.litigationCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.corporateLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.corporateCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.settlementsLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.settlementsCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.financialLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.financialCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.taxLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.taxCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.clientRelationsCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.financeCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.netProfitMxn) }), _jsx("td", { colSpan: 4 })] }) })] }) })] }) }));
    }
    function renderActiveMattersTable(items, variant) {
        const renderActiveColGroup = () => (_jsx("colgroup", { children: ACTIVE_COLUMN_WIDTHS.map((width, index) => (_jsx("col", { style: { width } }, `finance-active-col-${index}`))) }));
        const renderActiveHeader = () => (_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Honorarios Totales" }), _jsx("th", { children: "Comision cierre" }), _jsx("th", { children: "Equipo Responsable" }), _jsx("th", { children: "Fecha de proximo pago" }), _jsx("th", { children: "Destino (Finanzas)" }), _jsx("th", { children: "Accion" })] }) }));
        return (_jsx("fieldset", { className: "finance-readonly-fieldset", disabled: !canWriteFinances, children: _jsxs("div", { className: "finance-active-table-shell finance-table-shell-sticky", children: [_jsx("div", { className: "finance-table-sticky-head", children: _jsxs("table", { className: "finance-active-table", children: [renderActiveColGroup(), renderActiveHeader()] }) }), _jsx("div", { className: "finance-table-scroll", onScroll: handleFinanceTableScroll, children: _jsxs("table", { className: "finance-active-table", children: [renderActiveColGroup(), _jsxs("tbody", { children: [items.map((matter) => {
                                            const highlight = shouldHighlightMatter(matter);
                                            const targetDate = new Date(matter.transferYear, matter.transferMonth - 1, 1);
                                            const currentDate = new Date(currentYear, currentMonth - 1, 1);
                                            const disabled = targetDate > currentDate;
                                            return (_jsxs("tr", { className: highlight ? "finance-row-danger" : variant === "retainer" ? "finance-row-retainer" : "", title: highlight ? getMatterHighlightMessage() : "", children: [_jsx("td", { children: resolveClientNumber(matter.clientName, matter.clientNumber) }), _jsx("td", { children: matter.clientName }), _jsx("td", { children: matter.quoteNumber ?? "-" }), _jsx("td", { children: _jsx("span", { className: `finance-type-pill ${matter.matterType === "RETAINER" ? "is-retainer" : ""}`, children: getMatterTypeLabel(matter.matterType) }) }), _jsx("td", { children: matter.subject }), _jsx("td", { children: formatCurrency(matter.totalFeesMxn) }), _jsx("td", { children: matter.commissionAssignee ?? "-" }), _jsx("td", { children: TEAM_OPTIONS.find((option) => option.key === matter.responsibleTeam)?.label ?? "-" }), _jsx("td", { children: _jsx("input", { className: "finance-input", type: "date", value: toDateInput(matter.nextPaymentDate), onChange: (event) => void handleMatterNextPaymentDateChange(matter.id, event.target.value) }) }), _jsx("td", { children: _jsxs("div", { className: "finance-target-picker", children: [_jsx("select", { className: "finance-input", value: matter.transferYear, onChange: (event) => updateMatterTransferTarget(matter.id, "transferYear", Number(event.target.value)), children: [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => _jsx("option", { value: year, children: year }, year)) }), _jsx("select", { className: "finance-input", value: matter.transferMonth, onChange: (event) => updateMatterTransferTarget(matter.id, "transferMonth", Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => _jsx("option", { value: month, children: getMonthName(month) }, month)) })] }) }), _jsx("td", { children: _jsx("button", { className: `finance-send-button ${variant === "retainer" ? "is-retainer" : ""}`, disabled: disabled, onClick: () => void handleSendMatterToFinance(matter), type: "button", children: "Enviar" }) })] }, matter.id));
                                        }), !loading && items.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 11, children: variant === "retainer" ? "No hay igualas activas." : "No hay asuntos unicos activos." }) })) : null] })] }) })] }) }));
    }
    function renderSnapshots() {
        return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Estampas guardadas" }), _jsxs("span", { children: [snapshots.length, " registros"] })] }), _jsx("div", { className: "finance-snapshot-grid", children: snapshots.length === 0 ? (_jsx("p", { className: "muted", children: "No hay estampas guardadas aun." })) : (snapshots.map((snapshot) => (_jsxs("article", { className: "finance-snapshot-card", children: [_jsxs("div", { className: "finance-snapshot-head", children: [_jsx("strong", { children: snapshot.title }), _jsx("span", { children: new Date(snapshot.createdAt).toLocaleDateString("es-MX") })] }), _jsxs("dl", { className: "finance-snapshot-stats", children: [_jsx("dt", { children: "Ingresos" }), _jsx("dd", { children: formatCurrency(snapshot.totalIncomeMxn) }), _jsx("dt", { children: "Egresos" }), _jsx("dd", { children: formatCurrency(snapshot.totalExpenseMxn) }), _jsx("dt", { children: "Balance" }), _jsx("dd", { children: formatCurrency(snapshot.balanceMxn) })] }), snapshot.snapshotData?.enrichedRecords?.length ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => setViewingSnapshot(snapshot), children: "Ver detalle completo" })) : null] }, snapshot.id)))) })] }));
    }
    return (_jsxs("section", { className: "page-stack finances-page", ref: pageRef, children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Finanzas" }), _jsx("div", { children: _jsx("h2", { children: "Finanzas" }) })] }), _jsx("p", { className: "muted", children: "Asuntos activos con envio a Finanzas, vista mensual operativa, copiado al siguiente mes, estampas historicas y validacion visual en rojo." })] }), error ? _jsx("div", { className: "message-banner message-error", children: error }) : null, _jsx("section", { className: "panel finance-tabs-panel", ref: tabsPanelRef, children: _jsxs("div", { className: "finance-tabs", children: [_jsx("button", { className: `finance-tab ${activeTab === "active-matters" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("active-matters"), children: "1. Asuntos activos" }), _jsx("button", { className: `finance-tab ${activeTab === "monthly-view" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("monthly-view"), children: "2. Ver mes" }), _jsx("button", { className: `finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("snapshots"), children: "3. Estampas guardadas" })] }) }), activeTab === "active-matters" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Asuntos Activos (Unicos)" }), _jsxs("span", { children: [uniqueMatters.length, " registros"] })] }), renderActiveMattersTable(uniqueMatters, "unique")] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "2. Igualas por asuntos varios" }), _jsxs("span", { children: [retainerMatters.length, " registros"] })] }), _jsx("p", { className: "muted matter-table-caption", children: "Los renglones siguen mostrando rojo cuando falta la fecha de proximo pago o el asunto ya debia estar visible en el mes actual." }), renderActiveMattersTable(retainerMatters, "retainer")] })] })) : null, activeTab === "monthly-view" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "finance-toolbar", children: [_jsxs("div", { className: "finance-toolbar-group", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => _jsx("option", { value: year, children: year }, year)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => _jsx("option", { value: month, children: getMonthName(month) }, month)) })] })] }), _jsxs("div", { className: "finance-toolbar-actions", children: [selectedIds.size > 0 ? (_jsxs("button", { className: "danger-button", type: "button", onClick: () => void handleBulkDelete(), disabled: !canDeleteFinanceRecords, children: ["Borrar (", selectedIds.size, ")"] })) : null, _jsx("button", { className: "secondary-button", type: "button", onClick: () => void handleCreateSnapshot(), disabled: !canWriteFinances, children: "Guardar estampa" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => setCopyModalOpen(true), disabled: !canWriteFinances, children: "Copiar todo al mes siguiente" })] })] }), _jsx(MonthSummaryCards, { records: records }), renderMonthlyTable()] })) : null, activeTab === "snapshots" ? renderSnapshots() : null, copyModalOpen ? (_jsx("div", { className: "finance-modal-backdrop", children: _jsxs("div", { className: "finance-modal", children: [_jsx("h3", { children: "Advertencia" }), _jsx("p", { children: "Esta accion borrara todos los registros existentes del siguiente mes y los reemplazara con los registros actuales." }), _jsxs("div", { className: "finance-modal-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => setCopyModalOpen(false), children: "Cancelar" }), _jsx("button", { className: "danger-button", type: "button", onClick: () => void handleCopyToNextMonth(), disabled: !canWriteFinances, children: "Continuar" })] })] }) })) : null, viewingSnapshot ? (_jsx("div", { className: "finance-modal-backdrop", children: _jsxs("div", { className: "finance-modal finance-modal-wide", children: [_jsxs("div", { className: "finance-modal-head", children: [_jsxs("div", { children: [_jsx("h3", { children: viewingSnapshot.title }), _jsxs("p", { className: "muted", children: ["Guardado: ", new Date(viewingSnapshot.createdAt).toLocaleString("es-MX")] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => setViewingSnapshot(null), children: "Cerrar" })] }), _jsx("div", { className: "finance-table-shell", children: _jsxs("table", { className: "finance-table finance-table-snapshot", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No." }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cot." }), _jsx("th", { children: "Responsable" }), _jsx("th", { children: "Tipo Asunto" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Total Asunto" }), _jsx("th", { children: "Conceptos" }), _jsx("th", { children: "Hon. Conceptos" }), _jsx("th", { children: "Pagos Previos" }), _jsx("th", { children: "Remanente" }), _jsx("th", { children: "Fecha de proximo pago" }), _jsx("th", { children: "Semana" }), _jsx("th", { children: "Pagado este mes" }), _jsx("th", { children: "Fecha Pago Real" }), _jsx("th", { children: "Adeudado" }), _jsx("th", { children: "Netos" }), _jsx("th", { children: "Comm Cliente (20%)" }), _jsx("th", { children: "Comm Cierre (10%)" }), _jsx("th", { children: "Ut. Neta" })] }) }), _jsx("tbody", { children: (viewingSnapshot.snapshotData?.enrichedRecords ?? []).map((record, index) => {
                                            const stats = calculateFinanceStats(record);
                                            const paymentDates = formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3]);
                                            return (_jsxs("tr", { children: [_jsx("td", { children: index + 1 }), _jsx("td", { children: record.clientName }), _jsx("td", { children: record.quoteNumber ?? "-" }), _jsx("td", { children: TEAM_OPTIONS.find((option) => option.key === record.responsibleTeam)?.label ?? "-" }), _jsx("td", { children: getMatterTypeLabel(record.matterType) }), _jsx("td", { children: record.subject }), _jsx("td", { children: "Ingreso" }), _jsx("td", { children: formatCurrency(record.totalMatterMxn) }), _jsx("td", { children: record.workingConcepts ?? "-" }), _jsx("td", { children: formatCurrency(record.conceptFeesMxn) }), _jsx("td", { children: formatCurrency(record.previousPaymentsMxn) }), _jsx("td", { children: formatCurrency(stats.remainingMxn) }), _jsx("td", { children: toDateInput(record.nextPaymentDate) || "-" }), _jsx("td", { children: "-" }), _jsx("td", { children: formatCurrency(stats.totalPaidMxn) }), _jsx("td", { children: paymentDates }), _jsx("td", { children: formatCurrency(stats.dueTodayMxn) }), _jsx("td", { children: formatCurrency(stats.netFeesMxn) }), _jsx("td", { children: formatCurrency(stats.clientCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.closingCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.netProfitMxn) })] }, `${viewingSnapshot.id}-${record.id}`));
                                        }) })] }) })] }) })) : null] }));
}
