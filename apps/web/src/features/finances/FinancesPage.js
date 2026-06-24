import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { COMMISSION_SECTIONS, TEAM_OPTIONS } from "@sige/contracts";
import { apiDelete, apiDownload, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
import { canReadModule, canWriteModule } from "../auth/permissions";
const MONTHLY_COLUMN_WIDTHS = [
    "56px",
    "64px",
    "120px",
    "240px",
    "140px",
    "110px",
    "360px",
    "220px",
    "150px",
    "300px",
    "170px",
    "170px",
    "280px",
    "190px",
    "420px",
    "420px",
    "180px",
    "180px",
    "110px",
    "120px",
    "160px",
    "150px",
    "150px",
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
    "190px",
    "180px",
    "220px",
    "110px",
    "320px",
    "110px"
];
const PAYMENT_METHOD_OPTIONS = [
    { value: "blank", label: "" },
    { value: "T", label: "T" },
    { value: "E", label: "E" }
];
const DELINQUENCY_STATUS_OPTIONS = [
    { value: "CURRENT", label: "Al corriente" },
    { value: "DAYS_1_TO_10", label: "Mora de 1 a 10 d\u00edas" },
    { value: "MORE_THAN_10", label: "Mora mayor a 10 d\u00edas" },
    { value: "MORE_THAN_20", label: "Mora mayor a 20 d\u00edas" },
    { value: "MORE_THAN_30", label: "Mora mayor a 30 d\u00edas" }
];
const CLIENT_DELINQUENCY_MESSAGES = {
    ongoing: {
        DAYS_1_TO_10: {
            es: [
                "*Mora de 1 a 10 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le recordamos que se encuentra pendiente de pago el importe correspondiente, cuyo vencimiento ya transcurri\u00f3.",
                "",
                "Para mantener la prestaci\u00f3n ordinaria de nuestros servicios sin afectaciones, le agradeceremos ponerse al corriente a la brevedad.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*1 to 10 days past due*",
                "",
                "Dear client,",
                "",
                "We would like to remind you that the corresponding payment remains outstanding and its due date has already passed.",
                "",
                "To maintain the ordinary provision of our services without disruption, we kindly ask you to bring your account up to date as soon as possible.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        },
        MORE_THAN_10: {
            es: [
                "*Mora mayor a 10 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le informamos que su cuenta presenta un atraso mayor a 10 d\u00edas.",
                "",
                "Con el fin de mantener activa la prestaci\u00f3n ordinaria de nuestros servicios, le solicitamos regularizar el pago pendiente a la brevedad.",
                "",
                "En caso de que el atraso contin\u00fae, podr\u00edamos vernos en la necesidad de limitar temporalmente la atenci\u00f3n de asuntos no urgentes.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*More than 10 days past due*",
                "",
                "Dear client,",
                "",
                "We inform you that your account is more than 10 days past due.",
                "",
                "In order to keep the ordinary provision of our services active, we kindly ask you to regularize the outstanding payment as soon as possible.",
                "",
                "If the delay continues, we may need to temporarily limit our attention to non-urgent matters.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        },
        MORE_THAN_20: {
            es: [
                "*Mora mayor a 20 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le informamos que su cuenta presenta un atraso mayor a 20 d\u00edas.",
                "",
                "Por esta raz\u00f3n, y hasta que se regularice el pago pendiente, la atenci\u00f3n quedar\u00e1 limitada temporalmente a asuntos urgentes o vencimientos que no puedan diferirse.",
                "",
                "Una vez regularizada la cuenta, reanudaremos la prestaci\u00f3n ordinaria de nuestros servicios.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*More than 20 days past due*",
                "",
                "Dear client,",
                "",
                "We inform you that your account is more than 20 days past due.",
                "",
                "For this reason, and until the outstanding payment is regularized, our attention will be temporarily limited to urgent matters or deadlines that cannot be deferred.",
                "",
                "Once the account is regularized, we will resume the ordinary provision of our services.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        },
        MORE_THAN_30: {
            es: [
                "*Mora mayor a 30 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le informamos que su cuenta presenta un atraso mayor a 30 d\u00edas.",
                "",
                "Por esta raz\u00f3n, la prestaci\u00f3n de nuestros servicios quedar\u00e1 suspendida temporalmente hasta que se regularice el pago pendiente.",
                "",
                "Una vez recibida la regularizaci\u00f3n correspondiente, con gusto reanudaremos la atenci\u00f3n de sus asuntos.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*More than 30 days past due*",
                "",
                "Dear client,",
                "",
                "We inform you that your account is more than 30 days past due.",
                "",
                "For this reason, the provision of our services will be temporarily suspended until the outstanding payment is regularized.",
                "",
                "Once the corresponding regularization has been received, we will gladly resume attention to your matters.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        }
    },
    concluded: {
        DAYS_1_TO_10: {
            es: [
                "*Mora de 1 a 10 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le recordamos que el pago correspondiente contin\u00faa pendiente y su fecha de vencimiento ya transcurri\u00f3.",
                "",
                "Le agradeceremos confirmarnos si podemos contar con el pago el d\u00eda de hoy, o en su caso indicarnos cualquier duda que est\u00e9 impidiendo regularizarlo.",
                "",
                "Agradeceremos mucho que pueda atender este asunto a la brevedad.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*1 to 10 days past due*",
                "",
                "Dear client,",
                "",
                "We would like to remind you that the corresponding payment remains outstanding and its due date has already passed.",
                "",
                "We would appreciate your confirmation as to whether we can count on receiving the payment today, or, if applicable, whether there is any question preventing its regularization.",
                "",
                "We would greatly appreciate your prompt attention to this matter.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        },
        MORE_THAN_10: {
            es: [
                "*Mora mayor a 10 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le informamos que el pago pendiente presenta un atraso mayor a 10 d\u00edas.",
                "",
                "Hemos dado seguimiento al asunto y agradeceremos que nos confirme si podemos contar con el pago el d\u00eda de hoy. En caso de existir alguna duda o situaci\u00f3n que lo est\u00e9 impidiendo, le pedimos hac\u00e9rnoslo saber de inmediato.",
                "",
                "Agradeceremos mucho que atienda este asunto con car\u00e1cter urgente.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*More than 10 days past due*",
                "",
                "Dear client,",
                "",
                "We inform you that the outstanding payment is more than 10 days past due.",
                "",
                "We have followed up on this matter and would appreciate your confirmation as to whether we can count on receiving the payment today. If there is any question or situation preventing payment, please let us know immediately.",
                "",
                "We would greatly appreciate your urgent attention to this matter.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        },
        MORE_THAN_20: {
            es: [
                "*Mora mayor a 20 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le informamos que el pago pendiente presenta un atraso mayor a 20 d\u00edas.",
                "",
                "A la fecha no hemos recibido la regularizaci\u00f3n correspondiente, por lo que le solicitamos confirmar si podemos contar con el pago el d\u00eda de hoy.",
                "",
                "Agradeceremos atender este asunto de forma urgente, a fin de evitar gestiones adicionales de cobranza y seguimiento administrativo.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*More than 20 days past due*",
                "",
                "Dear client,",
                "",
                "We inform you that the outstanding payment is more than 20 days past due.",
                "",
                "To date, we have not received the corresponding regularization, so we ask you to confirm whether we can count on receiving the payment today.",
                "",
                "We would appreciate your urgent attention to this matter in order to avoid additional collection and administrative follow-up actions.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        },
        MORE_THAN_30: {
            es: [
                "*Mora mayor a 30 d\u00edas*",
                "",
                "Estimado cliente,",
                "",
                "Le informamos que el pago pendiente presenta un atraso mayor a 30 d\u00edas.",
                "",
                "A pesar del seguimiento realizado, no hemos recibido la regularizaci\u00f3n correspondiente. Por lo anterior, le solicitamos confirmar de inmediato si podemos contar con el pago el d\u00eda de hoy.",
                "",
                "Este asunto requiere atenci\u00f3n urgente, a fin de evitar gestiones adicionales de cobranza y el escalamiento administrativo correspondiente.",
                "",
                "Atentamente,",
                "*RUSCONI CONSULTING*"
            ].join("\n"),
            en: [
                "*More than 30 days past due*",
                "",
                "Dear client,",
                "",
                "We inform you that the outstanding payment is more than 30 days past due.",
                "",
                "Despite our follow-up, we have not received the corresponding regularization. Therefore, we ask you to immediately confirm whether we can count on receiving the payment today.",
                "",
                "This matter requires urgent attention in order to avoid additional collection actions and the corresponding administrative escalation.",
                "",
                "Sincerely,",
                "*RUSCONI CONSULTING*"
            ].join("\n")
        }
    }
};
const ACTIVE_COLUMN_WIDTHS = [
    "120px",
    "260px",
    "150px",
    "110px",
    "360px",
    "170px",
    "150px",
    "220px",
    "180px",
    "220px",
    "220px",
    "260px",
    "140px"
];
const EMPTY_PROFESSIONAL_SERVICES_FIELDS = {
    language: "ES",
    clientKind: "PERSONA_MORAL",
    clientRfc: "",
    legalRepresentative: "",
    clientAddress: "",
    clientPhone: "",
    clientEmail: "",
    startDate: "",
    endDate: "",
    signingDate: ""
};
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function hasPermission(permissions, permission) {
    return Boolean(permissions?.includes("*") || permissions?.includes(permission));
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
const COMMISSION_RECEIVER_ALIAS_PAIRS = [
    ["Derecho financiero (lider)", "Der Financiero (lider)"],
    ["Derecho financiero (colaborador)", "Der Financiero (colaborador)"],
    ["Cumplimiento fiscal (lider)", "Compliance Fiscal (lider)"],
    ["Cumplimiento fiscal (colaborador)", "Compliance Fiscal (colaborador)"],
    ["Fiscal de Cumplimiento (lider)", "Compliance Fiscal (lider)"],
    ["Fiscal de Cumplimiento (colaborador)", "Compliance Fiscal (colaborador)"]
];
const COMMISSION_RECEIVER_NAME_BY_KEY = new Map();
for (const name of COMMISSION_SECTIONS) {
    COMMISSION_RECEIVER_NAME_BY_KEY.set(normalizeComparableText(name), name);
}
for (const [alias, canonicalName] of COMMISSION_RECEIVER_ALIAS_PAIRS) {
    COMMISSION_RECEIVER_NAME_BY_KEY.set(normalizeComparableText(alias), canonicalName);
}
function getCanonicalCommissionReceiverName(value) {
    const name = normalizeText(value);
    if (!name) {
        return "";
    }
    return COMMISSION_RECEIVER_NAME_BY_KEY.get(normalizeComparableText(name)) ?? name;
}
function getRequiredCommissionReceiverId(name) {
    const slug = normalizeComparableText(name)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `required-${slug}`;
}
function buildRequiredCommissionReceiver(name) {
    return {
        id: getRequiredCommissionReceiverId(name),
        name,
        active: true,
        createdAt: "1970-01-01T00:00:00.000Z"
    };
}
function getCommissionReceiverOptions(receivers) {
    const byKey = new Map();
    const addReceiver = (receiver) => {
        if (!receiver.active) {
            return;
        }
        const name = getCanonicalCommissionReceiverName(receiver.name);
        if (!name) {
            return;
        }
        const key = normalizeComparableText(name);
        if (!byKey.has(key)) {
            byKey.set(key, { ...receiver, name });
        }
    };
    receivers.forEach(addReceiver);
    COMMISSION_SECTIONS.forEach((name) => addReceiver(buildRequiredCommissionReceiver(name)));
    return [...byKey.values()].sort((left, right) => left.name.localeCompare(right.name, "es", { sensitivity: "base" }));
}
function getSearchWords(value) {
    return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}
function matchesSearchWords(words, values) {
    if (words.length === 0) {
        return true;
    }
    const haystack = normalizeComparableText(values.map((value) => String(value ?? "")).join(" "));
    return words.every((word) => haystack.includes(word));
}
function formatCurrency(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(Number(value || 0));
}
function parseCurrencyValue(value) {
    const parsed = Number(value.replace(/,/g, "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}
function formatCurrencyDraftValue(value) {
    return Number.isFinite(value) ? String(value) : "0";
}
function CurrencyInput({ value, readOnly = false, className = "", onValueChange, onValueCommit }) {
    const [focused, setFocused] = useState(false);
    const [draft, setDraft] = useState(formatCurrency(value));
    useEffect(() => {
        if (!focused) {
            setDraft(formatCurrency(value));
        }
    }, [focused, value]);
    const classNames = [
        "finance-input",
        "finance-input-number",
        "finance-input-currency",
        readOnly ? "finance-input-readonly" : "",
        className
    ].filter(Boolean).join(" ");
    return (_jsx("input", { className: classNames, inputMode: "decimal", readOnly: readOnly, type: "text", value: focused && !readOnly ? draft : formatCurrency(value), onFocus: () => {
            if (!readOnly) {
                setFocused(true);
                setDraft(formatCurrencyDraftValue(value));
            }
        }, onChange: (event) => {
            const nextDraft = event.target.value;
            const nextValue = parseCurrencyValue(nextDraft);
            setDraft(nextDraft);
            onValueChange?.(nextValue);
        }, onBlur: () => {
            if (readOnly) {
                return;
            }
            const nextValue = parseCurrencyValue(draft);
            setFocused(false);
            setDraft(formatCurrency(nextValue));
            onValueCommit?.(nextValue);
        } }));
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function formatDateList(values) {
    const dates = values.map(toDateInput).filter(Boolean);
    return dates.length > 0 ? dates.join(" / ") : "-";
}
function downloadBlobFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}
async function fetchOptionalRows(request) {
    try {
        return await request;
    }
    catch {
        return [];
    }
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
function getTeamLabel(team) {
    return TEAM_OPTIONS.find((option) => option.key === team)?.label ?? "";
}
function isSalesTeamUser(user) {
    if (!user) {
        return false;
    }
    const normalizedAssignments = [
        user.legacyTeam,
        user.secondaryLegacyTeam,
        user.specificRole,
        user.secondarySpecificRole
    ].map(normalizeComparableText);
    return user.team === "SALES" ||
        user.secondaryTeam === "SALES" ||
        normalizedAssignments.includes("ventas");
}
function isEmrtUser(user) {
    return [user?.shortName, user?.username].some((value) => normalizeComparableText(value) === "emrt");
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
function isPaymentReceived(method, received) {
    return method === "T" || (method === "E" && received === true);
}
function hasPaymentDate(value) {
    return Boolean(toDateInput(value));
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
function getClientDelinquencyMessage(status, serviceStatus) {
    if (!status || status === "CURRENT") {
        return { es: "", en: "" };
    }
    return CLIENT_DELINQUENCY_MESSAGES[serviceStatus][status] ?? { es: "", en: "" };
}
async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand("copy");
    }
    finally {
        textarea.remove();
    }
}
function calculateFinanceStats(record) {
    const totalPaidMxn = getReceivedPaymentsMxn(record);
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
    const normalizedPatch = { ...patch };
    const nullableFields = [
        "clientNumber",
        "quoteNumber",
        "responsibleTeam",
        "workingConcepts",
        "nextPaymentDate",
        "nextPaymentNotes",
        "paymentDate1",
        "paymentDate2",
        "paymentDate3",
        "expenseNotes1",
        "expenseNotes2",
        "expenseNotes3",
        "clientCommissionRecipient",
        "closingCommissionRecipient",
        "milestone",
        "financeComments"
    ];
    nullableFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
            normalizedPatch[field] = patch[field] ?? undefined;
        }
    });
    return normalizedPatch;
}
function MonthSummaryCards({ records }) {
    const totals = useMemo(() => {
        return records.reduce((acc, record) => {
            const stats = calculateFinanceStats(record);
            const expectedThisMonthMxn = Number(record.conceptFeesMxn || 0);
            return {
                income: acc.income + stats.totalPaidMxn,
                netRemainingExpectedThisMonth: acc.netRemainingExpectedThisMonth + expectedThisMonthMxn,
                highCollectionProbability: acc.highCollectionProbability + (record.highCollectionProbability ? expectedThisMonthMxn : 0),
                lowCollectionProbability: acc.lowCollectionProbability + (record.lowCollectionProbability ? expectedThisMonthMxn : 0)
            };
        }, {
            income: 0,
            netRemainingExpectedThisMonth: 0,
            highCollectionProbability: 0,
            lowCollectionProbability: 0
        });
    }, [records]);
    const cards = [
        { label: "Ingresos cobrados", value: totals.income, accent: "finance-card-green" },
        { label: "Cuentas por cobrar totales de este mes", value: totals.netRemainingExpectedThisMonth, accent: "finance-card-red" },
        { label: "Honorarios con altas probabilidades de cobro", value: totals.highCollectionProbability, accent: "finance-card-blue" },
        { label: "Honorarios con bajas probabilidades de cobro", value: totals.lowCollectionProbability, accent: "finance-card-orange" }
    ];
    return (_jsx("div", { className: "finance-summary-grid", children: cards.map((card) => (_jsxs("article", { className: `finance-summary-card ${card.accent}`, children: [_jsx("span", { children: card.label }), _jsx("strong", { children: formatCurrency(card.value) })] }, card.label))) }));
}
export function FinancesPage() {
    const { user } = useAuth();
    const canReadFinances = canReadModule(user, "finances");
    const canWriteFinances = canWriteModule(user, "finances");
    const canReadInternalContracts = hasPermission(user?.permissions, "internal-contracts:read") || hasPermission(user?.permissions, "internal-contracts:write");
    const isSuperadmin = user?.role === "SUPERADMIN" || user?.legacyRole === "SUPERADMIN";
    const isSalesMonthlyViewer = isSalesTeamUser(user) && !canWriteFinances && !isSuperadmin;
    const canDeleteFinanceRecords = isSuperadmin || canWriteFinances;
    const canSelectReceivedCash = isEmrtUser(user);
    const pageRef = useRef(null);
    const tabsPanelRef = useRef(null);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const [activeTab, setActiveTab] = useState("monthly-view");
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [records, setRecords] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [viewingSnapshot, setViewingSnapshot] = useState(null);
    const [activeMatters, setActiveMatters] = useState([]);
    const [professionalContracts, setProfessionalContracts] = useState([]);
    const [clients, setClients] = useState([]);
    const [receivers, setReceivers] = useState([]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [currentMonthMatchKeys, setCurrentMonthMatchKeys] = useState(new Set());
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [contractFormOpen, setContractFormOpen] = useState(false);
    const [contractPrefillLoading, setContractPrefillLoading] = useState(false);
    const [contractGenerating, setContractGenerating] = useState(false);
    const [contractActionKey, setContractActionKey] = useState(null);
    const [contractFlash, setContractFlash] = useState(null);
    const [contractPrefill, setContractPrefill] = useState(null);
    const [contractForm, setContractForm] = useState(EMPTY_PROFESSIONAL_SERVICES_FIELDS);
    const [wordSearch, setWordSearch] = useState("");
    const [clientSearch, setClientSearch] = useState("");
    const [copiedClientMessageKey, setCopiedClientMessageKey] = useState(null);
    const copiedClientMessageTimeoutRef = useRef(null);
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
        const source = event.currentTarget;
        const shell = source.closest(".finance-table-shell-sticky");
        if (!shell) {
            return;
        }
        shell.querySelectorAll(".finance-table-scroll, .finance-table-x-nav").forEach((element) => {
            if (element !== source && element.scrollLeft !== source.scrollLeft) {
                element.scrollLeft = source.scrollLeft;
            }
        });
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
    const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
    const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
    const commissionReceiverOptions = useMemo(() => getCommissionReceiverOptions(receivers), [receivers]);
    const filteredActiveMatters = useMemo(() => sortedActiveMatters.filter((matter) => {
        const effectiveClientNumber = resolveClientNumber(matter.clientName, matter.clientNumber);
        return (matchesSearchWords(clientSearchWords, [matter.clientName, effectiveClientNumber]) &&
            matchesSearchWords(wordSearchWords, [
                effectiveClientNumber,
                matter.clientName,
                matter.quoteNumber,
                getMatterTypeLabel(matter.matterType),
                matter.subject,
                formatCurrency(matter.totalFeesMxn),
                matter.commissionAssignee,
                getTeamLabel(matter.responsibleTeam),
                toDateInput(matter.nextPaymentDate),
                getMonthName(matter.transferMonth),
                matter.transferYear
            ]));
    }), [clientNumberByName, clientSearchWords, sortedActiveMatters, wordSearchWords]);
    const filteredRecords = useMemo(() => records.filter((record) => {
        const stats = calculateFinanceStats(record);
        const effectiveClientNumber = resolveClientNumber(record.clientName, record.clientNumber);
        return (matchesSearchWords(clientSearchWords, [record.clientName, effectiveClientNumber]) &&
            matchesSearchWords(wordSearchWords, [
                effectiveClientNumber,
                record.clientName,
                record.quoteNumber,
                getMatterTypeLabel(record.matterType),
                record.subject,
                getTeamLabel(record.responsibleTeam),
                record.workingConcepts,
                record.nextPaymentNotes,
                record.clientCommissionRecipient,
                record.closingCommissionRecipient,
                record.milestone,
                record.financeComments,
                toDateInput(record.nextPaymentDate),
                formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3]),
                record.totalMatterMxn,
                record.conceptFeesMxn,
                record.previousPaymentsMxn,
                stats.remainingMxn,
                stats.totalPaidMxn,
                stats.dueTodayMxn,
                stats.netFeesMxn,
                stats.salesCommissionMxn,
                stats.netProfitMxn,
                record.pctLitigation,
                record.pctCorporateLabor,
                record.pctSettlements,
                record.pctFinancialLaw,
                record.pctTaxCompliance,
                record.concluded
            ]));
    }), [clientNumberByName, clientSearchWords, records, wordSearchWords]);
    const uniqueMatters = useMemo(() => filteredActiveMatters.filter((matter) => matter.matterType !== "RETAINER"), [filteredActiveMatters]);
    const retainerMatters = useMemo(() => filteredActiveMatters.filter((matter) => matter.matterType === "RETAINER"), [filteredActiveMatters]);
    const professionalContractsByMatterId = useMemo(() => {
        const next = new Map();
        professionalContracts
            .filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES" && contract.sourceMatterId)
            .forEach((contract) => {
            next.set(contract.sourceMatterId, contract);
        });
        return next;
    }, [professionalContracts]);
    function upsertProfessionalContract(contract) {
        setProfessionalContracts((current) => {
            const others = current.filter((entry) => entry.id !== contract.id);
            return [contract, ...others];
        });
    }
    function closeContractForm() {
        setContractFormOpen(false);
        setContractPrefillLoading(false);
        setContractGenerating(false);
        setContractActionKey(null);
        setContractPrefill(null);
        setContractForm(EMPTY_PROFESSIONAL_SERVICES_FIELDS);
        setContractFlash(null);
    }
    function getContractStatus(contract) {
        if (!contract) {
            return {
                label: "Pendiente",
                className: "finance-contract-status finance-contract-status-missing"
            };
        }
        if (contract.signatureStatus === "SIGNED") {
            return {
                label: "Firmado",
                className: "finance-contract-status finance-contract-status-signed"
            };
        }
        return {
            label: "No firmado",
            className: "finance-contract-status finance-contract-status-pending"
        };
    }
    async function handleContractDownload(contractId, format) {
        const actionKey = `${contractId}:${format}`;
        setContractActionKey(actionKey);
        setError(null);
        try {
            const suffix = format === "pdf" ? "?format=pdf" : "?format=docx";
            const { blob, filename } = await apiDownload(`/internal-contracts/${encodeURIComponent(contractId)}/document${suffix}`);
            downloadBlobFile(blob, filename ?? `contrato.${format === "pdf" ? "pdf" : "docx"}`);
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
        finally {
            setContractActionKey(null);
        }
    }
    function updateContractFormField(field, value) {
        setContractForm((current) => ({
            ...current,
            [field]: value,
            ...(field === "clientKind" && value === "PERSONA_FISICA" ? { legalRepresentative: "" } : {})
        }));
        setContractFlash(null);
    }
    async function handleOpenContractForm(matter) {
        setContractFormOpen(true);
        setContractPrefillLoading(true);
        setContractGenerating(false);
        setContractActionKey(null);
        setContractFlash(null);
        setContractPrefill(null);
        setError(null);
        try {
            const result = await apiGet(`/internal-contracts/professional-services/prefill/${encodeURIComponent(matter.id)}`);
            setContractPrefill(result);
            setContractForm(result.fields);
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
            setContractFormOpen(false);
        }
        finally {
            setContractPrefillLoading(false);
        }
    }
    async function handleGenerateContract(event) {
        event.preventDefault();
        if (!contractPrefill) {
            return;
        }
        setContractGenerating(true);
        setContractFlash(null);
        setError(null);
        try {
            const created = await apiPost("/internal-contracts/professional-services/generate", {
                matterId: contractPrefill.matterId,
                fields: contractForm
            });
            upsertProfessionalContract(created);
            setContractPrefill((current) => current
                ? {
                    ...current,
                    contractId: created.id,
                    signatureStatus: created.signatureStatus ?? "PENDING",
                    availableFormats: created.availableFormats
                }
                : current);
            setContractFlash("Contrato generado y guardado en Administracion de contratos internos.");
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
        finally {
            setContractGenerating(false);
        }
    }
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
            setProfessionalContracts([]);
            setLoading(false);
            setError("No tienes permisos para consultar Finanzas.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [matters, nextClients, nextContracts] = await Promise.all([
                apiGet("/matters"),
                canWriteFinances ? apiGet("/clients") : Promise.resolve([]),
                canReadInternalContracts ? fetchOptionalRows(apiGet("/internal-contracts")) : Promise.resolve([])
            ]);
            setClients(nextClients);
            setProfessionalContracts(nextContracts.filter((contract) => contract.contractType === "PROFESSIONAL_SERVICES"));
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
        if (isSalesMonthlyViewer && activeTab !== "monthly-view") {
            setActiveTab("monthly-view");
        }
    }, [activeTab, isSalesMonthlyViewer]);
    useEffect(() => {
        return () => {
            if (copiedClientMessageTimeoutRef.current !== null) {
                window.clearTimeout(copiedClientMessageTimeoutRef.current);
            }
        };
    }, []);
    useEffect(() => {
        if (isSalesMonthlyViewer && activeTab !== "monthly-view") {
            return;
        }
        if (activeTab === "monthly-view") {
            void loadMonthlyView();
            return;
        }
        if (activeTab === "snapshots") {
            void loadSnapshotsView();
            return;
        }
        void loadActiveMattersView();
    }, [activeTab, canReadFinances, canReadInternalContracts, isSalesMonthlyViewer, selectedMonth, selectedYear]);
    useEffect(() => {
        if (activeTab !== "active-matters" && contractFormOpen) {
            closeContractForm();
        }
    }, [activeTab, contractFormOpen]);
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
        const isDateUrgent = Boolean(record.nextPaymentDate && toDateInput(record.nextPaymentDate) <= todayValue && stats.dueTodayMxn > 1);
        const isPctInvalid = stats.pctSum !== 100;
        const reasons = [];
        if (missing.length > 0) {
            reasons.push(`Faltan datos requeridos: ${missing.join(", ")}.`);
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
            setRecords((current) => current.map((record) => {
                if (record.id !== recordId) {
                    return record;
                }
                const nextRecord = { ...record, ...updated };
                ["paymentMethod", "paymentMethod2", "paymentMethod3"].forEach((field) => {
                    if (Object.prototype.hasOwnProperty.call(patch, field) && !Object.prototype.hasOwnProperty.call(updated, field)) {
                        nextRecord[field] = patch[field] ?? record[field];
                    }
                });
                ["paymentReceived", "paymentReceived2", "paymentReceived3"].forEach((field) => {
                    if (Object.prototype.hasOwnProperty.call(patch, field) && !Object.prototype.hasOwnProperty.call(updated, field)) {
                        nextRecord[field] = patch[field] ?? record[field];
                    }
                });
                return nextRecord;
            }));
        }
        catch (caughtError) {
            setError(toErrorMessage(caughtError));
        }
    }
    function setCollectionProbability(record, probability, checked) {
        const patch = probability === "high"
            ? {
                highCollectionProbability: checked,
                lowCollectionProbability: checked ? false : record.lowCollectionProbability
            }
            : {
                highCollectionProbability: checked ? false : record.highCollectionProbability,
                lowCollectionProbability: checked
            };
        updateRecordLocal(record.id, patch);
        void persistRecordPatch(record.id, patch);
    }
    async function handleCopyClientMessage(message, copyKey) {
        try {
            await copyTextToClipboard(message);
            setCopiedClientMessageKey(copyKey);
            if (copiedClientMessageTimeoutRef.current !== null) {
                window.clearTimeout(copiedClientMessageTimeoutRef.current);
            }
            copiedClientMessageTimeoutRef.current = window.setTimeout(() => {
                setCopiedClientMessageKey((current) => (current === copyKey ? null : current));
                copiedClientMessageTimeoutRef.current = null;
            }, 1500);
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
            const visibleIds = filteredRecords.map((record) => record.id);
            if (visibleIds.length === 0) {
                return current;
            }
            const hasEveryVisibleRecord = visibleIds.every((id) => current.has(id));
            const next = new Set(current);
            visibleIds.forEach((id) => {
                if (hasEveryVisibleRecord) {
                    next.delete(id);
                }
                else {
                    next.add(id);
                }
            });
            return next;
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
        const allVisibleSelected = filteredRecords.length > 0 && filteredRecords.every((record) => selectedIds.has(record.id));
        const totals = filteredRecords.reduce((acc, record) => {
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
                salesCommissionMxn: acc.salesCommissionMxn + stats.salesCommissionMxn,
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
            salesCommissionMxn: 0,
            netProfitMxn: 0
        });
        const renderMonthlyColGroup = () => (_jsx("colgroup", { children: MONTHLY_COLUMN_WIDTHS.map((width, index) => (_jsx("col", { style: { width } }, `finance-monthly-col-${index}`))) }));
        const renderMonthlyHeader = () => (_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: _jsx("input", { type: "checkbox", checked: allVisibleSelected, onChange: toggleAllRecords }) }), _jsx("th", { className: "finance-row-index", children: "No." }), _jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Equipo Responsable" }), _jsx("th", { children: "Total Asunto" }), _jsx("th", { children: "Conceptos trabajando" }), _jsx("th", { children: "Honorarios pagaderos este mes" }), _jsx("th", { children: "Fecha de proximo pago" }), _jsx("th", { children: "Detalle Fecha" }), _jsx("th", { children: "\u00bfEn mora?" }), _jsx("th", { children: "Mensaje para clientes de servicios en curso" }), _jsx("th", { children: "Mensaje para clientes de servicios concluidos" }), _jsx("th", { children: "Pagado este mes" }), _jsx("th", { children: "Fecha Pago Real" }), _jsx("th", { children: "M\u00E9todo de pago" }), _jsx("th", { children: "Recibido" }), _jsx("th", { children: "Adeudado hoy" }), _jsx("th", { children: "Alta probabilidad de cobro" }), _jsx("th", { children: "Baja probabilidad de cobro" }), _jsx("th", { children: "Honorarios netos cobrados este mes" }), _jsx("th", { children: "Comision cliente 20%" }), _jsx("th", { children: "Para quien" }), _jsx("th", { children: "Comision cierre 10%" }), _jsx("th", { children: "Para quien" }), _jsx("th", { children: "Ingresos menos 20% y 10%" }), _jsx("th", { children: "% Litigio" }), _jsx("th", { children: "% Corp-Lab" }), _jsx("th", { children: "% Convenios" }), _jsx("th", { children: "% Der Fin" }), _jsx("th", { children: "% Compl. Fis." }), _jsx("th", { children: "SUM %" }), _jsx("th", { children: "COM. EJEC. LITIGIO (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. LITIGIO (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. CORP-LAB (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. CORP-LAB (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. CONVENIOS (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. CONVENIOS (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. DER FIN (LIDER 10%)" }), _jsx("th", { children: "COM. EJEC. DER FIN (COLAB 1%)" }), _jsx("th", { children: "COM. EJEC. COMPL FIS (LIDER 8%)" }), _jsx("th", { children: "COM. EJEC. COMPL FIS (COLAB 1%)" }), _jsx("th", { children: "Com. Com. Cliente (1% Neto)" }), _jsx("th", { children: "Com. Finanzas (1% Neto)" }), _jsx("th", { children: "Com. Ventas (1% primer pago)" }), _jsx("th", { children: "Utilidad neta" }), _jsx("th", { children: "Hito conclusion" }), _jsx("th", { children: "Concluyo?" }), _jsx("th", { children: "Comentarios" }), _jsx("th", { children: "Accion" })] }) }));
        const renderPaymentMethodSelect = (record, field, receivedField, paymentDate) => {
            if (!hasPaymentDate(paymentDate)) {
                return _jsx("div", { "aria-hidden": "true", className: "finance-payment-method-placeholder" });
            }
            return (_jsx("select", { className: `finance-input ${record[receivedField] === true ? "finance-input-readonly" : ""}`.trim(), disabled: record[receivedField] === true, value: record[field] ?? "blank", onChange: (event) => {
                    const paymentMethod = event.target.value;
                    const patch = { [field]: paymentMethod };
                    if (paymentMethod !== "E" && canSelectReceivedCash) {
                        patch[receivedField] = false;
                    }
                    updateRecordLocal(record.id, patch);
                    void persistRecordPatch(record.id, patch);
                }, children: PAYMENT_METHOD_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }));
        };
        const renderPaymentReceivedCheckbox = (record, methodField, receivedField, paymentDate) => {
            if (!hasPaymentDate(paymentDate) || record[methodField] !== "E") {
                return _jsx("div", { "aria-hidden": "true", className: "finance-payment-method-placeholder" });
            }
            return (_jsx("label", { className: "finance-received-checkbox", title: canSelectReceivedCash ? "Marcar efectivo recibido" : "Solo EMRT puede marcar efectivo recibido", children: _jsx("input", { checked: record[receivedField] === true, disabled: !canSelectReceivedCash, onChange: (event) => {
                        const patch = { [receivedField]: event.target.checked };
                        updateRecordLocal(record.id, patch);
                        void persistRecordPatch(record.id, patch);
                    }, type: "checkbox" }) }));
        };
        const renderClientMessage = (record, serviceStatus) => {
            const messages = getClientDelinquencyMessage(record.delinquencyStatus, serviceStatus);
            const spanishCopyKey = `${record.id}:${serviceStatus}:es`;
            const englishCopyKey = `${record.id}:${serviceStatus}:en`;
            if (!messages.es) {
                return _jsx("div", { "aria-hidden": "true", className: "finance-client-message-empty" });
            }
            return (_jsxs("div", { className: "finance-client-message-panel", children: [_jsx("textarea", { className: "finance-input finance-client-message", readOnly: true, value: messages.es }), _jsxs("div", { className: "finance-client-message-actions", children: [_jsx("button", { className: `secondary-button finance-inline-button finance-client-message-copy-button ${copiedClientMessageKey === spanishCopyKey ? "is-copied" : ""}`.trim(), onClick: () => void handleCopyClientMessage(messages.es, spanishCopyKey), type: "button", children: copiedClientMessageKey === spanishCopyKey ? "Copiado" : "Copiar mensaje en espa\u00f1ol" }), _jsx("button", { className: `secondary-button finance-inline-button finance-client-message-copy-button ${copiedClientMessageKey === englishCopyKey ? "is-copied" : ""}`.trim(), onClick: () => void handleCopyClientMessage(messages.en, englishCopyKey), type: "button", children: copiedClientMessageKey === englishCopyKey ? "Copiado" : "Copiar mensaje en ingl\u00e9s" })] })] }));
        };
        return (_jsx("fieldset", { className: "finance-readonly-fieldset", disabled: !canWriteFinances, children: _jsxs("div", { className: "finance-table-shell finance-table-shell-sticky", children: [_jsx("div", { className: "finance-table-x-nav", onScroll: handleFinanceTableScroll, "aria-label": "Desplazamiento horizontal de la tabla mensual", children: _jsx("div", { className: "finance-table-x-nav-spacer finance-table-monthly-x-nav-spacer" }) }), _jsx("div", { className: "finance-table-scroll", onScroll: handleFinanceTableScroll, children: _jsxs("table", { className: "finance-table finance-table-monthly", children: [renderMonthlyColGroup(), renderMonthlyHeader(), _jsxs("tbody", { children: [filteredRecords.map((record, index) => {
                                            const { stats, effectiveClientNumber, shouldHighlight, reason } = evaluateMonthlyRecord(record);
                                            const isSelected = selectedIds.has(record.id);
                                            const payment1Locked = record.paymentReceived === true;
                                            const payment2Locked = record.paymentReceived2 === true;
                                            const payment3Locked = record.paymentReceived3 === true;
                                            const rowClassName = `${shouldHighlight ? "finance-row-danger" : ""} ${isSelected ? "finance-row-selected" : ""}`.trim();
                                            return (_jsxs("tr", { className: rowClassName, title: reason, children: [_jsx("td", { className: "finance-cell-checkbox", children: _jsx("input", { type: "checkbox", checked: isSelected, onChange: () => toggleRecordSelection(record.id) }) }), _jsx("td", { className: "finance-row-index", children: index + 1 }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: effectiveClientNumber, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.clientName, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.quoteNumber ?? "", readOnly: true }) }), _jsx("td", { children: _jsx("span", { className: `finance-type-pill ${record.matterType === "RETAINER" ? "is-retainer" : ""}`, children: getMatterTypeLabel(record.matterType) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.subject, readOnly: true }) }), _jsx("td", { children: record.matterType === "RETAINER" ? (_jsxs("select", { className: "finance-input", value: record.responsibleTeam ?? "", onChange: (event) => {
                                                                const responsibleTeam = (event.target.value || null);
                                                                const percentages = getDefaultPercentages(responsibleTeam);
                                                                updateRecordLocal(record.id, { responsibleTeam, ...percentages });
                                                                void persistRecordPatch(record.id, { responsibleTeam, ...percentages });
                                                            }, children: [_jsx("option", { value: "", children: "Seleccionar..." }), TEAM_OPTIONS.filter((option) => ["LITIGATION", "CORPORATE_LABOR", "SETTLEMENTS", "FINANCIAL_LAW", "TAX_COMPLIANCE"].includes(option.key)).map((option) => (_jsx("option", { value: option.key, children: option.label }, option.key)))] })) : (_jsx("input", { className: "finance-input finance-input-readonly", value: TEAM_OPTIONS.find((option) => option.key === record.responsibleTeam)?.label ?? "", readOnly: true })) }), _jsx("td", { children: _jsx(CurrencyInput, { value: record.totalMatterMxn, readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input", value: record.workingConcepts ?? "", onChange: (event) => updateRecordLocal(record.id, { workingConcepts: event.target.value }), onBlur: (event) => void persistRecordPatch(record.id, { workingConcepts: event.target.value }) }) }), _jsx("td", { children: _jsx(CurrencyInput, { value: record.conceptFeesMxn, onValueChange: (conceptFeesMxn) => updateRecordLocal(record.id, { conceptFeesMxn }), onValueCommit: (conceptFeesMxn) => void persistRecordPatch(record.id, { conceptFeesMxn }) }) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", type: "date", value: toDateInput(record.nextPaymentDate), readOnly: true }) }), _jsx("td", { children: _jsx("input", { className: "finance-input", value: record.nextPaymentNotes ?? "", onChange: (event) => updateRecordLocal(record.id, { nextPaymentNotes: event.target.value }), onBlur: (event) => void persistRecordPatch(record.id, { nextPaymentNotes: event.target.value }) }) }), _jsx("td", { children: _jsx("select", { className: "finance-input", value: record.delinquencyStatus ?? "CURRENT", onChange: (event) => {
                                                                const delinquencyStatus = event.target.value;
                                                                updateRecordLocal(record.id, { delinquencyStatus });
                                                                void persistRecordPatch(record.id, { delinquencyStatus });
                                                            }, children: DELINQUENCY_STATUS_OPTIONS.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) }) }), _jsx("td", { children: renderClientMessage(record, "ongoing") }), _jsx("td", { children: renderClientMessage(record, "concluded") }), _jsx("td", { children: _jsxs("div", { className: "finance-stack", children: [_jsx(CurrencyInput, { value: record.paidThisMonthMxn, readOnly: payment1Locked, onValueChange: (paidThisMonthMxn) => updateRecordLocal(record.id, { paidThisMonthMxn }), onValueCommit: (paidThisMonthMxn) => void persistRecordPatch(record.id, { paidThisMonthMxn }) }), _jsx(CurrencyInput, { value: record.payment2Mxn, readOnly: payment2Locked, onValueChange: (payment2Mxn) => updateRecordLocal(record.id, { payment2Mxn }), onValueCommit: (payment2Mxn) => void persistRecordPatch(record.id, { payment2Mxn }) }), _jsx(CurrencyInput, { value: record.payment3Mxn, readOnly: payment3Locked, onValueChange: (payment3Mxn) => updateRecordLocal(record.id, { payment3Mxn }), onValueCommit: (payment3Mxn) => void persistRecordPatch(record.id, { payment3Mxn }) })] }) }), _jsx("td", { children: _jsxs("div", { className: "finance-stack", children: [_jsx("input", { className: `finance-input ${payment1Locked ? "finance-input-readonly" : ""}`.trim(), disabled: payment1Locked, type: "date", value: toDateInput(record.paymentDate1), onChange: (event) => updateRecordLocal(record.id, { paymentDate1: event.target.value || null }), onBlur: (event) => void persistRecordPatch(record.id, { paymentDate1: event.target.value || null }) }), _jsx("input", { className: `finance-input ${payment2Locked ? "finance-input-readonly" : ""}`.trim(), disabled: payment2Locked, type: "date", value: toDateInput(record.paymentDate2), onChange: (event) => updateRecordLocal(record.id, { paymentDate2: event.target.value || null }), onBlur: (event) => void persistRecordPatch(record.id, { paymentDate2: event.target.value || null }) }), _jsx("input", { className: `finance-input ${payment3Locked ? "finance-input-readonly" : ""}`.trim(), disabled: payment3Locked, type: "date", value: toDateInput(record.paymentDate3), onChange: (event) => updateRecordLocal(record.id, { paymentDate3: event.target.value || null }), onBlur: (event) => void persistRecordPatch(record.id, { paymentDate3: event.target.value || null }) })] }) }), _jsx("td", { children: _jsxs("div", { className: "finance-stack", children: [renderPaymentMethodSelect(record, "paymentMethod", "paymentReceived", record.paymentDate1), renderPaymentMethodSelect(record, "paymentMethod2", "paymentReceived2", record.paymentDate2), renderPaymentMethodSelect(record, "paymentMethod3", "paymentReceived3", record.paymentDate3)] }) }), _jsx("td", { children: _jsxs("div", { className: "finance-stack", children: [renderPaymentReceivedCheckbox(record, "paymentMethod", "paymentReceived", record.paymentDate1), renderPaymentReceivedCheckbox(record, "paymentMethod2", "paymentReceived2", record.paymentDate2), renderPaymentReceivedCheckbox(record, "paymentMethod3", "paymentReceived3", record.paymentDate3)] }) }), _jsx("td", { children: _jsx(CurrencyInput, { className: stats.dueTodayMxn > 0 ? "finance-cell-negative" : "", value: stats.dueTodayMxn, readOnly: true }) }), _jsx("td", { className: "finance-cell-checkbox", children: _jsx("input", { checked: record.highCollectionProbability, onChange: (event) => setCollectionProbability(record, "high", event.target.checked), type: "checkbox" }) }), _jsx("td", { className: "finance-cell-checkbox", children: _jsx("input", { checked: record.lowCollectionProbability, onChange: (event) => setCollectionProbability(record, "low", event.target.checked), type: "checkbox" }) }), _jsx("td", { children: _jsx(CurrencyInput, { className: "finance-cell-positive", value: stats.netFeesMxn, readOnly: true }) }), _jsx("td", { children: formatCurrency(stats.clientCommissionMxn) }), _jsx("td", { children: _jsxs("select", { className: "finance-input", value: getCanonicalCommissionReceiverName(record.clientCommissionRecipient), onChange: (event) => { const clientCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { clientCommissionRecipient }); void persistRecordPatch(record.id, { clientCommissionRecipient }); }, children: [_jsx("option", { value: "", children: "Seleccionar..." }), commissionReceiverOptions.map((receiver) => _jsx("option", { value: receiver.name, children: receiver.name }, receiver.id))] }) }), _jsx("td", { children: formatCurrency(stats.closingCommissionMxn) }), _jsx("td", { children: _jsxs("select", { className: "finance-input", value: getCanonicalCommissionReceiverName(record.closingCommissionRecipient), onChange: (event) => { const closingCommissionRecipient = event.target.value || null; updateRecordLocal(record.id, { closingCommissionRecipient }); void persistRecordPatch(record.id, { closingCommissionRecipient }); }, children: [_jsx("option", { value: "", children: "Seleccionar..." }), commissionReceiverOptions.map((receiver) => _jsx("option", { value: receiver.name, children: receiver.name }, receiver.id))] }) }), _jsx("td", { className: "finance-total-cell", children: formatCurrency(stats.netFeesMxn - stats.clientCommissionMxn - stats.closingCommissionMxn) }), [
                                                        ["pctLitigation", record.pctLitigation],
                                                        ["pctCorporateLabor", record.pctCorporateLabor],
                                                        ["pctSettlements", record.pctSettlements],
                                                        ["pctFinancialLaw", record.pctFinancialLaw],
                                                        ["pctTaxCompliance", record.pctTaxCompliance]
                                                    ].map(([field, value]) => (_jsx("td", { children: _jsx("input", { className: "finance-input finance-input-number", type: "number", min: "0", max: "100", step: "1", value: value, onChange: (event) => updateRecordLocal(record.id, { [field]: Number(event.target.value || 0) }), onBlur: (event) => void persistRecordPatch(record.id, { [field]: Number(event.target.value || 0) }) }) }, field))), _jsxs("td", { className: stats.pctSum === 100 ? "finance-pct-ok" : "finance-pct-danger", children: [stats.pctSum, "%"] }), _jsx("td", { children: formatCurrency(stats.litigationLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.litigationCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.corporateLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.corporateCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.settlementsLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.settlementsCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.financialLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.financialCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.taxLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.taxCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.clientRelationsCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.financeCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.salesCommissionMxn) }), _jsx("td", { className: "finance-profit-cell", children: formatCurrency(stats.netProfitMxn) }), _jsx("td", { children: _jsx("input", { className: "finance-input finance-input-readonly", value: record.milestone ?? "", readOnly: true }) }), _jsx("td", { className: "finance-cell-checkbox", children: _jsx("input", { type: "checkbox", checked: record.concluded, onChange: (event) => { updateRecordLocal(record.id, { concluded: event.target.checked }); void persistRecordPatch(record.id, { concluded: event.target.checked }); } }) }), _jsx("td", { children: _jsx("textarea", { className: "finance-input finance-textarea", value: record.financeComments ?? "", onChange: (event) => updateRecordLocal(record.id, { financeComments: event.target.value }), onBlur: (event) => void persistRecordPatch(record.id, { financeComments: event.target.value }) }) }), _jsx("td", { children: _jsx("button", { className: "danger-button finance-inline-button", type: "button", onClick: () => void handleDeleteRecord(record.id), children: "Borrar" }) })] }, record.id));
                                        }), !loading && filteredRecords.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 53, children: "Sin registros para esta fecha." }) })) : null] }), _jsx("tfoot", { children: _jsxs("tr", { className: "finance-total-row", children: [_jsx("td", { colSpan: 8, children: "Totales" }), _jsx("td", { children: formatCurrency(totals.totalMatterMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.conceptFeesMxn) }), _jsx("td", { colSpan: 2 }), _jsx("td", {}), _jsx("td", {}), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.totalPaidMxn) }), _jsx("td", {}), _jsx("td", {}), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.dueTodayMxn) }), _jsx("td", {}), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.netFeesMxn) }), _jsx("td", { children: formatCurrency(totals.clientCommissionMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.closingCommissionMxn) }), _jsx("td", {}), _jsx("td", { children: formatCurrency(totals.netFeesMxn - totals.clientCommissionMxn - totals.closingCommissionMxn) }), _jsx("td", { colSpan: 6 }), _jsx("td", { children: formatCurrency(totals.litigationLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.litigationCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.corporateLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.corporateCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.settlementsLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.settlementsCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.financialLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.financialCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.taxLeaderCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.taxCollaboratorCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.clientRelationsCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.financeCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.salesCommissionMxn) }), _jsx("td", { children: formatCurrency(totals.netProfitMxn) }), _jsx("td", { colSpan: 4 })] }) })] }) })] }) }));
    }
    function renderActiveMattersTable(items, variant) {
        const renderActiveColGroup = () => (_jsx("colgroup", { children: ACTIVE_COLUMN_WIDTHS.map((width, index) => (_jsx("col", { style: { width } }, `finance-active-col-${index}`))) }));
        const renderActiveHeader = () => (_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cotizacion" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Honorarios Totales" }), _jsx("th", { children: "Comision cierre" }), _jsx("th", { children: "Equipo Responsable" }), _jsx("th", { children: "Generar contrato" }), _jsx("th", { children: "Estatus del contrato de PSP" }), _jsx("th", { children: "Fecha de proximo pago" }), _jsx("th", { children: "Destino (Finanzas)" }), _jsx("th", { children: "Accion" })] }) }));
        return (_jsx("fieldset", { className: "finance-readonly-fieldset", disabled: !canWriteFinances, children: _jsx("div", { className: "finance-active-table-shell", children: _jsxs("table", { className: "finance-active-table", children: [renderActiveColGroup(), renderActiveHeader(), _jsxs("tbody", { children: [items.map((matter) => {
                                    const highlight = shouldHighlightMatter(matter);
                                    const targetDate = new Date(matter.transferYear, matter.transferMonth - 1, 1);
                                    const currentDate = new Date(currentYear, currentMonth - 1, 1);
                                    const disabled = targetDate > currentDate;
                                    const relatedContract = professionalContractsByMatterId.get(matter.id);
                                    const contractStatus = getContractStatus(relatedContract);
                                    return (_jsxs("tr", { className: highlight ? "finance-row-danger" : variant === "retainer" ? "finance-row-retainer" : "", title: highlight ? getMatterHighlightMessage() : "", children: [_jsx("td", { children: resolveClientNumber(matter.clientName, matter.clientNumber) }), _jsx("td", { children: matter.clientName }), _jsx("td", { children: matter.quoteNumber ?? "-" }), _jsx("td", { children: _jsx("span", { className: `finance-type-pill ${matter.matterType === "RETAINER" ? "is-retainer" : ""}`, children: getMatterTypeLabel(matter.matterType) }) }), _jsx("td", { children: matter.subject }), _jsx("td", { children: formatCurrency(matter.totalFeesMxn) }), _jsx("td", { children: matter.commissionAssignee ?? "-" }), _jsx("td", { children: TEAM_OPTIONS.find((option) => option.key === matter.responsibleTeam)?.label ?? "-" }), _jsx("td", { children: _jsx("button", { className: "secondary-button finance-contract-button", type: "button", onClick: () => void handleOpenContractForm(matter), children: "Generar contrato" }) }), _jsx("td", { children: _jsx("span", { className: contractStatus.className, children: contractStatus.label }) }), _jsx("td", { children: _jsx("input", { className: "finance-input", type: "date", value: toDateInput(matter.nextPaymentDate), onChange: (event) => void handleMatterNextPaymentDateChange(matter.id, event.target.value) }) }), _jsx("td", { children: _jsxs("div", { className: "finance-target-picker", children: [_jsx("select", { className: "finance-input", value: matter.transferYear, onChange: (event) => updateMatterTransferTarget(matter.id, "transferYear", Number(event.target.value)), children: [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => _jsx("option", { value: year, children: year }, year)) }), _jsx("select", { className: "finance-input", value: matter.transferMonth, onChange: (event) => updateMatterTransferTarget(matter.id, "transferMonth", Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => _jsx("option", { value: month, children: getMonthName(month) }, month)) })] }) }), _jsx("td", { children: _jsx("button", { className: `finance-send-button ${variant === "retainer" ? "is-retainer" : ""}`, disabled: disabled, onClick: () => void handleSendMatterToFinance(matter), type: "button", children: "Enviar" }) })] }, matter.id));
                                }), !loading && items.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 13, children: variant === "retainer" ? "No hay igualas activas." : "No hay asuntos unicos activos." }) })) : null] })] }) }) }));
    }
    function renderSnapshots() {
        return (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Estampas guardadas" }), _jsxs("span", { children: [snapshots.length, " registros"] })] }), _jsx("div", { className: "finance-snapshot-grid", children: snapshots.length === 0 ? (_jsx("p", { className: "muted", children: "No hay estampas guardadas aun." })) : (snapshots.map((snapshot) => (_jsxs("article", { className: "finance-snapshot-card", children: [_jsxs("div", { className: "finance-snapshot-head", children: [_jsx("strong", { children: snapshot.title }), _jsx("span", { children: new Date(snapshot.createdAt).toLocaleDateString("es-MX") })] }), _jsxs("dl", { className: "finance-snapshot-stats", children: [_jsx("dt", { children: "Ingresos" }), _jsx("dd", { children: formatCurrency(snapshot.totalIncomeMxn) }), _jsx("dt", { children: "Egresos" }), _jsx("dd", { children: formatCurrency(snapshot.totalExpenseMxn) }), _jsx("dt", { children: "Balance" }), _jsx("dd", { children: formatCurrency(snapshot.balanceMxn) })] }), snapshot.snapshotData?.enrichedRecords?.length ? (_jsx("button", { className: "secondary-button", type: "button", onClick: () => setViewingSnapshot(snapshot), children: "Ver detalle completo" })) : null] }, snapshot.id)))) })] }));
    }
    return (_jsxs("section", { className: "page-stack finances-page", ref: pageRef, children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Finanzas" }), _jsx("div", { children: _jsx("h2", { children: "Finanzas" }) })] }), _jsx("p", { className: "muted", children: "Asuntos activos con envio a Finanzas, vista mensual operativa, copiado al siguiente mes, estampas historicas y validacion visual en rojo." })] }), error ? _jsx("div", { className: "message-banner message-error", children: error }) : null, _jsx("section", { className: "panel finance-tabs-panel", ref: tabsPanelRef, children: _jsxs("div", { className: "finance-tabs", children: [!isSalesMonthlyViewer ? (_jsx("button", { className: `finance-tab ${activeTab === "active-matters" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("active-matters"), children: "1. Asuntos activos" })) : null, _jsx("button", { className: `finance-tab ${activeTab === "monthly-view" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("monthly-view"), children: isSalesMonthlyViewer ? "Ver mes" : "2. Ver mes" }), !isSalesMonthlyViewer ? (_jsx("button", { className: `finance-tab ${activeTab === "snapshots" ? "is-active" : ""}`, type: "button", onClick: () => setActiveTab("snapshots"), children: "3. Estampas guardadas" })) : null] }) }), activeTab !== "snapshots" ? (_jsxs("section", { className: "panel finance-search-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: activeTab === "monthly-view" ? "Registros de finanzas" : "Asuntos en finanzas" }), _jsxs("span", { children: [activeTab === "monthly-view" ? filteredRecords.length : filteredActiveMatters.length, " registros"] })] }), _jsxs("div", { className: "matters-toolbar execution-search-toolbar finance-search-toolbar", children: [_jsxs("div", { className: "matters-filters leads-search-filters matters-active-search-filters execution-search-filters finance-search-filters", children: [_jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscar por palabra" }), _jsx("input", { type: "text", value: wordSearch, onChange: (event) => setWordSearch(event.target.value), placeholder: "Cotizacion, asunto, equipo, nota..." })] }), _jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscador por cliente" }), _jsx("input", { type: "text", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar palabra del cliente..." })] })] }), _jsx("div", { className: "matters-toolbar-actions", children: _jsx("span", { className: "muted", children: "Filtra por cliente o palabra dentro de la vista actual." }) })] })] })) : null, activeTab === "active-matters" ? (_jsxs(_Fragment, { children: [_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "1. Asuntos Activos (Unicos)" }), _jsxs("span", { children: [uniqueMatters.length, " registros"] })] }), renderActiveMattersTable(uniqueMatters, "unique")] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "2. Igualas por asuntos varios" }), _jsxs("span", { children: [retainerMatters.length, " registros"] })] }), _jsx("p", { className: "muted matter-table-caption", children: "Los renglones siguen mostrando rojo cuando falta la fecha de proximo pago o el asunto ya debia estar visible en el mes actual." }), renderActiveMattersTable(retainerMatters, "retainer")] })] })) : null, activeTab === "monthly-view" ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "finance-toolbar", children: [_jsxs("div", { className: "finance-toolbar-group", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Ano" }), _jsx("select", { value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)), children: [2024, 2025, 2026, 2027, 2028, 2029, 2030].map((year) => _jsx("option", { value: year, children: year }, year)) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: Array.from({ length: 12 }, (_, index) => index + 1).map((month) => _jsx("option", { value: month, children: getMonthName(month) }, month)) })] })] }), _jsxs("div", { className: "finance-toolbar-actions", children: [canDeleteFinanceRecords && selectedIds.size > 0 ? (_jsxs("button", { className: "danger-button", type: "button", onClick: () => void handleBulkDelete(), children: ["Borrar (", selectedIds.size, ")"] })) : null, canWriteFinances ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => void handleCreateSnapshot(), children: "Guardar estampa" }), _jsx("button", { className: "primary-button", type: "button", onClick: () => setCopyModalOpen(true), children: "Copiar todo al mes siguiente" })] })) : null] })] }), _jsx(MonthSummaryCards, { records: filteredRecords }), renderMonthlyTable()] })) : null, activeTab === "snapshots" ? renderSnapshots() : null, contractFormOpen ? (_jsx("div", { className: "finance-modal-backdrop", role: "presentation", onClick: () => (contractGenerating ? undefined : closeContractForm()), children: _jsxs("div", { className: "finance-modal finance-modal-wide finance-contract-modal", role: "dialog", "aria-modal": "true", "aria-label": "Generar contrato de prestacion de servicios", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "finance-modal-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Contrato de prestacion de servicios profesionales" }), _jsx("p", { className: "muted", children: "La portada se llena aqui y los servicios, honorarios y momentos de pago se toman de la cotizacion vinculada." })] }), _jsx("button", { className: "secondary-button", type: "button", disabled: contractGenerating, onClick: closeContractForm, children: "Cerrar" })] }), contractPrefillLoading ? (_jsx("div", { className: "centered-inline-message", children: "Preparando formulario del contrato..." })) : contractPrefill ? (_jsxs("form", { className: "finance-contract-form", onSubmit: handleGenerateContract, children: [_jsxs("div", { className: "quotes-detail-grid finance-contract-summary-grid", children: [_jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "No. de contrato" }), _jsx("p", { children: contractPrefill.contractNumber })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Cliente" }), _jsx("p", { children: [contractPrefill.clientNumber, contractPrefill.clientName].filter(Boolean).join(" - ") })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "No. de cotizacion" }), _jsx("p", { children: contractPrefill.quoteNumber ?? "-" })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Asunto" }), _jsx("p", { children: contractPrefill.subject })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Total cotizacion" }), _jsx("p", { children: formatCurrency(contractPrefill.totalMxn) })] }), _jsxs("div", { className: "quotes-detail-block", children: [_jsx("strong", { children: "Estatus" }), _jsx("p", { children: getContractStatus(professionalContractsByMatterId.get(contractPrefill.matterId)).label })] })] }), contractFlash ? _jsx("div", { className: "message-banner message-success", children: contractFlash }) : null, _jsxs("div", { className: "finance-contract-form-section", children: [_jsxs("div", { className: "panel-header finance-contract-section-head", children: [_jsx("h4", { children: "Idioma del contrato" }), _jsx("span", { children: "Selecciona la plantilla que se usara al generar el archivo." })] }), _jsx("div", { className: "finance-contract-field-grid", children: _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Idioma" }), _jsxs("select", { value: contractForm.language, onChange: (event) => updateContractFormField("language", event.target.value), children: [_jsx("option", { value: "ES", children: "Espanol" }), _jsx("option", { value: "EN", children: "Ingles" })] })] }) })] }), _jsxs("div", { className: "finance-contract-form-section", children: [_jsxs("div", { className: "panel-header finance-contract-section-head", children: [_jsx("h4", { children: "Datos editables de la portada" }), _jsx("span", { children: "Estos datos se guardan para futuras regeneraciones." })] }), _jsxs("div", { className: "finance-contract-field-grid", children: [_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Tipo de cliente" }), _jsxs("select", { value: contractForm.clientKind, onChange: (event) => updateContractFormField("clientKind", event.target.value), children: [_jsx("option", { value: "PERSONA_MORAL", children: "Persona moral" }), _jsx("option", { value: "PERSONA_FISICA", children: "Persona fisica" })] })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "RFC del cliente" }), _jsx("input", { required: true, value: contractForm.clientRfc, onChange: (event) => updateContractFormField("clientRfc", event.target.value) })] }), contractForm.clientKind === "PERSONA_MORAL" ? (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Representante legal" }), _jsx("input", { required: true, value: contractForm.legalRepresentative, onChange: (event) => updateContractFormField("legalRepresentative", event.target.value) })] })) : null, _jsxs("label", { className: "form-field finance-contract-wide-field", children: [_jsx("span", { children: "Domicilio" }), _jsx("textarea", { required: true, value: contractForm.clientAddress, onChange: (event) => updateContractFormField("clientAddress", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Telefono" }), _jsx("input", { required: true, value: contractForm.clientPhone, onChange: (event) => updateContractFormField("clientPhone", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Correo electronico" }), _jsx("input", { required: true, type: "email", value: contractForm.clientEmail, onChange: (event) => updateContractFormField("clientEmail", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de inicio" }), _jsx("input", { required: true, type: "date", value: contractForm.startDate, onChange: (event) => updateContractFormField("startDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de terminacion" }), _jsx("input", { type: "date", value: contractForm.endDate, onChange: (event) => updateContractFormField("endDate", event.target.value) })] }), _jsxs("label", { className: "form-field", children: [_jsx("span", { children: "Fecha de firma" }), _jsx("input", { required: true, type: "date", value: contractForm.signingDate, onChange: (event) => updateContractFormField("signingDate", event.target.value) })] })] })] }), _jsxs("div", { className: "finance-contract-form-section", children: [_jsxs("div", { className: "panel-header finance-contract-section-head", children: [_jsx("h4", { children: "Informacion tomada automaticamente de la cotizacion" }), _jsx("span", { children: "Solo lectura para evitar doble captura." })] }), _jsx("div", { className: "finance-table-shell finance-contract-table-shell", children: _jsxs("table", { className: "finance-table finance-contract-detail-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Servicio" }), _jsx("th", { children: "Honorarios" }), _jsx("th", { children: "Observaciones" })] }) }), _jsxs("tbody", { children: [contractPrefill.serviceLines.map((line) => (_jsxs("tr", { children: [_jsx("td", { children: line.service }), _jsx("td", { children: line.fees }), _jsx("td", { children: line.observations })] }, line.id))), contractPrefill.serviceLines.length === 0 ? (_jsx("tr", { children: _jsx("td", { className: "centered-inline-message", colSpan: 3, children: "La cotizacion no trae conceptos visibles." }) })) : null] })] }) }), _jsxs("div", { className: "finance-contract-milestones", children: [_jsx("strong", { children: "Momentos de pago" }), _jsx("div", { children: contractPrefill.paymentMilestones.length > 0
                                                        ? contractPrefill.paymentMilestones.map((milestone) => (_jsx("span", { className: "finance-contract-milestone-chip", children: milestone.label }, milestone.id)))
                                                        : _jsx("span", { className: "muted", children: "Sin momentos de pago especificados." }) })] })] }), _jsxs("div", { className: "finance-modal-actions", children: [_jsx("button", { className: "primary-button", type: "submit", disabled: contractGenerating || contractPrefillLoading, children: contractGenerating ? "Generando..." : "Generar y guardar" }), contractPrefill.contractId && contractPrefill.availableFormats.includes("docx") ? (_jsx("button", { className: "secondary-button", type: "button", disabled: contractActionKey === `${contractPrefill.contractId}:docx`, onClick: () => void handleContractDownload(contractPrefill.contractId, "docx"), children: contractActionKey === `${contractPrefill.contractId}:docx` ? "DOCX..." : "Descargar DOCX" })) : null, contractPrefill.contractId && contractPrefill.availableFormats.includes("pdf") ? (_jsx("button", { className: "secondary-button", type: "button", disabled: contractActionKey === `${contractPrefill.contractId}:pdf`, onClick: () => void handleContractDownload(contractPrefill.contractId, "pdf"), children: contractActionKey === `${contractPrefill.contractId}:pdf` ? "PDF..." : "Descargar PDF" })) : null] })] })) : (_jsx("div", { className: "centered-inline-message", children: "No fue posible preparar el contrato para este asunto." }))] }) })) : null, copyModalOpen ? (_jsx("div", { className: "finance-modal-backdrop", children: _jsxs("div", { className: "finance-modal", children: [_jsx("h3", { children: "Advertencia" }), _jsx("p", { children: "Esta accion borrara todos los registros existentes del siguiente mes y los reemplazara con los registros actuales." }), _jsxs("div", { className: "finance-modal-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => setCopyModalOpen(false), children: "Cancelar" }), _jsx("button", { className: "danger-button", type: "button", onClick: () => void handleCopyToNextMonth(), disabled: !canWriteFinances, children: "Continuar" })] })] }) })) : null, viewingSnapshot ? (_jsx("div", { className: "finance-modal-backdrop", children: _jsxs("div", { className: "finance-modal finance-modal-wide", children: [_jsxs("div", { className: "finance-modal-head", children: [_jsxs("div", { children: [_jsx("h3", { children: viewingSnapshot.title }), _jsxs("p", { className: "muted", children: ["Guardado: ", new Date(viewingSnapshot.createdAt).toLocaleString("es-MX")] })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => setViewingSnapshot(null), children: "Cerrar" })] }), _jsx("div", { className: "finance-table-shell", children: _jsxs("table", { className: "finance-table finance-table-snapshot", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No." }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "No. Cot." }), _jsx("th", { children: "Responsable" }), _jsx("th", { children: "Tipo Asunto" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Total Asunto" }), _jsx("th", { children: "Conceptos" }), _jsx("th", { children: "Hon. Conceptos" }), _jsx("th", { children: "Pagos Previos" }), _jsx("th", { children: "Remanente" }), _jsx("th", { children: "Fecha de proximo pago" }), _jsx("th", { children: "Semana" }), _jsx("th", { children: "Pagado este mes" }), _jsx("th", { children: "Fecha Pago Real" }), _jsx("th", { children: "Adeudado" }), _jsx("th", { children: "Netos" }), _jsx("th", { children: "Comm Cliente (20%)" }), _jsx("th", { children: "Comm Cierre (10%)" }), _jsx("th", { children: "Comm Ventas (1%)" }), _jsx("th", { children: "Ut. Neta" })] }) }), _jsx("tbody", { children: (viewingSnapshot.snapshotData?.enrichedRecords ?? []).map((record, index) => {
                                            const stats = calculateFinanceStats(record);
                                            const paymentDates = formatDateList([record.paymentDate1, record.paymentDate2, record.paymentDate3]);
                                            return (_jsxs("tr", { children: [_jsx("td", { children: index + 1 }), _jsx("td", { children: record.clientName }), _jsx("td", { children: record.quoteNumber ?? "-" }), _jsx("td", { children: TEAM_OPTIONS.find((option) => option.key === record.responsibleTeam)?.label ?? "-" }), _jsx("td", { children: getMatterTypeLabel(record.matterType) }), _jsx("td", { children: record.subject }), _jsx("td", { children: "Ingreso" }), _jsx("td", { children: formatCurrency(record.totalMatterMxn) }), _jsx("td", { children: record.workingConcepts ?? "-" }), _jsx("td", { children: formatCurrency(record.conceptFeesMxn) }), _jsx("td", { children: formatCurrency(record.previousPaymentsMxn) }), _jsx("td", { children: formatCurrency(stats.remainingMxn) }), _jsx("td", { children: toDateInput(record.nextPaymentDate) || "-" }), _jsx("td", { children: "-" }), _jsx("td", { children: formatCurrency(stats.totalPaidMxn) }), _jsx("td", { children: paymentDates }), _jsx("td", { children: formatCurrency(stats.dueTodayMxn) }), _jsx("td", { children: formatCurrency(stats.netFeesMxn) }), _jsx("td", { children: formatCurrency(stats.clientCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.closingCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.salesCommissionMxn) }), _jsx("td", { children: formatCurrency(stats.netProfitMxn) })] }, `${viewingSnapshot.id}-${record.id}`));
                                        }) })] }) })] }) })) : null] }));
}
