import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { HOLIDAY_AUTHORITIES, type HolidayAuthorityShortName } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAuth } from "../../core/auth/guards";
import { AppError } from "../../core/errors/app-error";

const HOLIDAY_AUTHORITY_SHORT_NAMES = HOLIDAY_AUTHORITIES.map((authority) => authority.shortName) as [
  HolidayAuthorityShortName,
  ...HolidayAuthorityShortName[]
];

const authorityShortNameSchema = z.enum(HOLIDAY_AUTHORITY_SHORT_NAMES);

const querySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  authorityShortName: authorityShortNameSchema.optional()
});

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  authorityShortName: authorityShortNameSchema,
  label: z.string().trim().max(160).optional()
});

const updateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  authorityShortName: authorityShortNameSchema.optional(),
  label: z.string().trim().max(160).nullable().optional()
});

const paramsSchema = z.object({
  holidayId: z.string().min(1)
});

function normalizeComparableText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function requireHolidayWriteAccess(request: FastifyRequest) {
  const user = getSessionUser(request);

  if (
    user.role === "SUPERADMIN" ||
    user.legacyRole === "SUPERADMIN" ||
    user.team === "ADMIN_OPERATIONS" ||
    normalizeComparableText(user.legacyTeam) === "servicios administrativos"
  ) {
    return;
  }

  throw new AppError(403, "HOLIDAYS_WRITE_FORBIDDEN", "Solo superadmin y Servicios administrativos pueden editar dias inhabiles.");
}

export const holidaysRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.HolidaysService(app.repositories.holidays);
  const readGuards = [requireAuth];
  const writeGuards = [requireAuth, requireHolidayWriteAccess];

  app.get("/holidays/authorities", { preHandler: readGuards }, async () => HOLIDAY_AUTHORITIES);

  app.get("/holidays", { preHandler: readGuards }, async (request) => {
    const query = querySchema.parse(request.query ?? {});
    const now = new Date();
    const year = query.year ?? now.getFullYear();
    const month = query.month ?? now.getMonth() + 1;
    const holidays = await service.list(year, month, query.authorityShortName);

    return {
      year,
      month,
      authorities: HOLIDAY_AUTHORITIES,
      holidays
    };
  });

  app.post("/holidays", { preHandler: writeGuards }, async (request) => {
    const payload = createSchema.parse(request.body ?? {});
    return service.create(payload);
  });

  app.patch("/holidays/:holidayId", { preHandler: writeGuards }, async (request) => {
    const params = paramsSchema.parse(request.params);
    const payload = updateSchema.parse(request.body ?? {});
    return service.update(params.holidayId, payload);
  });

  app.delete("/holidays/:holidayId", { preHandler: writeGuards }, async (request, reply) => {
    const params = paramsSchema.parse(request.params);
    await service.delete(params.holidayId);
    reply.code(204);
    return null;
  });
};
