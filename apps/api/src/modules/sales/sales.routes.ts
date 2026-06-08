import type { FastifyPluginAsync } from "fastify";
import { LEGALFLOW_SALES_PRODUCTS, type SalesProductId } from "@sige/contracts";
import { z } from "zod";

import { getSessionUser, requireAnyPermissions, requireAuth } from "../../core/auth/guards";

const productIds = LEGALFLOW_SALES_PRODUCTS.map((product) => product.id) as [SalesProductId, ...SalesProductId[]];

const productParamsSchema = z.object({
  productId: z.enum(productIds)
});

const dailyReportParamsSchema = productParamsSchema.extend({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

const textPayloadSchema = z.object({
  content: z.string().max(20_000)
});

export const salesRoutes: FastifyPluginAsync = async (app) => {
  const service = new app.services.SalesService(app.repositories.sales);
  const readGuards = [requireAuth, requireAnyPermissions(["sales:read", "sales:write"])];
  const writeGuards = [requireAuth, requireAnyPermissions(["sales:write"])];

  app.get("/sales/overview", { preHandler: readGuards }, async () => {
    return service.getOverview();
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
