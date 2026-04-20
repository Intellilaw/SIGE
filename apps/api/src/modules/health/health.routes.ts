import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    environment: app.config.APP_ENV,
    modules: ["auth", "clients", "quotes", "leads", "matters", "tasks"]
  }));
};
