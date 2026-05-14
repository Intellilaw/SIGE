import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { EXECUTION_HOLIDAY_AUTHORITIES, HOLIDAY_AUTHORITIES } from "@sige/contracts";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";
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
const WEEKDAY_LABELS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const ALL_AUTHORITIES_OPTION = "ALL_AUTHORITIES";
const ALL_AUTHORITIES_LABEL = "Todos los \u00f3rganos";
const EXECUTION_TO_HOLIDAY_AUTHORITY_SHORT_NAME = {
    PJF: "PJF",
    PJCDMX: "TSJCDMX",
    PJEdoMex: "PJEdoMex",
    TFJA: "TFJA",
    TJACDMX: "TJACDMX",
    SAT: "SAT",
    APF: "APF",
    APCDMX: "APCDMX"
};
const HOLIDAY_ORGAN_AUTHORITIES = EXECUTION_HOLIDAY_AUTHORITIES.map((shortName) => {
    const holidayShortName = EXECUTION_TO_HOLIDAY_AUTHORITY_SHORT_NAME[shortName];
    const authority = HOLIDAY_AUTHORITIES.find((candidate) => candidate.shortName === holidayShortName);
    return {
        shortName,
        holidayShortName,
        name: authority?.name ?? shortName
    };
});
const HOLIDAY_ORGAN_AUTHORITY_SET = new Set(HOLIDAY_ORGAN_AUTHORITIES.map((authority) => authority.holidayShortName));
const HOLIDAY_ORGAN_AUTHORITY_COUNT = HOLIDAY_ORGAN_AUTHORITIES.length;
function getCurrentPeriod() {
    const today = new Date();
    return {
        year: today.getFullYear(),
        month: today.getMonth() + 1
    };
}
function toDateKey(year, month, day) {
    return [
        String(year).padStart(4, "0"),
        String(month).padStart(2, "0"),
        String(day).padStart(2, "0")
    ].join("-");
}
function formatDateDisplay(value) {
    const [year, month, day] = value.slice(0, 10).split("-");
    return year && month && day ? `${day}/${month}/${year}` : value;
}
function toErrorMessage(error) {
    return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}
function hasPermission(permissions, permission) {
    return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}
function buildCalendarCells(year, month) {
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    const dayCount = new Date(year, month, 0).getDate();
    const cells = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= dayCount; day += 1) {
        cells.push(toDateKey(year, month, day));
    }
    while (cells.length % 7 !== 0) {
        cells.push(null);
    }
    return cells;
}
function replaceHoliday(items, updated) {
    return items.map((item) => (item.id === updated.id ? updated : item));
}
function summarizeAllAuthoritiesLabel(labels, authorityCount) {
    const authoritySummary = authorityCount >= HOLIDAY_ORGAN_AUTHORITY_COUNT
        ? "todos los organos"
        : `${authorityCount} de ${HOLIDAY_ORGAN_AUTHORITY_COUNT} organos`;
    if (labels.length === 0) {
        return `Dia inhabil para ${authoritySummary}`;
    }
    if (labels.length === 1) {
        return `${labels[0]} (${authoritySummary})`;
    }
    return `${labels.slice(0, 2).join(" / ")}${labels.length > 2 ? ` +${labels.length - 2}` : ""} (${authoritySummary})`;
}
function getDisplayAuthorityShortName(authorityShortName) {
    return HOLIDAY_ORGAN_AUTHORITIES.find((authority) => authority.holidayShortName === authorityShortName)?.shortName
        ?? authorityShortName;
}
export function HolidaysPage() {
    const { user } = useAuth();
    const initialPeriod = getCurrentPeriod();
    const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
    const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
    const [selectedAuthority, setSelectedAuthority] = useState("PJF");
    const [holidays, setHolidays] = useState([]);
    const [labelDrafts, setLabelDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const canRead = hasPermission(user?.permissions, "holidays:read") || hasPermission(user?.permissions, "holidays:write");
    const canWrite = hasPermission(user?.permissions, "holidays:write");
    const isAllAuthoritiesSelected = selectedAuthority === ALL_AUTHORITIES_OPTION;
    const selectedHolidayAuthorityShortName = isAllAuthoritiesSelected
        ? undefined
        : EXECUTION_TO_HOLIDAY_AUTHORITY_SHORT_NAME[selectedAuthority];
    async function loadHolidays() {
        if (!canRead) {
            setHolidays([]);
            setLoading(false);
            setErrorMessage("No tienes permisos para consultar dias inhabiles.");
            return;
        }
        setLoading(true);
        setErrorMessage(null);
        try {
            const response = await apiGet(`/holidays?year=${selectedYear}&month=${selectedMonth}`);
            setHolidays(response.holidays);
            setLabelDrafts({});
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void loadHolidays();
    }, [canRead, selectedMonth, selectedYear]);
    const cells = useMemo(() => buildCalendarCells(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
    const visibleHolidays = useMemo(() => {
        return holidays.filter((holiday) => HOLIDAY_ORGAN_AUTHORITY_SET.has(holiday.authorityShortName));
    }, [holidays]);
    const holidaysByDate = useMemo(() => {
        const grouped = new Map();
        visibleHolidays.forEach((holiday) => {
            const items = grouped.get(holiday.date) ?? [];
            items.push(holiday);
            grouped.set(holiday.date, items);
        });
        return grouped;
    }, [visibleHolidays]);
    const selectedAuthorityHolidays = useMemo(() => {
        if (selectedAuthority === ALL_AUTHORITIES_OPTION) {
            return [];
        }
        return visibleHolidays
            .filter((holiday) => holiday.authorityShortName === selectedHolidayAuthorityShortName)
            .sort((left, right) => left.date.localeCompare(right.date));
    }, [selectedAuthority, selectedHolidayAuthorityShortName, visibleHolidays]);
    const selectedAuthorityByDate = useMemo(() => new Map(selectedAuthorityHolidays.map((holiday) => [holiday.date, holiday])), [selectedAuthorityHolidays]);
    const allAuthoritiesHolidayRows = useMemo(() => {
        const grouped = new Map();
        visibleHolidays.forEach((holiday) => {
            const items = grouped.get(holiday.date) ?? [];
            items.push(holiday);
            grouped.set(holiday.date, items);
        });
        return Array.from(grouped.entries())
            .map(([date, items]) => {
            const labels = Array.from(new Set(items.map((holiday) => holiday.label || "Dia inhabil"))).sort((left, right) => left.localeCompare(right));
            const authorityCount = new Set(items.map((holiday) => holiday.authorityShortName)).size;
            return {
                date,
                label: summarizeAllAuthoritiesLabel(labels, authorityCount),
                authorityCount,
                manualItems: items.filter((holiday) => !holiday.automatic)
            };
        })
            .sort((left, right) => left.date.localeCompare(right.date));
    }, [visibleHolidays]);
    const allAuthoritiesDateCount = useMemo(() => allAuthoritiesHolidayRows.filter((row) => row.authorityCount >= HOLIDAY_ORGAN_AUTHORITY_COUNT).length, [allAuthoritiesHolidayRows]);
    const countsByAuthority = useMemo(() => {
        const counts = new Map();
        visibleHolidays.forEach((holiday) => {
            counts.set(holiday.authorityShortName, (counts.get(holiday.authorityShortName) ?? 0) + 1);
        });
        return counts;
    }, [visibleHolidays]);
    const selectedAuthorityDetails = HOLIDAY_ORGAN_AUTHORITIES.find((authority) => authority.shortName === selectedAuthority);
    async function toggleHoliday(date) {
        if (!canWrite) {
            return;
        }
        if (selectedAuthority === ALL_AUTHORITIES_OPTION) {
            const dateHolidays = holidaysByDate.get(date) ?? [];
            const authoritiesWithHoliday = new Set(dateHolidays.map((holiday) => holiday.authorityShortName));
            const allAuthoritiesHaveHoliday = HOLIDAY_ORGAN_AUTHORITIES.every((authority) => authoritiesWithHoliday.has(authority.holidayShortName));
            const manualItems = dateHolidays.filter((holiday) => !holiday.automatic);
            setSavingKey(`${ALL_AUTHORITIES_OPTION}:${date}`);
            setErrorMessage(null);
            try {
                if (allAuthoritiesHaveHoliday) {
                    if (manualItems.length === 0) {
                        return;
                    }
                    await Promise.all(manualItems.map((holiday) => apiDelete(`/holidays/${holiday.id}`)));
                    const deletedIds = new Set(manualItems.map((holiday) => holiday.id));
                    setHolidays((items) => items.filter((item) => !deletedIds.has(item.id)));
                    return;
                }
                await Promise.all(HOLIDAY_ORGAN_AUTHORITIES.map((authority) => apiPost("/holidays", {
                    date,
                    authorityShortName: authority.holidayShortName,
                    label: "Dia inhabil"
                })));
                await loadHolidays();
            }
            catch (error) {
                setErrorMessage(toErrorMessage(error));
                await loadHolidays();
            }
            finally {
                setSavingKey(null);
            }
            return;
        }
        const existing = selectedAuthorityByDate.get(date);
        setSavingKey(`${selectedAuthority}:${date}`);
        setErrorMessage(null);
        try {
            if (existing) {
                if (existing.automatic) {
                    return;
                }
                await apiDelete(`/holidays/${existing.id}`);
                setHolidays((items) => items.filter((item) => item.id !== existing.id));
                return;
            }
            const created = await apiPost("/holidays", {
                date,
                authorityShortName: selectedHolidayAuthorityShortName,
                label: "Dia inhabil"
            });
            setHolidays((items) => [...items, created]);
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadHolidays();
        }
        finally {
            setSavingKey(null);
        }
    }
    async function deleteHoliday(holiday) {
        if (!canWrite || holiday.automatic) {
            return;
        }
        setSavingKey(holiday.id);
        setErrorMessage(null);
        try {
            await apiDelete(`/holidays/${holiday.id}`);
            setHolidays((items) => items.filter((item) => item.id !== holiday.id));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadHolidays();
        }
        finally {
            setSavingKey(null);
        }
    }
    async function deleteAllAuthoritiesHoliday(date, manualItems) {
        if (!canWrite || manualItems.length === 0) {
            return;
        }
        setSavingKey(`${ALL_AUTHORITIES_OPTION}:${date}`);
        setErrorMessage(null);
        try {
            await Promise.all(manualItems.map((holiday) => apiDelete(`/holidays/${holiday.id}`)));
            const deletedIds = new Set(manualItems.map((holiday) => holiday.id));
            setHolidays((items) => items.filter((item) => !deletedIds.has(item.id)));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadHolidays();
        }
        finally {
            setSavingKey(null);
        }
    }
    function setLabelDraft(holidayId, value) {
        setLabelDrafts((current) => ({
            ...current,
            [holidayId]: value
        }));
    }
    async function persistHolidayPatch(holiday, payload) {
        if (holiday.automatic) {
            return;
        }
        setSavingKey(holiday.id);
        setErrorMessage(null);
        try {
            const updated = await apiPatch(`/holidays/${holiday.id}`, payload);
            setHolidays((items) => replaceHoliday(items, updated));
        }
        catch (error) {
            setErrorMessage(toErrorMessage(error));
            await loadHolidays();
        }
        finally {
            setSavingKey(null);
        }
    }
    async function flushLabelDraft(holiday) {
        if (!canWrite || holiday.automatic) {
            return;
        }
        const draft = labelDrafts[holiday.id];
        if (draft === undefined || draft === holiday.label) {
            return;
        }
        setLabelDrafts((current) => {
            const next = { ...current };
            delete next[holiday.id];
            return next;
        });
        await persistHolidayPatch(holiday, { label: draft });
    }
    function goToRelativeMonth(offset) {
        const target = new Date(selectedYear, selectedMonth - 1 + offset, 1);
        setSelectedYear(target.getFullYear());
        setSelectedMonth(target.getMonth() + 1);
    }
    return (_jsxs("section", { className: "page-stack holidays-page", children: [_jsxs("header", { className: "hero module-hero holidays-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Dias" }), _jsx("div", { children: _jsx("h2", { children: "Dias inhabiles" }) })] }), _jsx("p", { className: "muted", children: "Calendario por organo para alimentar calculos de terminos, vencimientos y futuras vinculaciones por asunto." })] }), errorMessage ? _jsx("div", { className: "message-banner message-error", children: errorMessage }) : null, _jsxs("section", { className: "panel holidays-panel", children: [_jsxs("div", { className: "panel-header holidays-panel-header", children: [_jsxs("div", { children: [_jsxs("h2", { children: [MONTH_NAMES[selectedMonth - 1], " ", selectedYear] }), _jsxs("span", { children: [visibleHolidays.length, " fechas marcadas"] })] }), _jsxs("div", { className: "holidays-month-actions", children: [_jsx("button", { className: "secondary-button", type: "button", onClick: () => goToRelativeMonth(-1), children: "Anterior" }), _jsxs("label", { className: "form-field holidays-month-field", children: [_jsx("span", { children: "Mes" }), _jsx("select", { value: selectedMonth, onChange: (event) => setSelectedMonth(Number(event.target.value)), children: MONTH_NAMES.map((monthName, index) => (_jsx("option", { value: index + 1, children: monthName }, monthName))) })] }), _jsxs("label", { className: "form-field holidays-year-field", children: [_jsx("span", { children: "Anio" }), _jsx("input", { type: "number", min: "1900", max: "2100", value: selectedYear, onChange: (event) => setSelectedYear(Number(event.target.value)) })] }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => goToRelativeMonth(1), children: "Siguiente" }), _jsx("button", { className: "secondary-button", type: "button", onClick: () => void loadHolidays(), children: "Refrescar" })] })] }), _jsxs("div", { className: "holidays-authority-strip", role: "tablist", "aria-label": "Autoridades", children: [_jsxs("button", { "aria-selected": isAllAuthoritiesSelected, className: isAllAuthoritiesSelected ? "is-active is-all-authorities" : "is-all-authorities", onClick: () => setSelectedAuthority(ALL_AUTHORITIES_OPTION), role: "tab", type: "button", children: [_jsx("strong", { children: ALL_AUTHORITIES_LABEL }), _jsx("span", { children: "Marcar o consultar todos los organos" }), _jsx("small", { children: allAuthoritiesDateCount })] }), HOLIDAY_ORGAN_AUTHORITIES.map((authority) => {
                                const isActive = authority.shortName === selectedAuthority;
                                return (_jsxs("button", { "aria-selected": isActive, className: isActive ? "is-active" : undefined, onClick: () => setSelectedAuthority(authority.shortName), role: "tab", type: "button", children: [_jsx("strong", { children: authority.shortName }), _jsx("span", { children: authority.name }), _jsx("small", { children: countsByAuthority.get(authority.holidayShortName) ?? 0 })] }, authority.shortName));
                            })] }), _jsxs("div", { className: "holidays-layout", children: [_jsxs("section", { className: "holidays-calendar-shell", "aria-label": "Calendario mensual", children: [_jsx("div", { className: "holidays-weekdays", children: WEEKDAY_LABELS.map((weekday) => (_jsx("span", { children: weekday }, weekday))) }), _jsx("div", { className: "holidays-calendar-grid", children: cells.map((date, index) => {
                                            if (!date) {
                                                return _jsx("div", { "aria-hidden": "true", className: "holidays-day is-empty" }, `empty-${index}`);
                                            }
                                            const dayNumber = Number(date.slice(8, 10));
                                            const dateHolidays = holidaysByDate.get(date) ?? [];
                                            const selectedHoliday = selectedAuthorityByDate.get(date);
                                            const authoritiesWithHoliday = new Set(dateHolidays.map((holiday) => holiday.authorityShortName));
                                            const allAuthoritiesHaveHoliday = HOLIDAY_ORGAN_AUTHORITIES.every((authority) => authoritiesWithHoliday.has(authority.holidayShortName));
                                            const isSelectedInScope = isAllAuthoritiesSelected ? allAuthoritiesHaveHoliday : Boolean(selectedHoliday);
                                            const isWeekend = index % 7 === 0 || index % 7 === 6;
                                            const saving = savingKey === `${selectedAuthority}:${date}`;
                                            return (_jsxs("button", { "aria-pressed": isSelectedInScope, className: [
                                                    "holidays-day",
                                                    isWeekend ? "is-weekend" : "",
                                                    dateHolidays.length > 0 ? "has-holiday" : "",
                                                    isSelectedInScope ? "is-selected-authority" : ""
                                                ].filter(Boolean).join(" "), disabled: !canWrite || saving, onClick: () => void toggleHoliday(date), title: selectedHoliday?.automatic && !isAllAuthoritiesSelected
                                                    ? `${formatDateDisplay(date)} - automatico`
                                                    : `${formatDateDisplay(date)} - ${isAllAuthoritiesSelected ? ALL_AUTHORITIES_LABEL : selectedAuthority}`, type: "button", children: [_jsx("span", { className: "holidays-day-number", children: dayNumber }), _jsx("span", { className: "holidays-day-badges", children: dateHolidays.map((holiday) => (_jsx("span", { className: isAllAuthoritiesSelected || holiday.authorityShortName === selectedHolidayAuthorityShortName
                                                                ? "is-selected"
                                                                : undefined, children: getDisplayAuthorityShortName(holiday.authorityShortName) }, holiday.id))) })] }, date));
                                        }) })] }), _jsxs("aside", { className: "holidays-detail-panel", children: [_jsxs("div", { className: "holidays-selected-authority", children: [_jsx("strong", { children: isAllAuthoritiesSelected ? ALL_AUTHORITIES_LABEL : selectedAuthorityDetails?.shortName }), _jsx("span", { children: isAllAuthoritiesSelected
                                                    ? "Aplica la seleccion a todos los organos"
                                                    : selectedAuthorityDetails?.name }), _jsx("small", { children: canWrite ? "Edicion habilitada" : "Solo lectura" })] }), _jsx("div", { className: "holidays-detail-table-shell", children: _jsxs("table", { className: "data-table holidays-detail-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Fecha" }), _jsx("th", { children: "Motivo" }), _jsx("th", {})] }) }), _jsx("tbody", { children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "centered-inline-message", children: "Cargando dias..." }) })) : isAllAuthoritiesSelected ? (allAuthoritiesHolidayRows.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "centered-inline-message", children: "Sin fechas marcadas." }) })) : (allAuthoritiesHolidayRows.map((row) => (_jsxs("tr", { children: [_jsx("td", { className: "holidays-date-cell", children: formatDateDisplay(row.date) }), _jsx("td", { children: _jsxs("div", { className: "holidays-all-authorities-label", children: [_jsx("strong", { children: row.label }), _jsxs("small", { children: [row.authorityCount, " de ", HOLIDAY_ORGAN_AUTHORITY_COUNT, " organos"] })] }) }), _jsx("td", { children: row.manualItems.length === 0 ? (_jsx("span", { className: "holidays-source-pill is-weekend", children: "Automatico" })) : (_jsx("button", { className: "danger-button holidays-delete-button", disabled: !canWrite || savingKey === `${ALL_AUTHORITIES_OPTION}:${row.date}`, onClick: () => void deleteAllAuthoritiesHoliday(row.date, row.manualItems), type: "button", children: "Quitar" })) })] }, `all-${row.date}`))))) : selectedAuthorityHolidays.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "centered-inline-message", children: "Sin fechas marcadas." }) })) : (selectedAuthorityHolidays.map((holiday) => (_jsxs("tr", { children: [_jsx("td", { className: "holidays-date-cell", children: formatDateDisplay(holiday.date) }), _jsx("td", { children: _jsx("input", { className: "holidays-label-input", disabled: !canWrite || holiday.automatic || savingKey === holiday.id, onBlur: () => void flushLabelDraft(holiday), onChange: (event) => setLabelDraft(holiday.id, event.target.value), value: labelDrafts[holiday.id] ?? holiday.label }) }), _jsx("td", { children: holiday.automatic ? (_jsx("span", { className: `holidays-source-pill is-${holiday.source.toLowerCase()}`, children: "Automatico" })) : (_jsx("button", { className: "danger-button holidays-delete-button", disabled: !canWrite || savingKey === holiday.id, onClick: () => void deleteHoliday(holiday), type: "button", children: "Quitar" })) })] }, holiday.id)))) })] }) })] })] })] })] }));
}
