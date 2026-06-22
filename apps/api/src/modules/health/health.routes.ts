import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    status: "ok",
    environment: app.config.APP_ENV,
    modules: [
      "auth",
      "clients",
      "quotes",
      "leads",
      "matters",
      "tasks",
      "internal-contracts",
      "holidays",
      "kpis",
      "rusconi-intelligence"
    ]
  }));

  app.get("/health/rusconi-intelligence", async () => {
    const openAiConfigured = Boolean(app.config.OPENAI_API_KEY);
    const telegramContextConfigured = Boolean(app.config.INTELLILAW_BOT_API_URL || app.config.TELEGRAM_BOT_TOKEN);

    return {
      status: openAiConfigured && telegramContextConfigured ? "ready" : "needs_configuration",
      environment: app.config.APP_ENV,
      openAiConfigured,
      telegramContextConfigured,
      model: app.config.OPENAI_RUSCONI_INTELLIGENCE_MODEL,
      openAiBaseUrl: app.config.OPENAI_BASE_URL,
      telegramLookupTimeoutMs: app.config.TELEGRAM_GROUP_LOOKUP_TIMEOUT_MS
    };
  });
};
