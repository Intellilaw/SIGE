import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { EXECUTION_MODULE_BY_SLUG } from "../execution/execution-config";
import { buildDistributionHistoryTaskNameMap, getTermEnabledRecordData, isTrackingTermEnabled, resolveTrackingTaskName, usesOptionalTermToggle, usesPresentationAndTermDates } from "./task-display-utils";
import { LEGACY_TASK_MODULE_BY_SLUG } from "./task-legacy-config";
import { encodeCatalogTarget, findLegacyTableByAnyName, getCatalogTargetEntries, getTableDisplayName, makeCatalogTargetEntry } from "./task-distribution-utils";
function normalize(value) {
    return (value ?? "").trim();
}
function normalizeResponsibleOption(value) {
    return normalize(value).toUpperCase();
}
function splitResponsibleOptions(value) {
    return normalize(value)
        .split(/[\/,;]/)
        .map(normalizeResponsibleOption)
        .filter(Boolean);
}
function dedupeResponsibleOptions(values) {
    return Array.from(new Set(values.map(normalizeResponsibleOption).filter(Boolean))).sort((left, right) => left.localeCompare(right));
}
function normalizeComparableText(value) {
    return normalize(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function getSearchWords(value) {
    return normalizeComparableText(value).split(/\s+/).filter(Boolean);
}
function matchesSearchWords(value, searchWords) {
    if (searchWords.length === 0) {
        return true;
    }
    const haystack = normalizeComparableText(value);
    return searchWords.every((word) => haystack.includes(word));
}
function toDateInput(value) {
    return value ? value.slice(0, 10) : "";
}
function todayInput() {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function toDisplayDate(value) {
    const date = toDateInput(value);
    if (!date) {
        return "-";
    }
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
}
function getRowDate(record) {
    return [toDateInput(record.dueDate), toDateInput(record.termDate)]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right))[0] ?? "";
}
function getRecycleDate(record) {
    return toDateInput(record.deletedAt || record.completedAt || record.updatedAt);
}
function isWithinRecycleWindow(record) {
    const date = getRecycleDate(record);
    if (!date) {
        return false;
    }
    const recycleTime = new Date(`${date}T12:00:00`).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return Number.isFinite(recycleTime) && Date.now() - recycleTime <= thirtyDaysMs;
}
function isYes(value) {
    return ["si", "yes"].includes((value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
}
function defaultVerification(moduleConfig) {
    return Object.fromEntries(moduleConfig.verificationColumns.map((column) => [column.key, "No"]));
}
function getTermVerification(moduleConfig, term) {
    return {
        ...defaultVerification(moduleConfig),
        ...(term?.verification ?? {})
    };
}
function shouldShowTermVerification(table, record) {
    return isTrackingTermEnabled(record, table);
}
function hasIncompleteTermVerification(moduleConfig, term) {
    const verification = getTermVerification(moduleConfig, term);
    return moduleConfig.verificationColumns.some((column) => !isYes(verification[column.key]));
}
function isCompletedRecord(table, record) {
    if (record.status === "presentado" || record.status === "concluida") {
        return true;
    }
    return table?.mode === "workflow" && record.workflowStage >= table.tabs.length;
}
function isTrackingRecordRed(table, record, taskNamesByRecordId) {
    if (isCompletedRecord(table, record)) {
        return false;
    }
    const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId);
    const dueDate = getRowDate(record);
    const requiresDate = table?.showDateColumn !== false;
    if (usesPresentationAndTermDates(table)) {
        const presentationDate = toDateInput(record.dueDate);
        const termDate = toDateInput(record.termDate);
        const termEnabled = isTrackingTermEnabled(record, table);
        return !taskName
            || !record.responsible
            || !presentationDate
            || presentationDate <= todayInput()
            || (termEnabled && (!termDate || termDate <= todayInput()));
    }
    return !taskName || !record.responsible || (requiresDate && !dueDate) || (Boolean(dueDate) && dueDate <= todayInput());
}
function getStageLabel(table, record) {
    if (!table) {
        return record.status;
    }
    if (table.mode === "workflow") {
        return table.tabs.find((tab) => Number(tab.stage) === Number(record.workflowStage || 1))?.label ?? "Etapa pendiente";
    }
    return table.tabs.find((tab) => tab.status === record.status)?.label ?? record.status;
}
function getRecordTabKey(table, record) {
    if (!table) {
        return "";
    }
    if (table.mode === "workflow") {
        const completedStage = table.tabs.find((tab) => tab.isCompleted)?.stage;
        const currentStage = record.status === "presentado" && completedStage ? completedStage : record.workflowStage || 1;
        return table.tabs.find((tab) => Number(tab.stage) === Number(currentStage))?.key ?? "";
    }
    return table.tabs.find((tab) => tab.status === record.status)?.key ?? "";
}
function getPreviousActivePatch(table, record) {
    if (table?.mode === "workflow") {
        const completedStage = table.tabs.find((tab) => tab.isCompleted)?.stage ?? table.tabs.length;
        const previousStage = Math.max(1, completedStage - 1);
        return {
            workflowStage: previousStage,
            status: "pendiente",
            completedAt: null,
            deletedAt: null
        };
    }
    return {
        workflowStage: record.workflowStage,
        status: "pendiente",
        completedAt: null,
        deletedAt: null
    };
}
function getLinkedTerm(terms, record) {
    return terms.find((term) => term.id === record.termId || term.sourceRecordId === record.id);
}
export function TaskDistributorPage() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const moduleConfig = slug ? LEGACY_TASK_MODULE_BY_SLUG[slug] : undefined;
    const executionModule = slug ? EXECUTION_MODULE_BY_SLUG[slug] : undefined;
    const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "config" ? "config" : "active");
    const [events, setEvents] = useState([]);
    const [history, setHistory] = useState([]);
    const [trackingRecords, setTrackingRecords] = useState([]);
    const [terms, setTerms] = useState([]);
    const [catalogName, setCatalogName] = useState("");
    const [catalogEntries, setCatalogEntries] = useState([]);
    const [editingCatalogId, setEditingCatalogId] = useState(null);
    const [wordSearch, setWordSearch] = useState("");
    const [clientSearch, setClientSearch] = useState(searchParams.get("client") ?? "");
    const [responsibleOptions, setResponsibleOptions] = useState([]);
    const [loading, setLoading] = useState(true);
    async function loadDistributor() {
        if (!moduleConfig) {
            return;
        }
        setLoading(true);
        try {
            const [loadedEvents, loadedHistory, loadedTrackingRecords, loadedTerms] = await Promise.all([
                apiGet(`/tasks/distribution-events?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/distributions?moduleId=${moduleConfig.moduleId}`),
                apiGet(`/tasks/tracking-records?moduleId=${moduleConfig.moduleId}&includeDeleted=true`),
                apiGet(`/tasks/terms?moduleId=${moduleConfig.moduleId}`)
            ]);
            setEvents(loadedEvents);
            setHistory(loadedHistory);
            setTrackingRecords(loadedTrackingRecords);
            setTerms(loadedTerms);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadDistributor();
    }, [moduleConfig]);
    useEffect(() => {
        if (!moduleConfig) {
            setResponsibleOptions([]);
            return;
        }
        let cancelled = false;
        const team = moduleConfig.team;
        const fallbackOptions = splitResponsibleOptions(moduleConfig.defaultResponsible);
        async function loadResponsibleOptions() {
            try {
                const loaded = await apiGet(`/users/team-short-names?team=${encodeURIComponent(team)}`);
                const nextOptions = dedupeResponsibleOptions([...loaded, ...fallbackOptions]);
                if (!cancelled) {
                    setResponsibleOptions(nextOptions.length > 0 ? nextOptions : fallbackOptions);
                }
            }
            catch {
                if (!cancelled) {
                    setResponsibleOptions(fallbackOptions);
                }
            }
        }
        void loadResponsibleOptions();
        return () => {
            cancelled = true;
        };
    }, [moduleConfig]);
    useEffect(() => {
        const requestedTab = searchParams.get("tab");
        setActiveTab(requestedTab === "config" ? "config" : "active");
        const requestedClient = searchParams.get("client");
        if (requestedClient !== null) {
            setClientSearch(requestedClient);
        }
    }, [searchParams]);
    function resolveRecordTable(record) {
        if (!moduleConfig) {
            return undefined;
        }
        return findLegacyTableByAnyName(moduleConfig, record.tableCode)
            ?? findLegacyTableByAnyName(moduleConfig, record.sourceTable);
    }
    const trackingById = useMemo(() => new Map(trackingRecords.map((record) => [record.id, record])), [trackingRecords]);
    function resolveHistoryRecord(item, tableValue, index, usedIds) {
        if (!moduleConfig) {
            return undefined;
        }
        const table = findLegacyTableByAnyName(moduleConfig, tableValue);
        const possibleKeys = [
            `${table?.slug ?? tableValue}_${index}`,
            `${table?.sourceTable ?? tableValue}_${index}`,
            `${tableValue}_${index}`,
            table?.slug,
            table?.sourceTable,
            tableValue
        ].filter((key) => Boolean(key));
        for (const key of possibleKeys) {
            const recordId = item.createdIds[key];
            const record = recordId ? trackingById.get(recordId) : undefined;
            if (record && !usedIds.has(record.id)) {
                usedIds.add(record.id);
                return record;
            }
        }
        const expectedName = normalize(item.eventNamesPerTable[index] || item.eventName);
        const record = trackingRecords.find((candidate) => {
            if (usedIds.has(candidate.id)) {
                return false;
            }
            const sameTable = candidate.tableCode === table?.slug || candidate.sourceTable === table?.sourceTable || candidate.tableCode === tableValue || candidate.sourceTable === tableValue;
            const sameMatter = candidate.matterId === item.matterId ||
                candidate.matterNumber === item.matterNumber ||
                candidate.matterIdentifier === item.matterIdentifier;
            const candidateTaskName = normalize(resolveTrackingTaskName(candidate, table, undefined, item.eventNamesPerTable[index] || item.eventName));
            const sameTask = !expectedName || candidateTaskName === expectedName || candidate.eventName === item.eventName;
            return sameTable && sameMatter && sameTask;
        });
        if (record) {
            usedIds.add(record.id);
        }
        return record;
    }
    function historyHasOpenRecords(item) {
        if (!moduleConfig) {
            return false;
        }
        const usedIds = new Set();
        return item.targetTables.some((targetTable, index) => {
            const record = resolveHistoryRecord(item, targetTable, index, usedIds);
            const table = record ? resolveRecordTable(record) : findLegacyTableByAnyName(moduleConfig, targetTable);
            return Boolean(record && !record.deletedAt && !isCompletedRecord(table, record));
        });
    }
    function getOpenHistoryRecords(item) {
        if (!moduleConfig) {
            return [];
        }
        const usedIds = new Set();
        return item.targetTables
            .map((targetTable, index) => {
            const record = resolveHistoryRecord(item, targetTable, index, usedIds);
            const table = record ? resolveRecordTable(record) : findLegacyTableByAnyName(moduleConfig, targetTable);
            return record && !record.deletedAt && !isCompletedRecord(table, record) ? record : null;
        })
            .filter((record) => Boolean(record));
    }
    function makeVirtualHistory(record, table) {
        const tableKey = table?.slug ?? record.tableCode;
        const sourceKey = table?.sourceTable ?? record.sourceTable;
        const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId, record.eventName);
        return {
            id: `tracking-${record.id}`,
            moduleId: record.moduleId,
            matterId: record.matterId,
            matterNumber: record.matterNumber,
            clientNumber: record.clientNumber,
            clientName: record.clientName,
            subject: record.subject,
            specificProcess: record.specificProcess,
            matterIdentifier: record.matterIdentifier,
            eventName: taskName || record.eventName || table?.title || "Tarea",
            targetTables: [tableKey],
            eventNamesPerTable: [taskName || record.eventName || table?.title || "Tarea"],
            createdIds: {
                [`${tableKey}_0`]: record.id,
                [`${sourceKey}_0`]: record.id,
                [tableKey]: record.id,
                [sourceKey]: record.id
            },
            data: record.data ?? {},
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }
    function getHistoryRecordIds(items) {
        const ids = new Set();
        items.forEach((item) => {
            const usedIds = new Set();
            item.targetTables.forEach((targetTable, index) => {
                const record = resolveHistoryRecord(item, targetTable, index, usedIds);
                if (record) {
                    ids.add(record.id);
                }
            });
        });
        return ids;
    }
    function getEarliestOpenDate(item) {
        return getOpenHistoryRecords(item)
            .map(getRowDate)
            .filter(Boolean)
            .sort((left, right) => left.localeCompare(right))[0] ?? "";
    }
    function matchesDistributorClientSearch(item, searchWords) {
        return matchesSearchWords([item.clientName, item.clientNumber].join(" "), searchWords);
    }
    function matchesDistributorWordSearch(item, openRecords, searchWords) {
        if (searchWords.length === 0) {
            return true;
        }
        const recordText = openRecords.flatMap((record) => {
            const table = resolveRecordTable(record);
            const taskName = resolveTrackingTaskName(record, table, taskNamesByRecordId);
            return [
                taskName,
                record.taskName,
                record.eventName,
                record.tableCode,
                record.sourceTable,
                record.status,
                record.matterIdentifier,
                record.matterNumber,
                getStageLabel(table, record),
                table?.title,
                record.dueDate,
                record.termDate,
                getRowDate(record)
            ];
        });
        return matchesSearchWords([
            item.clientNumber,
            item.clientName,
            item.subject,
            item.specificProcess,
            item.matterIdentifier,
            item.matterNumber,
            item.eventName,
            item.eventNamesPerTable.join(" "),
            item.targetTables.join(" "),
            item.createdAt,
            getEarliestOpenDate(item),
            ...recordText
        ].join(" "), searchWords);
    }
    const clientSearchWords = useMemo(() => getSearchWords(clientSearch), [clientSearch]);
    const wordSearchWords = useMemo(() => getSearchWords(wordSearch), [wordSearch]);
    const taskNamesByRecordId = useMemo(() => buildDistributionHistoryTaskNameMap(history), [history]);
    const fallbackResponsibleOptions = useMemo(() => splitResponsibleOptions(moduleConfig?.defaultResponsible), [moduleConfig]);
    const moduleResponsibleOptions = useMemo(() => dedupeResponsibleOptions([...responsibleOptions, ...fallbackResponsibleOptions]), [responsibleOptions, fallbackResponsibleOptions]);
    const managerHistory = useMemo(() => {
        if (!moduleConfig) {
            return history;
        }
        const historyRecordIds = getHistoryRecordIds(history);
        const virtualHistory = trackingRecords
            .filter((record) => {
            const table = resolveRecordTable(record);
            return !historyRecordIds.has(record.id) && !record.deletedAt && !isCompletedRecord(table, record);
        })
            .map((record) => makeVirtualHistory(record, resolveRecordTable(record)));
        return [...history, ...virtualHistory];
    }, [history, moduleConfig, taskNamesByRecordId, trackingRecords]);
    const activeHistory = useMemo(() => {
        return managerHistory
            .filter(historyHasOpenRecords)
            .filter((item) => matchesDistributorClientSearch(item, clientSearchWords))
            .filter((item) => matchesDistributorWordSearch(item, getOpenHistoryRecords(item), wordSearchWords))
            .sort((left, right) => {
            const leftDate = getEarliestOpenDate(left);
            const rightDate = getEarliestOpenDate(right);
            if (!leftDate && !rightDate) {
                return left.createdAt.localeCompare(right.createdAt);
            }
            if (!leftDate) {
                return 1;
            }
            if (!rightDate) {
                return -1;
            }
            return leftDate.localeCompare(rightDate) || left.createdAt.localeCompare(right.createdAt);
        });
    }, [clientSearchWords, managerHistory, moduleConfig, taskNamesByRecordId, trackingById, trackingRecords, wordSearchWords]);
    const recycleRows = useMemo(() => {
        if (!moduleConfig) {
            return [];
        }
        return trackingRecords
            .reduce((rows, record) => {
            const table = resolveRecordTable(record);
            const reason = record.deletedAt ? "deleted" : isCompletedRecord(table, record) ? "completed" : null;
            const date = getRecycleDate(record);
            if (reason && isWithinRecycleWindow(record)) {
                rows.push({ record, table, reason, date });
            }
            return rows;
        }, [])
            .sort((left, right) => right.date.localeCompare(left.date) || left.record.clientName.localeCompare(right.record.clientName));
    }, [moduleConfig, trackingRecords]);
    function resetCatalogForm() {
        setCatalogName("");
        setCatalogEntries([]);
        setEditingCatalogId(null);
    }
    function startCatalogEdit(event) {
        if (!moduleConfig) {
            return;
        }
        setEditingCatalogId(event.id);
        setCatalogName(event.name);
        setCatalogEntries(getCatalogTargetEntries(event, moduleConfig));
    }
    function addCatalogEntry(table) {
        setCatalogEntries((current) => [
            ...current,
            makeCatalogTargetEntry(table, catalogName || table.title)
        ]);
    }
    function removeCatalogEntry(table) {
        setCatalogEntries((current) => {
            const index = current.map((entry) => entry.tableSlug).lastIndexOf(table.slug);
            if (index < 0) {
                return current;
            }
            return current.filter((_, entryIndex) => entryIndex !== index);
        });
    }
    async function saveCatalogEvent() {
        if (!moduleConfig || !catalogName.trim() || catalogEntries.length === 0) {
            return;
        }
        const payload = {
            moduleId: moduleConfig.moduleId,
            name: catalogName.trim(),
            targetTables: catalogEntries.map((entry) => encodeCatalogTarget({
                tableSlug: entry.tableSlug,
                taskName: entry.taskName.trim() || catalogName.trim()
            })),
            defaultTaskName: catalogName.trim()
        };
        if (editingCatalogId) {
            const updated = await apiPatch(`/tasks/distribution-events/${editingCatalogId}`, payload);
            setEvents((current) => current.map((event) => event.id === editingCatalogId ? updated : event));
        }
        else {
            const created = await apiPost("/tasks/distribution-events", payload);
            setEvents((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
        }
        resetCatalogForm();
    }
    async function deleteCatalogEvent(event) {
        if (!window.confirm(`Eliminar la tarea configurada "${event.name}"?`)) {
            return;
        }
        await apiDelete(`/tasks/distribution-events/${event.id}`);
        setEvents((current) => current.filter((candidate) => candidate.id !== event.id));
        if (editingCatalogId === event.id) {
            resetCatalogForm();
        }
    }
    async function patchRecord(record, patch) {
        const updated = await apiPatch(`/tasks/tracking-records/${record.id}`, patch);
        if (!updated) {
            return;
        }
        setTrackingRecords((current) => current.map((candidate) => candidate.id === record.id ? updated : candidate));
        const linkedTerm = getLinkedTerm(terms, record);
        if (linkedTerm && ("dueDate" in patch || "termDate" in patch || "responsible" in patch || "status" in patch || "deletedAt" in patch)) {
            setTerms((current) => current.map((term) => term.id === linkedTerm.id
                ? {
                    ...term,
                    dueDate: patch.dueDate === undefined ? term.dueDate : patch.dueDate ?? undefined,
                    termDate: patch.termDate === undefined ? term.termDate : patch.termDate ?? undefined,
                    responsible: patch.responsible === undefined ? term.responsible : patch.responsible,
                    status: patch.status === undefined ? term.status : patch.status,
                    deletedAt: patch.deletedAt === undefined ? term.deletedAt : patch.deletedAt ?? undefined
                }
                : term));
        }
    }
    async function patchTermEnabled(record, enabled) {
        const patch = {
            data: getTermEnabledRecordData(record, enabled),
            ...(enabled ? {} : { termDate: null })
        };
        await patchRecord(record, patch);
        if (enabled || !moduleConfig) {
            return;
        }
        const linkedTerm = getLinkedTerm(terms, record);
        if (!linkedTerm) {
            return;
        }
        const updated = await apiPatch(`/tasks/terms/${linkedTerm.id}`, {
            termDate: null,
            verification: defaultVerification(moduleConfig)
        });
        setTerms((current) => current.map((term) => term.id === updated.id ? updated : term));
    }
    function getResponsibleSelectOptions(record) {
        return dedupeResponsibleOptions([
            ...moduleResponsibleOptions,
            record.responsible
        ]);
    }
    async function patchTermVerification(record, table, taskName, key, value) {
        if (!moduleConfig) {
            return;
        }
        const linkedTerm = getLinkedTerm(terms, record);
        const verification = {
            ...getTermVerification(moduleConfig, linkedTerm),
            [key]: value
        };
        if (linkedTerm) {
            const updated = await apiPatch(`/tasks/terms/${linkedTerm.id}`, { verification });
            setTerms((current) => current.map((term) => term.id === updated.id ? updated : term));
            return;
        }
        const created = await apiPost("/tasks/terms", {
            moduleId: moduleConfig.moduleId,
            sourceTable: record.sourceTable,
            sourceRecordId: record.id,
            matterId: record.matterId ?? null,
            matterNumber: record.matterNumber ?? null,
            clientNumber: record.clientNumber ?? null,
            clientName: record.clientName,
            subject: record.subject,
            specificProcess: record.specificProcess ?? null,
            matterIdentifier: record.matterIdentifier ?? null,
            eventName: taskName || record.eventName || table?.title || "Termino",
            pendingTaskLabel: taskName || null,
            responsible: record.responsible || moduleConfig.defaultResponsible,
            dueDate: record.dueDate ?? null,
            termDate: record.termDate ?? record.dueDate ?? null,
            status: record.status,
            recurring: false,
            reportedMonth: record.reportedMonth ?? null,
            verification,
            data: record.data ?? {}
        });
        setTerms((current) => [created, ...current.filter((term) => term.id !== created.id)]);
        const updatedRecord = await apiPatch(`/tasks/tracking-records/${record.id}`, {
            termId: created.id
        });
        if (updatedRecord) {
            setTrackingRecords((current) => current.map((candidate) => candidate.id === updatedRecord.id ? updatedRecord : candidate));
        }
    }
    function renderTermVerificationControls(record, table, taskName) {
        if (!moduleConfig || !shouldShowTermVerification(table, record)) {
            return null;
        }
        const linkedTerm = getLinkedTerm(terms, record);
        const verification = getTermVerification(moduleConfig, linkedTerm);
        return (_jsx("div", { className: "tasks-active-term-verifications", "aria-label": "Verificaciones del termino", children: moduleConfig.verificationColumns.map((column) => (_jsxs("label", { className: "tasks-active-term-verification", children: [_jsx("span", { children: column.label }), _jsxs("select", { className: "tasks-active-term-verification-select", value: verification[column.key] ?? "No", onChange: (event) => void patchTermVerification(record, table, taskName, column.key, event.target.value), children: [_jsx("option", { value: "No", children: "No" }), _jsx("option", { value: "Si", children: "Si" })] })] }, column.key))) }));
    }
    async function handleMoveToTab(record, table, tab) {
        if (!table) {
            return;
        }
        const completed = tab.isCompleted || tab.status === "presentado";
        await patchRecord(record, {
            workflowStage: table.mode === "workflow" ? tab.stage ?? record.workflowStage : record.workflowStage,
            status: tab.status ?? (completed ? "presentado" : "pendiente"),
            completedAt: completed ? record.completedAt ?? new Date().toISOString() : null
        });
    }
    async function handleRestoreDeletedRecord(record, table) {
        await patchRecord(record, record.status === "presentado" || record.status === "concluida"
            ? getPreviousActivePatch(table, record)
            : { deletedAt: null });
    }
    async function handleReturnCompletedRecord(record, table) {
        await patchRecord(record, getPreviousActivePatch(table, record));
    }
    async function handleDeleteDistribution(item) {
        if (!window.confirm(`Quitar todos los registros activos de "${item.eventName}"?`)) {
            return;
        }
        const usedIds = new Set();
        const records = item.targetTables
            .map((targetTable, index) => resolveHistoryRecord(item, targetTable, index, usedIds))
            .filter((record) => Boolean(record));
        const deletedAt = new Date().toISOString();
        await Promise.all(records.map((record) => apiDelete(`/tasks/tracking-records/${record.id}`)));
        setTrackingRecords((current) => current.map((record) => records.some((deleted) => deleted.id === record.id) ? { ...record, deletedAt } : record));
        setTerms((current) => current.map((term) => records.some((record) => term.id === record.termId || term.sourceRecordId === record.id) ? { ...term, deletedAt } : term));
    }
    if (!moduleConfig) {
        return _jsx(Navigate, { to: "/app/tasks", replace: true });
    }
    return (_jsxs("section", { className: "page-stack tasks-legacy-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsx("div", { className: "execution-page-topline", children: _jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}`), children: "Volver al dashboard" }) }), _jsxs("h2", { children: ["Manager de tareas (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "La pesta\u00F1a de tareas activas es la fuente operativa: sus registros alimentan las tablas de seguimiento y el modulo de ejecucion. La configuracion define el catalogo usado por el Selector de Tareas." })] }), _jsxs("section", { className: "panel", children: [_jsxs("div", { className: "tasks-legacy-tabs tasks-distributor-tabs", children: [_jsx("button", { type: "button", className: activeTab === "active" ? "is-active" : "", onClick: () => setActiveTab("active"), children: "Tareas activas" }), _jsx("button", { type: "button", className: activeTab === "config" ? "is-active" : "", onClick: () => setActiveTab("config"), children: "Configuraci\u00F3n" })] }), activeTab === "active" ? (_jsxs("div", { className: "tasks-distributor-active", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsxs("h2", { children: ["Tareas activas (", moduleConfig.label, ")"] }), _jsx("p", { className: "muted", children: "Registro de tareas distribuidas. Editar aqui actualiza la informacion que se ve en seguimiento y ejecucion." })] }), _jsxs("span", { children: [activeHistory.length, " activas"] })] }), _jsx("div", { className: "tasks-distributor-search-panel", children: _jsxs("div", { className: "matters-toolbar execution-search-toolbar", children: [_jsxs("div", { className: "matters-filters leads-search-filters matters-active-search-filters execution-search-filters", children: [_jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscar por palabra" }), _jsx("input", { type: "text", value: wordSearch, onChange: (event) => setWordSearch(event.target.value), placeholder: "ID, asunto, tarea, tabla..." })] }), _jsxs("label", { className: "form-field matters-search-field", children: [_jsx("span", { children: "Buscador por cliente" }), _jsx("input", { type: "text", value: clientSearch, onChange: (event) => setClientSearch(event.target.value), placeholder: "Buscar palabra del cliente..." })] })] }), _jsxs("div", { className: "matters-toolbar-actions tasks-distributor-search-actions", children: [_jsx("span", { className: "muted", children: "Filtra las tareas activas por cliente o por cualquier dato del asunto, tarea, tabla o vencimiento." }), executionModule ? (_jsx("button", { type: "button", className: "secondary-button", onClick: () => navigate(`/app/execution/${executionModule.slug}`), children: "Ir a Ejecuci\u00F3n" })) : null, _jsx("button", { type: "button", className: "secondary-button", onClick: () => document.getElementById("tasks-recycle-bin")?.scrollIntoView({ behavior: "smooth", block: "start" }), children: "Ir a papelera" })] })] }) }), _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-legacy-table tasks-distributor-active-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "No. Cliente" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "Proceso especifico" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Tablas / tareas" })] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "centered-inline-message", children: "Cargando tareas activas..." }) })) : activeHistory.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "centered-inline-message", children: "No hay tareas activas en este equipo." }) })) : (activeHistory.map((item) => {
                                                const usedIds = new Set();
                                                return (_jsxs("tr", { children: [_jsx("td", { children: item.clientNumber || "-" }), _jsx("td", { children: item.clientName || "-" }), _jsx("td", { children: item.subject || "-" }), _jsx("td", { children: _jsx("span", { className: "tasks-legacy-process-pill", children: item.specificProcess || "N/A" }) }), _jsx("td", { children: item.matterIdentifier || item.matterNumber || "-" }), _jsx("td", { children: _jsxs("div", { className: "tasks-active-target-list", children: [_jsxs("div", { className: "tasks-active-target-toolbar", children: [_jsxs("span", { children: ["Fecha m\u00E1s pr\u00F3xima: ", getEarliestOpenDate(item) || "sin fecha"] }), _jsx("button", { type: "button", className: "danger-button tasks-distributor-small-button", onClick: () => void handleDeleteDistribution(item), children: "Borrar tarea completamente" })] }), item.targetTables.map((targetTable, index) => {
                                                                        const record = resolveHistoryRecord(item, targetTable, index, usedIds);
                                                                        const table = record ? resolveRecordTable(record) : findLegacyTableByAnyName(moduleConfig, targetTable);
                                                                        const completed = record ? isCompletedRecord(table, record) : false;
                                                                        const currentTabKey = record ? getRecordTabKey(table, record) : "";
                                                                        const showPresentationAndTermDates = usesPresentationAndTermDates(table);
                                                                        const taskName = record
                                                                            ? resolveTrackingTaskName(record, table, taskNamesByRecordId, item.eventNamesPerTable[index] || item.eventName)
                                                                            : item.eventNamesPerTable[index] || item.eventName;
                                                                        const linkedTerm = record ? getLinkedTerm(terms, record) : undefined;
                                                                        const termEnabled = record ? isTrackingTermEnabled(record, table) : false;
                                                                        const showTermToggle = usesOptionalTermToggle(table);
                                                                        const showTermVerification = record ? shouldShowTermVerification(table, record) : false;
                                                                        const danger = record
                                                                            ? isTrackingRecordRed(table, record, taskNamesByRecordId)
                                                                                || (showTermVerification && hasIncompleteTermVerification(moduleConfig, linkedTerm))
                                                                            : true;
                                                                        if (!record || record.deletedAt || completed) {
                                                                            return null;
                                                                        }
                                                                        return (_jsxs("article", { className: `tasks-active-target-card ${danger ? "is-danger" : completed ? "is-completed" : ""}`, children: [_jsxs("div", { className: "tasks-active-target-head", children: [_jsx("div", { children: _jsx("strong", { children: taskName || "-" }) }), record && table ? (_jsxs("div", { className: "tasks-active-target-link-panel", children: [_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => navigate(`/app/tasks/${moduleConfig.slug}/${table.slug}`), children: "Ir a tabla de seguimiento" }), _jsx("strong", { children: table.title })] })) : null] }), record ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: `tasks-active-target-fields${showPresentationAndTermDates ? " tasks-active-target-fields-with-term" : ""}${showPresentationAndTermDates && !showTermToggle ? " tasks-active-target-fields-required-term" : ""}`, children: [_jsxs("label", { className: "tasks-active-target-field", children: [_jsx("span", { children: "Tarea" }), _jsx("input", { className: "tasks-legacy-input", value: taskName, onChange: (event) => void patchRecord(record, { taskName: event.target.value }), "aria-label": "Nombre de la tarea" })] }), _jsxs("label", { className: "tasks-active-target-field", children: [_jsx("span", { children: "Responsable" }), _jsxs("select", { className: "tasks-legacy-input", value: record.responsible, onChange: (event) => void patchRecord(record, { responsible: event.target.value }), "aria-label": "Responsable", children: [_jsx("option", { value: "", children: "Seleccionar responsable" }), getResponsibleSelectOptions(record).map((responsible) => (_jsx("option", { value: responsible, children: responsible }, responsible)))] })] }), table?.showReportedPeriod ? (_jsxs("label", { className: "tasks-active-target-field", children: [_jsx("span", { children: table.reportedPeriodLabel ?? "Mes reportado" }), _jsx("input", { className: "tasks-legacy-input", type: "month", value: record.reportedMonth ?? "", onChange: (event) => void patchRecord(record, { reportedMonth: event.target.value || null }), "aria-label": table.reportedPeriodLabel ?? "Mes reportado" })] })) : null, showPresentationAndTermDates ? (_jsxs(_Fragment, { children: [_jsxs("label", { className: "tasks-active-target-field", children: [_jsx("span", { children: table?.dateLabel ?? "Fecha debe presentarse" }), _jsx("input", { className: "tasks-legacy-input", type: "date", value: toDateInput(record.dueDate), onChange: (event) => void patchRecord(record, { dueDate: event.target.value || null }), "aria-label": "Fecha debe presentarse" })] }), showTermToggle ? (_jsxs("label", { className: "tasks-active-target-field tasks-active-term-toggle-field", children: [_jsx("span", { children: "Es t\u00E9rmino" }), _jsx("input", { className: "tasks-active-term-toggle-input", type: "checkbox", checked: termEnabled, onChange: (event) => void patchTermEnabled(record, event.target.checked), "aria-label": "Habilitar t\u00E9rmino" })] })) : null, _jsxs("label", { className: "tasks-active-target-field", children: [_jsx("span", { children: table?.termDateLabel ?? "Término" }), _jsx("input", { className: "tasks-legacy-input", type: "date", value: toDateInput(record.termDate), onChange: (event) => void patchRecord(record, { termDate: event.target.value || null }), disabled: showTermToggle && !termEnabled, "aria-label": table?.termDateLabel ?? "Término" })] }), _jsx("div", { className: "tasks-active-term-verification-row", children: renderTermVerificationControls(record, table, taskName) })] })) : null, showPresentationAndTermDates || table?.showDateColumn === false ? null : (_jsxs(_Fragment, { children: [_jsxs("label", { className: "tasks-active-target-field", children: [_jsx("span", { children: table?.dateLabel ?? "Fecha límite" }), _jsx("input", { className: "tasks-legacy-input", type: "date", value: toDateInput(record.dueDate) || getRowDate(record), onChange: (event) => void patchRecord(record, {
                                                                                                                        dueDate: event.target.value || null,
                                                                                                                        termDate: null
                                                                                                                    }), "aria-label": table?.dateLabel ?? "Fecha límite" })] }), _jsx("div", { className: "tasks-active-term-verification-row tasks-active-term-verification-row-date-only", children: renderTermVerificationControls(record, table, taskName) })] }))] }), _jsxs("div", { className: "tasks-active-stage-field", children: [_jsx("span", { className: "tasks-active-stage-label", children: "Pesta\u00F1a en tabla de seguimiento" }), _jsx("div", { className: "tasks-active-stage-actions", "aria-label": "Mover tarea entre pesta\u00F1as", children: table?.tabs.map((tab) => {
                                                                                                        const current = tab.key === currentTabKey;
                                                                                                        return (_jsx("button", { type: "button", className: `secondary-button tasks-distributor-small-button tasks-active-stage-button ${current ? "is-current" : ""}`, onClick: () => void handleMoveToTab(record, table, tab), disabled: current, "aria-pressed": current, children: tab.label }, tab.key));
                                                                                                    }) })] })] })) : null] }, `${item.id}-${targetTable}-${index}`));
                                                                    })] }) })] }, item.id));
                                            })) })] }) }), _jsxs("section", { id: "tasks-recycle-bin", className: "tasks-recycle-section", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Papelera de reciclaje" }), _jsx("p", { className: "muted", children: "Muestra tareas borradas o completadas durante los ultimos 30 dias. Desde aqui puedes recuperarlas al flujo activo del Manager de tareas." })] }), _jsxs("span", { children: [recycleRows.length, " disponibles"] })] }), _jsx("div", { className: "table-scroll tasks-legacy-table-wrap", children: _jsxs("table", { className: "data-table tasks-recycle-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Fecha" }), _jsx("th", { children: "Estado" }), _jsx("th", { children: "Cliente" }), _jsx("th", { children: "Asunto" }), _jsx("th", { children: "ID Asunto" }), _jsx("th", { children: "Tabla" }), _jsx("th", { children: "Tarea" }), _jsx("th", { children: "Accion" })] }) }), _jsx("tbody", { children: recycleRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 8, className: "centered-inline-message", children: "No hay tareas en la papelera de los ultimos 30 dias." }) })) : (recycleRows.map(({ record, table, reason, date }) => (_jsxs("tr", { children: [_jsx("td", { children: toDisplayDate(date) }), _jsx("td", { children: _jsx("span", { className: `tasks-recycle-status ${reason === "deleted" ? "is-deleted" : "is-completed"}`, children: reason === "deleted" ? "Borrada" : "Completada" }) }), _jsx("td", { children: record.clientName || "-" }), _jsx("td", { children: record.subject || "-" }), _jsx("td", { children: record.matterIdentifier || record.matterNumber || "-" }), _jsx("td", { children: table?.title ?? record.tableCode }), _jsx("td", { children: resolveTrackingTaskName(record, table, taskNamesByRecordId) || "-" }), _jsx("td", { children: reason === "deleted" ? (_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => void handleRestoreDeletedRecord(record, table), children: "Recuperar" })) : (_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => void handleReturnCompletedRecord(record, table), children: "Regresar a penultima pestana" })) })] }, `${reason}-${record.id}`)))) })] }) })] })] })) : (_jsxs("div", { className: "tasks-distributor-config", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Gesti\u00F3n de Cat\u00E1logo de Tareas" }), _jsx("p", { className: "muted", children: "Define la tarea maestra y cuantas filas debe crear en cada tabla de seguimiento." })] }), _jsxs("span", { children: [events.length, " configuradas"] })] }), _jsxs("div", { className: "tasks-distributor-config-layout", children: [_jsxs("article", { className: "tasks-distributor-card", children: [_jsxs("label", { children: ["Nombre de la Tarea", _jsx("input", { className: "tasks-legacy-input", value: catalogName, onChange: (event) => setCatalogName(event.target.value), placeholder: "Ej. Desahogar prevenci\u00F3n" })] }), _jsx("div", { className: "tasks-distributor-table-count-grid", children: moduleConfig.tables.map((table) => {
                                                    const entries = catalogEntries.filter((entry) => entry.tableSlug === table.slug);
                                                    return (_jsxs("div", { className: "tasks-distributor-table-count-card", children: [_jsxs("div", { className: "tasks-distributor-target-head", children: [_jsx("strong", { children: table.title }), _jsxs("div", { className: "tasks-distributor-count-controls", children: [_jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => removeCatalogEntry(table), children: "-" }), _jsx("span", { children: entries.length }), _jsx("button", { type: "button", className: "secondary-button tasks-distributor-small-button", onClick: () => addCatalogEntry(table), children: "+" })] })] }), entries.length > 0 ? (_jsx("div", { className: "tasks-distributor-entry-name-list", children: entries.map((entry) => (_jsx("input", { className: "tasks-legacy-input", value: entry.taskName, onChange: (event) => setCatalogEntries((current) => current.map((candidate) => candidate.id === entry.id ? { ...candidate, taskName: event.target.value } : candidate)), placeholder: "Nombre para esta tabla" }, entry.id))) })) : null] }, table.slug));
                                                }) }), _jsxs("div", { className: "tasks-legacy-actions", children: [_jsx("button", { type: "button", className: "primary-action-button", onClick: () => void saveCatalogEvent(), disabled: !catalogName.trim() || catalogEntries.length === 0, children: editingCatalogId ? "Guardar cambios" : "Guardar tarea" }), editingCatalogId ? (_jsx("button", { type: "button", className: "secondary-button", onClick: resetCatalogForm, children: "Cancelar" })) : null] })] }), _jsxs("article", { className: "tasks-distributor-card", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Cat\u00E1logo guardado" }), _jsx("span", { children: events.length })] }), _jsx("div", { className: "tasks-distributor-event-list", children: events.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "Aun no hay tareas configuradas." })) : (events.map((event) => {
                                                    const entries = getCatalogTargetEntries(event, moduleConfig);
                                                    return (_jsxs("div", { className: "tasks-distributor-event-row tasks-distributor-catalog-row", children: [_jsxs("div", { children: [_jsx("strong", { children: event.name }), _jsxs("span", { children: [entries.length, " destino", entries.length === 1 ? "" : "s"] }), _jsx("div", { className: "tasks-legacy-chip-list", children: entries.map((entry) => (_jsxs("span", { children: [getTableDisplayName(moduleConfig, entry.tableSlug), ": ", entry.taskName] }, entry.id))) })] }), _jsx("button", { type: "button", className: "secondary-button", onClick: () => startCatalogEdit(event), children: "Configurar" }), _jsx("button", { type: "button", className: "danger-button", onClick: () => void deleteCatalogEvent(event), children: "Eliminar" })] }, event.id));
                                                })) })] })] })] }))] })] }));
}
