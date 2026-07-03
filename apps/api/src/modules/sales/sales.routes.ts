import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const productParamsSchema = z.object({
  productId: z.string().min(1).max(80)
});

const dailyReportParamsSchema = productParamsSchema.extend({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const textPayloadSchema = z.object({
  content: z.string().max(20_000)
});

const productCreateSchema = z.object({
  name: z.string().min(1).max(120),
  tagline: z.string().max(500).optional().default(""),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  logoAlt: z.string().max(180).optional(),
  logoOriginalFileName: z.string().max(255).optional(),
  logoMimeType: z.string().max(120).optional(),
  logoBase64: z.string().max(5_000_000).optional(),
  defaultStrategy: z.string().max(20_000).optional().default(""),
  defaultDailyReport: z.string().max(20_000).optional().default("")
});

function isSuperadmin(user: ReturnType<typeof getSessionUser>) {
  return user.role === "SUPERADMIN" || user.legacyRole === "SUPERADMIN" || user.permissions.includes("*");
}

export const salesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.SalesService(app.repositories.sales);
  const readGuards = [requireAuth, requireAnyPermissions(["sales:read", "sales:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["sales:write"])];

  app.get("/sales/overview", { preHandler: readGuards }, async () => {
    return service.getOverview();
  });

  app.post("/sales/products", { preHandler: writeGuards }, async (request) => {
    const payload = productCreateSchema.parse(request.body ?? {});
    const user = getSessionUser(request);

    return service.createProduct(payload, {
      userId: user.id,
      displayName: user.displayName
    });
  });

  app.patch("/sales/products/:productId/archive", { preHandler: writeGuards }, async (request) => {
    const params = productParamsSchema.parse(request.params);
    return service.archiveProduct(params.productId);
  });

  app.patch("/sales/products/:productId/reactivate", { preHandler: writeGuards }, async (request) => {
    const params = productParamsSchema.parse(request.params);
    return service.reactivateProduct(params.productId);
  });

  app.delete("/sales/products/:productId", { preHandler: writeGuards }, async (request, reply) => {
    const user = getSessionUser(request);
    if (!isSuperadmin(user)) {
      throw new app.errors.AppError(403, "FORBIDDEN", "Solo el superadmin puede eliminar definitivamente productos de Ventas.");
    }

    const params = productParamsSchema.parse(request.params);
    await service.deleteProduct(params.productId);
    return reply.status(204).send();
  });

  app.patch("/sales/strategies/:productId", { preHandler: writeGuards }, async (request) => {
    const params = productParamsSchema.parse(request.params);
    const payload = textPayloadSchema.parse(request.body);
    const user = getSessionUser(request);

    return service.updateStrategy(params.productId, payload.content, {
      userId: user.id,
      displayName: user.displayName
    });
  });

  app.patch("/sales/daily-reports/:productId/:reportDate", { preHandler: writeGuards }, async (request) => {
    const params = dailyReportParamsSchema.parse(request.params);
    const payload = textPayloadSchema.parse(request.body);
    const user = getSessionUser(request);

    return service.updateDailyReport(params.productId, params.reportDate, payload.content, {
      userId: user.id,
      displayName: user.displayName
    });
  });
};
