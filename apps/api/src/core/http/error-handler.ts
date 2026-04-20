import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { AppError } from "../errors/app-error";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        code: error.code,
        message: error.message
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.issues
      });
    }

    const statusCode = typeof (error as { statusCode?: unknown }).statusCode === "number"
      ? (error as { statusCode: number }).statusCode
      : null;
    const message = error instanceof Error && error.message
      ? error.message
      : "Unexpected server error.";

    if (statusCode && statusCode >= 400 && statusCode < 600) {
      return reply.status(statusCode).send({
        code: "HTTP_ERROR",
        message
      });
    }

    return reply.status(500).send({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error."
    });
  });
}
