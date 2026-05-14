import { useEffect, useMemo, useState } from "react";
import {
  EXECUTION_HOLIDAY_AUTHORITIES,
  HOLIDAY_AUTHORITIES,
  type ExecutionHolidayAuthorityShortName,
  type Holiday,
  type HolidayAuthorityShortName
} from "@sige/contracts";

import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
import { useAuth } from "../auth/AuthContext";

type HolidaysOverview = {
  year: number;
  month: number;
  authorities: Array<{
    shortName: HolidayAuthorityShortName;
    name: string;
  }>;
  holidays: Holiday[];
};

type HolidayPatchPayload = {
  date?: string;
  authorityShortName?: HolidayAuthorityShortName;
  label?: string | null;
};

type SelectedHolidayAuthority = ExecutionHolidayAuthorityShortName | typeof ALL_AUTHORITIES_OPTION;
type HolidayOrganAuthority = {
  shortName: ExecutionHolidayAuthorityShortName;
  holidayShortName: HolidayAuthorityShortName;
  name: string;
};
type AllAuthoritiesHolidayRow = {
  date: string;
  label: string;
  authorityCount: number;
  manualItems: Holiday[];
};

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
const ALL_AUTHORITIES_OPTION = "ALL_AUTHORITIES" as const;
const ALL_AUTHORITIES_LABEL = "Todos los \u00f3rganos";
const EXECUTION_TO_HOLIDAY_AUTHORITY_SHORT_NAME: Record<ExecutionHolidayAuthorityShortName, HolidayAuthorityShortName> = {
  PJF: "PJF",
  PJCDMX: "TSJCDMX",
  PJEdoMex: "PJEdoMex",
  TFJA: "TFJA",
  TJACDMX: "TJACDMX",
  SAT: "SAT",
  APF: "APF",
  APCDMX: "APCDMX"
};
const HOLIDAY_ORGAN_AUTHORITIES: HolidayOrganAuthority[] = EXECUTION_HOLIDAY_AUTHORITIES.map((shortName) => {
  const holidayShortName = EXECUTION_TO_HOLIDAY_AUTHORITY_SHORT_NAME[shortName];
  const authority = HOLIDAY_AUTHORITIES.find((candidate) => candidate.shortName === holidayShortName);

  return {
    shortName,
    holidayShortName,
    name: authority?.name ?? shortName
  };
});
const HOLIDAY_ORGAN_AUTHORITY_SET = new Set<HolidayAuthorityShortName>(
  HOLIDAY_ORGAN_AUTHORITIES.map((authority) => authority.holidayShortName)
);
const HOLIDAY_ORGAN_AUTHORITY_COUNT = HOLIDAY_ORGAN_AUTHORITIES.length;

function getCurrentPeriod() {
  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1
  };
}

function toDateKey(year: number, month: number, day: number) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

function formatDateDisplay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : "Ocurrio un error inesperado.";
}

function hasPermission(permissions: string[] | undefined, permission: string) {
  return Boolean(permissions?.includes("*") || permissions?.includes(permission));
}

function buildCalendarCells(year: number, month: number) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dayCount = new Date(year, month, 0).getDate();
  const cells: Array<string | null> = Array.from({ length: firstWeekday }, () => null);

  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(toDateKey(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

function replaceHoliday(items: Holiday[], updated: Holiday) {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function summarizeAllAuthoritiesLabel(labels: string[], authorityCount: number) {
  const authoritySummary =
    authorityCount >= HOLIDAY_ORGAN_AUTHORITY_COUNT
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

function getDisplayAuthorityShortName(authorityShortName: HolidayAuthorityShortName) {
  return HOLIDAY_ORGAN_AUTHORITIES.find((authority) => authority.holidayShortName === authorityShortName)?.shortName
    ?? authorityShortName;
}

export function HolidaysPage() {
  const { user } = useAuth();
  const initialPeriod = getCurrentPeriod();
  const [selectedYear, setSelectedYear] = useState(initialPeriod.year);
  const [selectedMonth, setSelectedMonth] = useState(initialPeriod.month);
  const [selectedAuthority, setSelectedAuthority] = useState<SelectedHolidayAuthority>("PJF");
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      const response = await apiGet<HolidaysOverview>(`/holidays?year=${selectedYear}&month=${selectedMonth}`);
      setHolidays(response.holidays);
      setLabelDrafts({});
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
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
    const grouped = new Map<string, Holiday[]>();
    visibleHolidays.forEach((holiday) => {
      const items = grouped.get(holiday.date) ?? [];
      items.push(holiday);
      grouped.set(holiday.date, items);
    });
    return grouped;
  }, [visibleHolidays]);
  const selectedAuthorityHolidays = useMemo(
    () => {
      if (selectedAuthority === ALL_AUTHORITIES_OPTION) {
        return [];
      }

      return visibleHolidays
        .filter((holiday) => holiday.authorityShortName === selectedHolidayAuthorityShortName)
        .sort((left, right) => left.date.localeCompare(right.date));
    },
    [selectedAuthority, selectedHolidayAuthorityShortName, visibleHolidays]
  );
  const selectedAuthorityByDate = useMemo(
    () => new Map(selectedAuthorityHolidays.map((holiday) => [holiday.date, holiday])),
    [selectedAuthorityHolidays]
  );
  const allAuthoritiesHolidayRows = useMemo<AllAuthoritiesHolidayRow[]>(() => {
    const grouped = new Map<string, Holiday[]>();
    visibleHolidays.forEach((holiday) => {
      const items = grouped.get(holiday.date) ?? [];
      items.push(holiday);
      grouped.set(holiday.date, items);
    });

    return Array.from(grouped.entries())
      .map(([date, items]) => {
        const labels = Array.from(new Set(items.map((holiday) => holiday.label || "Dia inhabil"))).sort((left, right) =>
          left.localeCompare(right)
        );
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
  const allAuthoritiesDateCount = useMemo(
    () =>
      allAuthoritiesHolidayRows.filter((row) => row.authorityCount >= HOLIDAY_ORGAN_AUTHORITY_COUNT).length,
    [allAuthoritiesHolidayRows]
  );
  const countsByAuthority = useMemo(() => {
    const counts = new Map<HolidayAuthorityShortName, number>();
    visibleHolidays.forEach((holiday) => {
      counts.set(holiday.authorityShortName, (counts.get(holiday.authorityShortName) ?? 0) + 1);
    });
    return counts;
  }, [visibleHolidays]);
  const selectedAuthorityDetails = HOLIDAY_ORGAN_AUTHORITIES.find((authority) => authority.shortName === selectedAuthority);

  async function toggleHoliday(date: string) {
    if (!canWrite) {
      return;
    }

    if (selectedAuthority === ALL_AUTHORITIES_OPTION) {
      const dateHolidays = holidaysByDate.get(date) ?? [];
      const authoritiesWithHoliday = new Set(dateHolidays.map((holiday) => holiday.authorityShortName));
      const allAuthoritiesHaveHoliday = HOLIDAY_ORGAN_AUTHORITIES.every((authority) =>
        authoritiesWithHoliday.has(authority.holidayShortName)
      );
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

        await Promise.all(
          HOLIDAY_ORGAN_AUTHORITIES.map((authority) =>
            apiPost<Holiday>("/holidays", {
              date,
              authorityShortName: authority.holidayShortName,
              label: "Dia inhabil"
            })
          )
        );
        await loadHolidays();
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        await loadHolidays();
      } finally {
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

      const created = await apiPost<Holiday>("/holidays", {
        date,
        authorityShortName: selectedHolidayAuthorityShortName,
        label: "Dia inhabil"
      });
      setHolidays((items) => [...items, created]);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadHolidays();
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteHoliday(holiday: Holiday) {
    if (!canWrite || holiday.automatic) {
      return;
    }

    setSavingKey(holiday.id);
    setErrorMessage(null);

    try {
      await apiDelete(`/holidays/${holiday.id}`);
      setHolidays((items) => items.filter((item) => item.id !== holiday.id));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadHolidays();
    } finally {
      setSavingKey(null);
    }
  }

  async function deleteAllAuthoritiesHoliday(date: string, manualItems: Holiday[]) {
    if (!canWrite || manualItems.length === 0) {
      return;
    }

    setSavingKey(`${ALL_AUTHORITIES_OPTION}:${date}`);
    setErrorMessage(null);

    try {
      await Promise.all(manualItems.map((holiday) => apiDelete(`/holidays/${holiday.id}`)));
      const deletedIds = new Set(manualItems.map((holiday) => holiday.id));
      setHolidays((items) => items.filter((item) => !deletedIds.has(item.id)));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadHolidays();
    } finally {
      setSavingKey(null);
    }
  }

  function setLabelDraft(holidayId: string, value: string) {
    setLabelDrafts((current) => ({
      ...current,
      [holidayId]: value
    }));
  }

  async function persistHolidayPatch(holiday: Holiday, payload: HolidayPatchPayload) {
    if (holiday.automatic) {
      return;
    }

    setSavingKey(holiday.id);
    setErrorMessage(null);

    try {
      const updated = await apiPatch<Holiday>(`/holidays/${holiday.id}`, payload);
      setHolidays((items) => replaceHoliday(items, updated));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      await loadHolidays();
    } finally {
      setSavingKey(null);
    }
  }

  async function flushLabelDraft(holiday: Holiday) {
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

  function goToRelativeMonth(offset: number) {
    const target = new Date(selectedYear, selectedMonth - 1 + offset, 1);
    setSelectedYear(target.getFullYear());
    setSelectedMonth(target.getMonth() + 1);
  }

  return (
    <section className="page-stack holidays-page">
      <header className="hero module-hero holidays-hero">
        <div className="module-hero-head">
          <span className="module-hero-icon" aria-hidden="true">
            Dias
          </span>
          <div>
            <h2>Dias inhabiles</h2>
          </div>
        </div>
        <p className="muted">
          Calendario por organo para alimentar calculos de terminos, vencimientos y futuras vinculaciones por asunto.
        </p>
      </header>

      {errorMessage ? <div className="message-banner message-error">{errorMessage}</div> : null}

      <section className="panel holidays-panel">
        <div className="panel-header holidays-panel-header">
          <div>
            <h2>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</h2>
            <span>{visibleHolidays.length} fechas marcadas</span>
          </div>
          <div className="holidays-month-actions">
            <button className="secondary-button" type="button" onClick={() => goToRelativeMonth(-1)}>
              Anterior
            </button>
            <label className="form-field holidays-month-field">
              <span>Mes</span>
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))}>
                {MONTH_NAMES.map((monthName, index) => (
                  <option key={monthName} value={index + 1}>
                    {monthName}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field holidays-year-field">
              <span>Anio</span>
              <input
                type="number"
                min="1900"
                max="2100"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
              />
            </label>
            <button className="secondary-button" type="button" onClick={() => goToRelativeMonth(1)}>
              Siguiente
            </button>
            <button className="secondary-button" type="button" onClick={() => void loadHolidays()}>
              Refrescar
            </button>
          </div>
        </div>

        <div className="holidays-authority-strip" role="tablist" aria-label="Autoridades">
          <button
            aria-selected={isAllAuthoritiesSelected}
            className={isAllAuthoritiesSelected ? "is-active is-all-authorities" : "is-all-authorities"}
            onClick={() => setSelectedAuthority(ALL_AUTHORITIES_OPTION)}
            role="tab"
            type="button"
          >
            <strong>{ALL_AUTHORITIES_LABEL}</strong>
            <span>Marcar o consultar todos los organos</span>
            <small>{allAuthoritiesDateCount}</small>
          </button>
          {HOLIDAY_ORGAN_AUTHORITIES.map((authority) => {
            const isActive = authority.shortName === selectedAuthority;
            return (
              <button
                aria-selected={isActive}
                className={isActive ? "is-active" : undefined}
                key={authority.shortName}
                onClick={() => setSelectedAuthority(authority.shortName)}
                role="tab"
                type="button"
              >
                <strong>{authority.shortName}</strong>
                <span>{authority.name}</span>
                <small>{countsByAuthority.get(authority.holidayShortName) ?? 0}</small>
              </button>
            );
          })}
        </div>

        <div className="holidays-layout">
          <section className="holidays-calendar-shell" aria-label="Calendario mensual">
            <div className="holidays-weekdays">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="holidays-calendar-grid">
              {cells.map((date, index) => {
                if (!date) {
                  return <div aria-hidden="true" className="holidays-day is-empty" key={`empty-${index}`} />;
                }

                const dayNumber = Number(date.slice(8, 10));
                const dateHolidays = holidaysByDate.get(date) ?? [];
                const selectedHoliday = selectedAuthorityByDate.get(date);
                const authoritiesWithHoliday = new Set(dateHolidays.map((holiday) => holiday.authorityShortName));
                const allAuthoritiesHaveHoliday = HOLIDAY_ORGAN_AUTHORITIES.every((authority) =>
                  authoritiesWithHoliday.has(authority.holidayShortName)
                );
                const isSelectedInScope = isAllAuthoritiesSelected ? allAuthoritiesHaveHoliday : Boolean(selectedHoliday);
                const isWeekend = index % 7 === 0 || index % 7 === 6;
                const saving = savingKey === `${selectedAuthority}:${date}`;

                return (
                  <button
                    aria-pressed={isSelectedInScope}
                    className={[
                      "holidays-day",
                      isWeekend ? "is-weekend" : "",
                      dateHolidays.length > 0 ? "has-holiday" : "",
                      isSelectedInScope ? "is-selected-authority" : ""
                    ].filter(Boolean).join(" ")}
                    disabled={!canWrite || saving}
                    key={date}
                    onClick={() => void toggleHoliday(date)}
                    title={
                      selectedHoliday?.automatic && !isAllAuthoritiesSelected
                        ? `${formatDateDisplay(date)} - automatico`
                        : `${formatDateDisplay(date)} - ${isAllAuthoritiesSelected ? ALL_AUTHORITIES_LABEL : selectedAuthority}`
                    }
                    type="button"
                  >
                    <span className="holidays-day-number">{dayNumber}</span>
                    <span className="holidays-day-badges">
                      {dateHolidays.map((holiday) => (
                        <span
                          className={
                            isAllAuthoritiesSelected || holiday.authorityShortName === selectedHolidayAuthorityShortName
                              ? "is-selected"
                              : undefined
                          }
                          key={holiday.id}
                        >
                          {getDisplayAuthorityShortName(holiday.authorityShortName)}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="holidays-detail-panel">
            <div className="holidays-selected-authority">
              <strong>{isAllAuthoritiesSelected ? ALL_AUTHORITIES_LABEL : selectedAuthorityDetails?.shortName}</strong>
              <span>
                {isAllAuthoritiesSelected
                  ? "Aplica la seleccion a todos los organos"
                  : selectedAuthorityDetails?.name}
              </span>
              <small>{canWrite ? "Edicion habilitada" : "Solo lectura"}</small>
            </div>

            <div className="holidays-detail-table-shell">
              <table className="data-table holidays-detail-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Motivo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="centered-inline-message">
                        Cargando dias...
                      </td>
                    </tr>
                  ) : isAllAuthoritiesSelected ? (
                    allAuthoritiesHolidayRows.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="centered-inline-message">
                          Sin fechas marcadas.
                        </td>
                      </tr>
                    ) : (
                      allAuthoritiesHolidayRows.map((row) => (
                        <tr key={`all-${row.date}`}>
                          <td className="holidays-date-cell">{formatDateDisplay(row.date)}</td>
                          <td>
                            <div className="holidays-all-authorities-label">
                              <strong>{row.label}</strong>
                              <small>
                                {row.authorityCount} de {HOLIDAY_ORGAN_AUTHORITY_COUNT} organos
                              </small>
                            </div>
                          </td>
                          <td>
                            {row.manualItems.length === 0 ? (
                              <span className="holidays-source-pill is-weekend">
                                Automatico
                              </span>
                            ) : (
                              <button
                                className="danger-button holidays-delete-button"
                                disabled={!canWrite || savingKey === `${ALL_AUTHORITIES_OPTION}:${row.date}`}
                                onClick={() => void deleteAllAuthoritiesHoliday(row.date, row.manualItems)}
                                type="button"
                              >
                                Quitar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )
                  ) : selectedAuthorityHolidays.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="centered-inline-message">
                        Sin fechas marcadas.
                      </td>
                    </tr>
                  ) : (
                    selectedAuthorityHolidays.map((holiday) => (
                      <tr key={holiday.id}>
                        <td className="holidays-date-cell">{formatDateDisplay(holiday.date)}</td>
                        <td>
                          <input
                            className="holidays-label-input"
                            disabled={!canWrite || holiday.automatic || savingKey === holiday.id}
                            onBlur={() => void flushLabelDraft(holiday)}
                            onChange={(event) => setLabelDraft(holiday.id, event.target.value)}
                            value={labelDrafts[holiday.id] ?? holiday.label}
                          />
                        </td>
                        <td>
                          {holiday.automatic ? (
                            <span className={`holidays-source-pill is-${holiday.source.toLowerCase()}`}>
                              Automatico
                            </span>
                          ) : (
                            <button
                              className="danger-button holidays-delete-button"
                              disabled={!canWrite || savingKey === holiday.id}
                              onClick={() => void deleteHoliday(holiday)}
                              type="button"
                            >
                              Quitar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </aside>
        </div>
      </section>
    </section>
  );
}
