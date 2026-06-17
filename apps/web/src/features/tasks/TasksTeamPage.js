import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiGet } from "../../api/http-client";
import { externalContractMilestoneKindLabel, getAllExternalContractMilestones } from "../modules/external-contract-milestones";
import { TASK_DASHBOARD_CONFIG_BY_MODULE_ID } from "./task-dashboard-config";
import { buildTaskDashboardMembers, findTaskModuleDescriptorBySlug } from "./task-module-descriptors";
import { getEffectiveTrackingResponsible, getLitigationWritingFollowUpTaskLabel, hasValidTrackingResponsible, isLitigationWritingPostPresentationStage, isTrackingTermEnabled, resolveTrackingTaskName, usesPresentationAndTermDates } from "./task-display-utils";
import { LEGACY_TASK_MODULE_BY_ID } from "./task-legacy-config";
const TIMEFRAMES = [
    { id: "anteriores", label: "Tareas realizadas", colorClass: "is-past" },
    { id: "hoy", label: "Tareas hoy", colorClass: "is-today" },
    { id: "manana", label: "Tareas mañana", colorClass: "is-tomorrow" },
    { id: "posteriores", label: "Tareas posteriores", colorClass: "is-future" }
];
const SETTLEMENTS_MODULE_ID = "settlements";
const LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER = "MEOO";
const LITIGATION_COLLABORATOR_MEMBER_ID = "LAMR";
const LITIGATION_WRITINGS_TABLE_SLUG = "escritos-fondo";
const LITIGATION_PREVENTIONS_TABLE_SLUG = "desahogo-prevenciones";
const LITIGATION_JUDGES_TABLE_SLUG = "jueces-magistrados";
const LITIGATION_AUDIENCES_TABLE_SLUG = "audiencias";
const LITIGATION_ACTUARY_APPOINTMENTS_TABLE_SLUG = "citas-actuarios";
const LITIGATION_NOTIFICATIONS_TABLE_SLUG = "notificaciones";
const LITIGATION_EVIDENCE_TABLE_SLUG = "pruebas";
const LITIGATION_PUBLICATIONS_TABLE_SLUG = "publicaciones";
const LITIGATION_WAIT_RESOLUTION_TABLE_SLUG = "esperar-resolucion";
const LITIGATION_COPIES_TABLE_SLUG = "copias";
const LITIGATION_OFFICIAL_LETTERS_TABLE_SLUG = "oficios";
const LITIGATION_APPEALS_AND_AMPAROS_TABLE_SLUG = "amparos";
const LITIGATION_RETURNED_COURT_FILES_TABLE_SLUG = "archivo-judicial";
const LITIGATION_DOCUMENT_RETURNS_TABLE_SLUG = "devoluciones";
const LITIGATION_FILES_TO_SCAN_TABLE_SLUG = "escaneados";
const LITIGATION_THIRD_PARTY_ACTIONS_TABLE_SLUG = "terceros-ajenos";
const LITIGATION_OTHER_PROCEDURES_TABLE_SLUG = "otros-tramites";
function normalizeText(value) {
    return (value ?? "").trim();
}
function normalizeComparableText(value) {
    return normalizeText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s*\/\s*/g, "/");
}
function splitResponsibleAliases(value) {
    const normalized = normalizeComparableText(value);
    if (!normalized) {
        return [];
    }
    return normalized
        .split(/\s*(?:\/|,|;|&|\by\b)\s*/u)
        .map((candidate) => candidate.trim())
        .filter(Boolean);
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function getLocalDateInput(offset = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function shiftMonthsDateInput(value, monthOffset) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return "";
    }
    const [year, month, day] = value.split("-").map(Number);
    const firstDayOfTargetMonth = new Date(year, month - 1 + monthOffset, 1, 12, 0, 0, 0);
    const lastDayOfTargetMonth = new Date(firstDayOfTargetMonth.getFullYear(), firstDayOfTargetMonth.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
    const target = new Date(firstDayOfTargetMonth);
    target.setDate(Math.min(day, lastDayOfTargetMonth));
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}
function getExternalContractReminderDate(dueDate) {
    return shiftMonthsDateInput(dueDate, -1) || dueDate;
}
function matchesResponsible(taskResponsible, member, sharedResponsibleAliases) {
    const normalizedResponsible = normalizeComparableText(taskResponsible);
    const responsibleAliases = splitResponsibleAliases(taskResponsible);
    const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));
    const sharedAliases = sharedResponsibleAliases.map((alias) => normalizeComparableText(alias));
    return memberAliases.includes(normalizedResponsible)
        || responsibleAliases.some((alias) => memberAliases.includes(alias))
        || sharedAliases.includes(normalizedResponsible);
}
function getVerificationColumnAliases(column) {
    const labelWithoutPrefix = normalizeText(column.label).replace(/^v\.\s*/i, "");
    const keyAliases = column.key
        .replace(/^verificado[_-]?/i, "")
        .split(/[_-]/)
        .filter(Boolean);
    return [column.label, labelWithoutPrefix, ...keyAliases]
        .map((alias) => normalizeComparableText(alias))
        .filter(Boolean);
}
function matchesVerificationColumn(column, member) {
    const memberAliases = member.aliases.map((alias) => normalizeComparableText(alias));
    return getVerificationColumnAliases(column).some((alias) => memberAliases.includes(alias));
}
function isVerificationValueComplete(value) {
    return ["si", "yes"].includes(normalizeComparableText(value));
}
function buildLegacyTableLookup(tables) {
    const lookup = new Map();
    tables.forEach((table) => {
        [table.slug, table.sourceTable, table.title].forEach((key) => {
            const normalizedKey = normalizeComparableText(key);
            if (normalizedKey) {
                lookup.set(normalizedKey, table);
            }
        });
    });
    return lookup;
}
function resolveRecordTable(lookup, record) {
    return lookup.get(normalizeComparableText(record.tableCode))
        ?? lookup.get(normalizeComparableText(record.sourceTable));
}
function belongsToTimeframe(input, timeframe) {
    const today = getLocalDateInput();
    const tomorrow = getLocalDateInput(1);
    if (timeframe === "anteriores") {
        return input.state === "closed";
    }
    if (input.state === "closed") {
        return false;
    }
    if (timeframe === "hoy") {
        return !input.date || input.date <= today;
    }
    if (timeframe === "manana") {
        return input.date === tomorrow;
    }
    return input.date > tomorrow;
}
function isVerificationComplete(term) {
    const values = Object.values(term.verification);
    return values.length > 0 && values.every((value) => isVerificationValueComplete(value));
}
function isLinkedVerificationComplete(term) {
    return term ? isVerificationComplete(term) : false;
}
function isLinkedTermTableEnabled(table) {
    if (!table) {
        return false;
    }
    return usesPresentationAndTermDates(table) || Boolean(table.autoTerm || table.termManagedDate);
}
function isLitigationWritingTable(table) {
    return table?.slug === LITIGATION_WRITINGS_TABLE_SLUG;
}
function isLitigationPreventionTable(table) {
    return table?.slug === LITIGATION_PREVENTIONS_TABLE_SLUG;
}
function isLitigationJudgesTable(table) {
    return table?.slug === LITIGATION_JUDGES_TABLE_SLUG;
}
function isLitigationAudienceTable(table) {
    return table?.slug === LITIGATION_AUDIENCES_TABLE_SLUG;
}
function isLitigationActuaryAppointmentTable(table) {
    return table?.slug === LITIGATION_ACTUARY_APPOINTMENTS_TABLE_SLUG;
}
function isLitigationNotificationTable(table) {
    return table?.slug === LITIGATION_NOTIFICATIONS_TABLE_SLUG;
}
function isLitigationEvidenceTable(table) {
    return table?.slug === LITIGATION_EVIDENCE_TABLE_SLUG;
}
function isLitigationPublicationsTable(table) {
    return table?.slug === LITIGATION_PUBLICATIONS_TABLE_SLUG;
}
function isLitigationWaitResolutionTable(table) {
    return table?.slug === LITIGATION_WAIT_RESOLUTION_TABLE_SLUG;
}
function isLitigationCopiesTable(table) {
    return table?.slug === LITIGATION_COPIES_TABLE_SLUG;
}
function isLitigationOfficialLettersTable(table) {
    return table?.slug === LITIGATION_OFFICIAL_LETTERS_TABLE_SLUG;
}
function isLitigationAppealsAndAmparosTable(table) {
    return table?.slug === LITIGATION_APPEALS_AND_AMPAROS_TABLE_SLUG;
}
function isLitigationReturnedCourtFilesTable(table) {
    return table?.slug === LITIGATION_RETURNED_COURT_FILES_TABLE_SLUG;
}
function isLitigationDocumentReturnsTable(table) {
    return table?.slug === LITIGATION_DOCUMENT_RETURNS_TABLE_SLUG;
}
function isLitigationFilesToScanTable(table) {
    return table?.slug === LITIGATION_FILES_TO_SCAN_TABLE_SLUG;
}
function isLitigationThirdPartyActionsTable(table) {
    return table?.slug === LITIGATION_THIRD_PARTY_ACTIONS_TABLE_SLUG;
}
function isLitigationOtherProceduresTable(table) {
    return table?.slug === LITIGATION_OTHER_PROCEDURES_TABLE_SLUG;
}
function isLitigationCollaboratorMirrorTable(table) {
    return isLitigationJudgesTable(table)
        || isLitigationAudienceTable(table)
        || isLitigationActuaryAppointmentTable(table)
        || isLitigationNotificationTable(table)
        || isLitigationPublicationsTable(table)
        || isLitigationWaitResolutionTable(table)
        || isLitigationCopiesTable(table)
        || isLitigationOfficialLettersTable(table)
        || isLitigationAppealsAndAmparosTable(table)
        || isLitigationReturnedCourtFilesTable(table)
        || isLitigationDocumentReturnsTable(table)
        || isLitigationFilesToScanTable(table)
        || isLitigationThirdPartyActionsTable(table)
        || isLitigationOtherProceduresTable(table);
}
function isResponsibleAssignmentTable(table) {
    return isLitigationWritingTable(table) || isLitigationPreventionTable(table);
}
function isCompletedTrackingRecord(table, record) {
    if (record.status === "presentado" || record.status === "concluida") {
        return true;
    }
    return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}
function isResponsibleAssignmentPending(table, record) {
    return isResponsibleAssignmentTable(table) && !hasValidTrackingResponsible(record, table);
}
function isLitigationTermOversightMember(member) {
    return member.id === LITIGATION_COLLABORATOR_MEMBER_ID
        || member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
}
function matchesTermDashboardOwner(responsible, member, sharedResponsibleAliases) {
    return isLitigationTermOversightMember(member)
        || matchesResponsible(responsible, member, sharedResponsibleAliases);
}
function matchesTrackingDashboardOwner(table, record, member, sharedResponsibleAliases) {
    const responsible = getEffectiveTrackingResponsible(record, table);
    if (isTrackingTermEnabled(record, table)) {
        return matchesTermDashboardOwner(responsible, member, sharedResponsibleAliases);
    }
    if (isLitigationEvidenceTable(table)) {
        return member.id === LITIGATION_COLLABORATOR_MEMBER_ID
            || member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
    }
    if (isLitigationCollaboratorMirrorTable(table)) {
        return member.id === LITIGATION_COLLABORATOR_MEMBER_ID
            || (hasValidTrackingResponsible(record, table) && matchesResponsible(responsible, member, sharedResponsibleAliases));
    }
    if (!isResponsibleAssignmentTable(table)) {
        return matchesResponsible(responsible, member, sharedResponsibleAliases);
    }
    if (isResponsibleAssignmentPending(table, record)) {
        return member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
    }
    if (member.id === LITIGATION_COLLABORATOR_MEMBER_ID && isLitigationWritingTable(table)) {
        return false;
    }
    return member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER
        || (isLitigationPreventionTable(table) && member.id === LITIGATION_COLLABORATOR_MEMBER_ID)
        || matchesResponsible(responsible, member, []);
}
function getTrackingDashboardDateForMember(table, record, member) {
    if (isResponsibleAssignmentPending(table, record) && member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER) {
        return getLocalDateInput();
    }
    if (isLitigationWritingPostPresentationStage(table, record)) {
        return getLocalDateInput();
    }
    return getTrackingDashboardDate(table, record);
}
function getTrackingDateCandidates(table, record) {
    if (isLitigationWritingPostPresentationStage(table, record)) {
        return [getLocalDateInput()];
    }
    const dates = [toDateInput(record.dueDate)];
    const termDate = toDateInput(record.termDate);
    if (isTrackingTermEnabled(record, table) && termDate) {
        dates.push(termDate);
    }
    return dates.filter(Boolean).sort();
}
function getTrackingDashboardDate(table, record) {
    return getTrackingDateCandidates(table, record)[0] ?? "";
}
function isTrackingDashboardRed(table, record, taskLabel, linkedTerm) {
    if (isCompletedTrackingRecord(table, record)) {
        return false;
    }
    const today = getLocalDateInput();
    const termEnabled = isTrackingTermEnabled(record, table);
    if (!taskLabel || !hasValidTrackingResponsible(record, table)) {
        return true;
    }
    if (isLitigationWritingPostPresentationStage(table, record)) {
        return false;
    }
    if (usesPresentationAndTermDates(table)) {
        const presentationDate = toDateInput(record.dueDate);
        const termDate = toDateInput(record.termDate);
        return !presentationDate
            || presentationDate <= today
            || (termEnabled && (!termDate || termDate <= today || !isLinkedVerificationComplete(linkedTerm)));
    }
    const dueDate = getTrackingDashboardDate(table, record);
    const requiresDate = table?.showDateColumn !== false;
    return (requiresDate && !dueDate)
        || (Boolean(dueDate) && dueDate <= today)
        || (termEnabled && !isLinkedVerificationComplete(linkedTerm));
}
export function TasksTeamPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const focusedMemberId = searchParams.get("member");
    const focusedTimeframe = searchParams.get("timeframe");
    const [taskModules, setTaskModules] = useState([]);
    const [modulesLoading, setModulesLoading] = useState(true);
    const [modulesError, setModulesError] = useState(null);
    const module = useMemo(() => findTaskModuleDescriptorBySlug(taskModules, slug), [slug, taskModules]);
    const dashboardMembers = useMemo(() => module ? buildTaskDashboardMembers(module.definition) : [], [module]);
    const dashboardConfig = module ? TASK_DASHBOARD_CONFIG_BY_MODULE_ID[module.moduleId] : undefined;
    const legacyConfig = module ? LEGACY_TASK_MODULE_BY_ID[module.moduleId] : undefined;
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [externalContracts, setExternalContracts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedView, setExpandedView] = useState(null);
    const canAccess = Boolean(module);
    useEffect(() => {
        let active = true;
        async function loadModules() {
            setModulesLoading(true);
            setModulesError(null);
            try {
                const loadedModules = await apiGet("/tasks/modules");
                if (active) {
                    setTaskModules(loadedModules);
                }
            }
            catch (error) {
                if (active) {
                    setModulesError(error instanceof Error ? error.message : "No se pudieron cargar los equipos de tareas.");
                }
            }
            finally {
                if (active) {
                    setModulesLoading(false);
                }
            }
        }
        void loadModules();
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        const isValidTimeframe = TIMEFRAMES.some((candidate) => candidate.id === focusedTimeframe);
        if (!focusedMemberId || !isValidTimeframe) {
            return;
        }
        const member = dashboardMembers.find((candidate) => candidate.id === focusedMemberId);
        if (member) {
            setExpandedView({ memberId: member.id, timeframe: focusedTimeframe });
        }
    }, [dashboardMembers, focusedMemberId, focusedTimeframe]);
    useEffect(() => {
        if (!module || !canAccess) {
            return;
        }
        if (!legacyConfig) {
            setTrackingRecords([]);
            setTerms([]);
            setExternalContracts([]);
            setLoading(false);
            return;
        }
        const currentModule = module;
        async function loadDashboard() {
            setLoading(true);
            try {
                const externalContractsPromise = currentModule.moduleId === SETTLEMENTS_MODULE_ID
                    ? apiGet("/external-contracts").catch(() => [])
                    : Promise.resolve([]);
                const [loadedTracking, loadedTerms, loadedExternalContracts] = await Promise.all([
                    apiGet(`/tasks/tracking-records?moduleId=${currentModule.moduleId}`),
                    apiGet(`/tasks/terms?moduleId=${currentModule.moduleId}`),
                    externalContractsPromise
                ]);
                setTrackingRecords(loadedTracking);
                setTerms(loadedTerms);
                setExternalContracts(loadedExternalContracts);
            }
            finally {
                setLoading(false);
            }
        }
        void loadDashboard();
    }, [canAccess, legacyConfig, module]);
    const tableLookup = useMemo(() => buildLegacyTableLookup(legacyConfig?.tables ?? []), [legacyConfig]);
    const managerSourceLookup = useMemo(() => {
        const recordIds = new Set();
        const termIds = new Set();
        trackingRecords.forEach((record) => {
            const table = resolveRecordTable(tableLookup, record);
            if (!table || record.deletedAt || isCompletedTrackingRecord(table, record) || !isTrackingTermEnabled(record, table)) {
                return;
            }
            recordIds.add(record.id);
            if (record.termId) {
                termIds.add(record.termId);
            }
        });
        return { recordIds, termIds };
    }, [tableLookup, trackingRecords]);
    const termLookup = useMemo(() => {
        const byId = new Map();
        const bySourceRecordId = new Map();
        terms.forEach((term) => {
            byId.set(term.id, term);
            if (term.sourceRecordId) {
                bySourceRecordId.set(term.sourceRecordId, term);
            }
        });
        return { byId, bySourceRecordId };
    }, [terms]);
    const externalContractMilestones = useMemo(() => module?.moduleId === SETTLEMENTS_MODULE_ID ? getAllExternalContractMilestones(externalContracts) : [], [externalContracts, module?.moduleId]);
    function buildTrackingRows(member, timeframe) {
        return trackingRecords
            .filter((record) => !record.deletedAt)
            .map((record) => ({ record, table: resolveRecordTable(tableLookup, record) }))
            .filter(({ table }) => Boolean(table))
            .filter(({ record, table }) => !(isLitigationWritingTable(table) && isCompletedTrackingRecord(table, record)))
            .filter(({ record, table }) => matchesTrackingDashboardOwner(table, record, member, dashboardConfig?.sharedResponsibleAliases ?? []))
            .filter(({ record, table }) => belongsToTimeframe({
            state: isCompletedTrackingRecord(table, record) ? "closed" : "open",
            date: getTrackingDashboardDateForMember(table, record, member)
        }, timeframe))
            .map(({ record, table }) => {
            const linkedTerm = (record.termId ? termLookup.byId.get(record.termId) : undefined) ?? termLookup.bySourceRecordId.get(record.id);
            const dueDate = getTrackingDashboardDateForMember(table, record, member);
            const baseTaskLabel = resolveTrackingTaskName(record, table, undefined, record.eventName);
            const followUpTaskLabel = getLitigationWritingFollowUpTaskLabel(table, record);
            const dashboardTaskLabel = followUpTaskLabel || baseTaskLabel;
            const completed = isCompletedTrackingRecord(table, record);
            const assignmentPending = !completed
                && isResponsibleAssignmentPending(table, record)
                && member.id === LITIGATION_RESPONSIBLE_ASSIGNMENT_OWNER;
            const highlighted = assignmentPending || isTrackingDashboardRed(table, record, dashboardTaskLabel, linkedTerm);
            return {
                taskId: `tracking-${record.id}`,
                clientNumber: record.clientNumber || "-",
                clientName: record.clientName || "-",
                subject: record.subject || "-",
                specificProcess: record.specificProcess || "-",
                taskLabel: assignmentPending
                    ? `Definir responsable: ${dashboardTaskLabel || "Tarea"}`
                    : dashboardTaskLabel || "Tarea",
                typeLabel: completed
                    ? "Completada"
                    : assignmentPending
                        ? "Definir responsable"
                        : isTrackingTermEnabled(record, table)
                            ? "Termino / seguimiento"
                            : highlighted ? "Vencida / incompleta" : "Seguimiento",
                displayDate: completed ? toDateInput(record.completedAt || record.updatedAt) : dueDate,
                originLabel: table?.title ?? record.sourceTable,
                originPath: `/app/tasks/${slug}/distribuidor`,
                actionLabel: "Ir al Manager",
                highlighted
            };
        });
    }
    function buildTermVerificationRows(member, timeframe) {
        if (timeframe !== "hoy") {
            return [];
        }
        const today = getLocalDateInput();
        return terms
            .filter((term) => !term.deletedAt)
            .filter((term) => term.sourceRecordId
            ? managerSourceLookup.recordIds.has(term.sourceRecordId)
            : managerSourceLookup.termIds.has(term.id))
            .flatMap((term) => {
            const table = tableLookup.get(normalizeComparableText(term.sourceTable));
            if (term.sourceRecordId && !isLinkedTermTableEnabled(table)) {
                return [];
            }
            if (isLitigationWritingTable(table) && member.id === LITIGATION_COLLABORATOR_MEMBER_ID) {
                return [];
            }
            const taskLabel = normalizeText(term.pendingTaskLabel) || normalizeText(term.eventName) || "Termino sin nombre";
            return (legacyConfig?.verificationColumns ?? [])
                .filter((column) => matchesVerificationColumn(column, member))
                .filter((column) => !isVerificationValueComplete(term.verification[column.key]))
                .map((column) => ({
                taskId: `term-verification-${term.id}-${column.key}`,
                clientNumber: term.clientNumber || "-",
                clientName: term.clientName || "-",
                subject: term.subject || "-",
                specificProcess: term.specificProcess || "-",
                taskLabel: `Verificar termino: ${taskLabel}`,
                typeLabel: "Verificacion de termino",
                displayDate: today,
                originLabel: table?.title ?? "Manager de tareas",
                originPath: `/app/tasks/${slug}/distribuidor`,
                actionLabel: "Ir al Manager",
                highlighted: true
            }));
        });
    }
    function buildExternalContractMilestoneRows(timeframe) {
        if (module?.moduleId !== SETTLEMENTS_MODULE_ID) {
            return [];
        }
        const today = getLocalDateInput();
        return externalContractMilestones
            .map((milestone) => {
            const reminderDate = getExternalContractReminderDate(milestone.dueDate);
            const kindLabel = externalContractMilestoneKindLabel(milestone.kind);
            return {
                taskId: `external-contract-milestone-${milestone.id}-${milestone.dueDate}`,
                clientNumber: milestone.clientNumber || "-",
                clientName: milestone.clientName || "-",
                subject: milestone.contractTitle || milestone.propertyAddress || `Contrato ${milestone.contractNumber}`,
                specificProcess: [kindLabel, milestone.description].filter(Boolean).join(" - ") || "Hito o alerta de contrato externo",
                taskLabel: `Recordatorio: ${milestone.title} (fecha del hito/alerta: ${milestone.dueDate})`,
                typeLabel: "Recordatorio 1 mes antes",
                displayDate: reminderDate,
                originLabel: "Proximos hitos y alertas",
                originPath: "/app/external-contracts",
                actionLabel: "Ir a contratos",
                highlighted: reminderDate <= today
            };
        })
            .filter((row) => belongsToTimeframe({ state: "open", date: row.displayDate }, timeframe));
    }
    function buildRows(member, timeframe) {
        return [
            ...buildTrackingRows(member, timeframe),
            ...buildTermVerificationRows(member, timeframe),
            ...buildExternalContractMilestoneRows(timeframe)
        ].sort((left, right) => left.displayDate.localeCompare(right.displayDate));
    }
    if (!modulesLoading && modulesError) {
        return (_jsx("section", { className: "page-stack tasks-team-page", children: _jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: modulesError }) }) }));
    }
    if (!modulesLoading && (!module || !canAccess)) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    if (modulesLoading || !module) {
        return (_jsx("section", { className: "page-stack tasks-team-page", children: _jsx("section", { className: "panel", children: _jsx("div", { className: "centered-inline-message", children: "Cargando equipo..." }) }) }));
    }
    return (_jsxs("section", { className: "page-stack tasks-team-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "execution-page-topline", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate("/app/tasks"), children: "Volver" }), _jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", style: { color: module.color }, children: module.icon }), _jsx("div", { children: _jsx("h2", { children: module.label }) })] })] }), _jsx("p", { className: "muted", children: legacyConfig
                            ? "Operacion de tareas por equipo con Manager de tareas, tablas de seguimiento, terminos y tareas adicionales."
                            : "Espacio de tareas del equipo listo para configuracion posterior." }), legacyConfig ? (_jsxs("div", { className: "tasks-legacy-toolbar", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/distribuidor`), children: "Manager de tareas" }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/terminos`), children: "Terminos" }), legacyConfig.hasRecurringTerms ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/terminos-recurrentes`), children: "Terminos recurrentes" })) : null, _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/adicionales`), children: "Tareas adicionales" })] })) : null] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Vista diaria del equipo" }), _jsxs("span", { children: [dashboardMembers.length, " integrantes"] })] }), _jsx("p", { className: "muted tasks-team-board-copy", children: "Cada integrante conserva sus ventanas de trabajo: realizadas, hoy, ma\u00F1ana y posteriores. El rojo indica faltantes, terminos sin verificacion o fechas vencidas." }), _jsxs("div", { className: "tasks-team-member-list", children: [dashboardMembers.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay integrantes activos asignados a este equipo." })) : null, dashboardMembers.map((member) => {
                                const isExpanded = expandedView?.memberId === member.id;
                                const rows = isExpanded && expandedView ? buildRows(member, expandedView.timeframe) : [];
                                return (_jsxs("article", { className: "tasks-team-member-card", children: [_jsxs("div", { className: "tasks-team-member-head", children: [_jsx("h3", { children: member.name }), _jsx("span", { children: member.id })] }), _jsx("div", { className: "tasks-team-timeframes", children: TIMEFRAMES.map((timeframe) => {
                                                const isActive = expandedView?.memberId === member.id && expandedView.timeframe === timeframe.id;
                                                return (_jsx("button", { type: "button", className: `tasks-team-timeframe-button ${timeframe.colorClass} ${isActive ? "is-active" : ""}`, onClick: () => setExpandedView((current) => current?.memberId === member.id && current?.timeframe === timeframe.id
                                                        ? null
                                                        : { memberId: member.id, timeframe: timeframe.id }), children: timeframe.label }, timeframe.id));
                                            }) }), isExpanded && expandedView ? (_jsxs("div", { className: "tasks-team-timeframe-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: TIMEFRAMES.find((timeframe) => timeframe.id === expandedView.timeframe)?.label ?? "Detalle" }), _jsxs("span", { children: [rows.length, " tareas"] })] }), _jsx("div", { className: "table-scroll", children: _jsxs("table", { className: "data-table tasks-dashboard-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Tipo" }), _jsx("th", { children: "Fecha" }), _jsx("th", { children: "Tabla de Origen" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "centered-inline-message", children: "Cargando tareas..." }) })) : rows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 9, className: "centered-inline-message", children: "No hay tareas en esta categoria." }) })) : (rows.map((row) => (_jsxs("tr", { className: row.highlighted ? "tasks-dashboard-row-overdue" : undefined, children: [_jsx("td", { children: row.clientNumber || "-" }), _jsx("td", { children: row.clientName }), _jsx("td", { children: row.subject }), _jsx("td", { children: row.specificProcess }), _jsx("td", { className: row.highlighted ? "tasks-dashboard-title-overdue" : undefined, children: row.taskLabel }), _jsx("td", { children: _jsx("span", { className: `tasks-dashboard-type-pill ${row.typeLabel === "Completada" ? "is-completed" : row.highlighted ? "is-overdue" : "is-pending"}`, children: row.typeLabel }) }), _jsx("td", { children: row.displayDate || "-" }), _jsx("td", { children: row.originLabel }), _jsx("td", { children: _jsx("button", { type: "button", className: "secondary-button matter-inline-button", onClick: () => navigate(row.originPath), children: row.actionLabel }) })] }, row.taskId)))) })] }) })] })) : null] }, member.id));
                            })] })] }), legacyConfig ? (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Tablas de seguimiento" }), _jsxs("span", { children: [legacyConfig.tables.length, " tablas"] })] }), _jsx("div", { className: "tasks-table-card-grid", children: legacyConfig.tables.map((table) => (_jsxs("button", { type: "button", className: "tasks-table-card", onClick: () => navigate(`/app/tasks/${legacyConfig.slug}/${table.slug}`), children: [_jsx("strong", { children: table.title }), _jsx("span", { children: table.sourceTable })] }, table.slug))) })] })) : (_jsxs("section", { className: "panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Submodulos" }), _jsx("span", { children: "0 configurados" })] }), _jsx("div", { className: "centered-inline-message", children: "Sin submodulos configurados." })] }))] }));
}
