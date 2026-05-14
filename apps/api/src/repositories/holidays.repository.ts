import { Prisma, type PrismaClient } from "@prisma/client";
import {
  HOLIDAY_AUTHORITIES,
  isHolidayAuthorityShortName,
  type Holiday,
  type HolidayAuthorityShortName,
  type HolidaySource
} from "@sige/contracts";

import { AppError } from "../core/errors/app-error";
import { mapHoliday } from "./mappers";
import type { HolidayWriteRecord, HolidaysRepository } from "./types";

const DEFAULT_LABEL = "Dia inhabil";
const AUTHORITY_BY_SHORT_NAME = new Map(
  HOLIDAY_AUTHORITIES.map((authority) => [authority.shortName, authority])
);
const FEDERAL_ELECTION_CYCLE_START_YEAR = 2024;
const EXECUTIVE_TRANSFER_CYCLE_START_YEAR = 2024;

function assertMonth(month: number) {
  if (month < 1 || month > 12) {
    throw new AppError(400, "INVALID_MONTH", "Month must be between 1 and 12.");
  }
}

function monthRange(year: number, month: number) {
  assertMonth(month);

  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1))
  };
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return toDateKey(dateFromParts(year, month, day));
}

function firstWeekdayOfMonth(year: number, month: number, weekday: number) {
  const firstDay = dateFromParts(year, month, 1);
  const offset = (weekday - firstDay.getUTCDay() + 7) % 7;
  return 1 + offset;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number) {
  return firstWeekdayOfMonth(year, month, weekday) + ((nth - 1) * 7);
}

function isEveryNthYear(year: number, startYear: number, interval: number) {
  return year >= startYear && (year - startYear) % interval === 0;
}

function getLftOfficialHolidayLabels(year: number) {
  const labels = new Map<string, string>();
  labels.set(dateKeyFromParts(year, 1, 1), "Descanso obligatorio LFT: 1 de enero");
  labels.set(
    dateKeyFromParts(year, 2, firstWeekdayOfMonth(year, 2, 1)),
    "Descanso obligatorio LFT: primer lunes de febrero"
  );
  labels.set(
    dateKeyFromParts(year, 3, nthWeekdayOfMonth(year, 3, 1, 3)),
    "Descanso obligatorio LFT: tercer lunes de marzo"
  );
  labels.set(dateKeyFromParts(year, 5, 1), "Descanso obligatorio LFT: 1 de mayo");
  labels.set(dateKeyFromParts(year, 9, 16), "Descanso obligatorio LFT: 16 de septiembre");

  if (isEveryNthYear(year, EXECUTIVE_TRANSFER_CYCLE_START_YEAR, 6)) {
    labels.set(
      dateKeyFromParts(year, 10, 1),
      "Descanso obligatorio LFT: transmision del Poder Ejecutivo Federal"
    );
  }

  labels.set(
    dateKeyFromParts(year, 11, nthWeekdayOfMonth(year, 11, 1, 3)),
    "Descanso obligatorio LFT: tercer lunes de noviembre"
  );
  labels.set(dateKeyFromParts(year, 12, 25), "Descanso obligatorio LFT: 25 de diciembre");

  if (isEveryNthYear(year, FEDERAL_ELECTION_CYCLE_START_YEAR, 3)) {
    labels.set(
      dateKeyFromParts(year, 6, firstWeekdayOfMonth(year, 6, 0)),
      "Descanso obligatorio LFT: jornada electoral ordinaria"
    );
  }

  return labels;
}

function buildAutomaticHoliday(
  date: string,
  authorityShortName: HolidayAuthorityShortName,
  label: string,
  source: HolidaySource
): Holiday {
  const authority = resolveAuthority(authorityShortName);
  const timestamp = `${date}T00:00:00.000Z`;

  return {
    id: `automatic:${source}:${authority.shortName}:${date}`,
    date,
    authorityShortName: authority.shortName,
    authorityName: authority.name,
    label,
    source,
    automatic: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function getAutomaticHolidayDates(year: number, month: number) {
  const dates = new Map<string, { label: string; source: HolidaySource }>();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = dateFromParts(year, month, day);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      dates.set(toDateKey(date), { label: "Fin de semana", source: "WEEKEND" });
    }
  }

  getLftOfficialHolidayLabels(year).forEach((label, date) => {
    if (date.slice(5, 7) === String(month).padStart(2, "0")) {
      dates.set(date, { label, source: "LFT_OFFICIAL" });
    }
  });

  return dates;
}

function calendarKey(holiday: Pick<Holiday, "authorityShortName" | "date">) {
  return `${holiday.authorityShortName}:${holiday.date}`;
}

function mergeHolidays(manualHolidays: Holiday[], automaticHolidays: Holiday[]) {
  const manualKeys = new Set(manualHolidays.map(calendarKey));
  return [
    ...manualHolidays,
    ...automaticHolidays.filter((holiday) => !manualKeys.has(calendarKey(holiday)))
  ].sort((left, right) => left.date.localeCompare(right.date) || left.authorityShortName.localeCompare(right.authorityShortName));
}

function parseDateOnly(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, "INVALID_HOLIDAY_DATE", "Holiday date must use YYYY-MM-DD format.");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, "INVALID_HOLIDAY_DATE", "Holiday date is not valid.");
  }

  return parsed;
}

function normalizeLabel(value?: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_LABEL;
}

function resolveAuthority(shortName?: string | null) {
  if (!shortName || !isHolidayAuthorityShortName(shortName)) {
    throw new AppError(400, "INVALID_HOLIDAY_AUTHORITY", "Holiday authority is not supported.");
  }

  const authority = AUTHORITY_BY_SHORT_NAME.get(shortName);
  if (!authority) {
    throw new AppError(400, "INVALID_HOLIDAY_AUTHORITY", "Holiday authority is not supported.");
  }

  return authority;
}

function mapUniqueConstraintError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new AppError(409, "HOLIDAY_ALREADY_EXISTS", "This authority already has that holiday date.");
  }

  throw error;
}

export class PrismaHolidaysRepository implements HolidaysRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(year: number, month: number, authorityShortName?: HolidayAuthorityShortName) {
    const { start, end } = monthRange(year, month);

    const records = await this.prisma.holiday.findMany({
      where: {
        date: {
          gte: start,
          lt: end
        },
        authorityShortName
      },
      orderBy: [{ date: "asc" }, { authorityShortName: "asc" }]
    });

    const manualHolidays = records.map(mapHoliday);
    const authorityShortNames = authorityShortName
      ? [authorityShortName]
      : HOLIDAY_AUTHORITIES.map((authority) => authority.shortName);
    const automaticDates = getAutomaticHolidayDates(year, month);
    const automaticHolidays = authorityShortNames.flatMap((shortName) =>
      Array.from(automaticDates.entries()).map(([date, automatic]) =>
        buildAutomaticHoliday(date, shortName, automatic.label, automatic.source)
      )
    );

    return mergeHolidays(manualHolidays, automaticHolidays);
  }

  public async create(payload: HolidayWriteRecord) {
    const date = parseDateOnly(payload.date);
    const authority = resolveAuthority(payload.authorityShortName);
    const label = normalizeLabel(payload.label);

    const record = await this.prisma.holiday.upsert({
      where: {
        authorityShortName_date: {
          authorityShortName: authority.shortName,
          date
        }
      },
      update: {
        authorityName: authority.name,
        label
      },
      create: {
        date,
        authorityShortName: authority.shortName,
        authorityName: authority.name,
        label
      }
    });

    return mapHoliday(record);
  }

  public async update(holidayId: string, payload: HolidayWriteRecord) {
    const current = await this.findOrThrow(holidayId);
    const date = payload.date ? parseDateOnly(payload.date) : current.date;
    const authority = resolveAuthority(payload.authorityShortName ?? current.authorityShortName);
    const label = Object.prototype.hasOwnProperty.call(payload, "label")
      ? normalizeLabel(payload.label)
      : current.label;

    try {
      const record = await this.prisma.holiday.update({
        where: { id: holidayId },
        data: {
          date,
          authorityShortName: authority.shortName,
          authorityName: authority.name,
          label
        }
      });

      return mapHoliday(record);
    } catch (error) {
      return mapUniqueConstraintError(error);
    }
  }

  public async delete(holidayId: string) {
    await this.findOrThrow(holidayId);

    await this.prisma.holiday.delete({
      where: { id: holidayId }
    });
  }

  private async findOrThrow(holidayId: string) {
    const record = await this.prisma.holiday.findUnique({
      where: { id: holidayId }
    });

    if (!record) {
      throw new AppError(404, "HOLIDAY_NOT_FOUND", "The requested holiday does not exist.");
    }

    return record;
  }
}
