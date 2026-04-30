import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env";
import { AppError } from "./core/errors/app-error";
import { registerErrorHandler } from "./core/http/error-handler";
import { prisma } from "./lib/prisma";
import { AuthService } from "./modules/auth/auth.service";
import { ClientsService } from "./modules/clients/clients.service";
import { CommissionsService } from "./modules/commissions/commissions.service";
import { DashboardService } from "./modules/dashboard/dashboard.service";
import { FinancesService } from "./modules/finances/finances.service";
import { GeneralExpensesService } from "./modules/general-expenses/general-expenses.service";
import { LeadsService } from "./modules/leads/leads.service";
import { MattersService } from "./modules/matters/matters.service";
import { QuotesService } from "./modules/quotes/quotes.service";
import { TasksService } from "./modules/tasks/tasks.service";
import { UsersService } from "./modules/users/users.service";
import { healthRoutes } from "./modules/health/health.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { commissionsRoutes } from "./modules/commissions/commissions.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { financesRoutes } from "./modules/finances/finances.routes";
import { generalExpensesRoutes } from "./modules/general-expenses/general-expenses.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { clientsRoutes } from "./modules/clients/clients.routes";
import { quotesRoutes } from "./modules/quotes/quotes.routes";
import { leadsRoutes } from "./modules/leads/leads.routes";
import { mattersRoutes } from "./modules/matters/matters.routes";
import { tasksRoutes } from "./modules/tasks/tasks.routes";
import { PrismaAuthRepository } from "./repositories/auth.repository";
import { PrismaClientsRepository } from "./repositories/clients.repository";
import { PrismaCommissionsRepository } from "./repositories/commissions.repository";
import { PrismaDashboardRepository } from "./repositories/dashboard.repository";
import { PrismaFinanceRepository } from "./repositories/finances.repository";
import { PrismaGeneralExpensesRepository } from "./repositories/general-expenses.repository";
import { PrismaLeadsRepository } from "./repositories/leads.repository";
import { LocalAuthRepository } from "./repositories/local-auth.repository";
import {
  LocalBusinessStore,
  LocalClientsRepository,
  LocalMattersRepository,
  LocalTasksRepository
} from "./repositories/local-business.repository";
import { PrismaMattersRepository } from "./repositories/matters.repository";
import { PrismaQuotesRepository } from "./repositories/quotes.repository";
import { ResilientAuthRepository } from "./repositories/resilient-auth.repository";
import {
  ResilientClientsRepository,
  ResilientMattersRepository,
  ResilientTasksRepository
} from "./repositories/resilient-business.repository";
import { PrismaTasksRepository } from "./repositories/tasks.repository";
import { PrismaUsersRepository } from "./repositories/users.repository";
import type { AuthRepository, ClientsRepository, MattersRepository, TasksRepository } from "./repositories/types";
import { ACCESS_TOKEN_COOKIE_NAME } from "./core/auth/session-cookies";

declare module "fastify" {
  interface FastifyInstance {
    config: typeof env;
    errors: {
      AppError: typeof AppError;
    };
    repositories: {
      auth: AuthRepository;
      clients: ClientsRepository;
      commissions: PrismaCommissionsRepository;
      dashboard: PrismaDashboardRepository;
      finances: PrismaFinanceRepository;
      generalExpenses: PrismaGeneralExpensesRepository;
      leads: PrismaLeadsRepository;
      matters: MattersRepository;
      quotes: PrismaQuotesRepository;
      tasks: TasksRepository;
      users: PrismaUsersRepository;
    };
    services: {
      AuthService: typeof AuthService;
      ClientsService: typeof ClientsService;
      CommissionsService: typeof CommissionsService;
      DashboardService: typeof DashboardService;
      FinancesService: typeof FinancesService;
      GeneralExpensesService: typeof GeneralExpensesService;
      LeadsService: typeof LeadsService;
      MattersService: typeof MattersService;
      QuotesService: typeof QuotesService;
      TasksService: typeof TasksService;
      UsersService: typeof UsersService;
    };
  }
}

export async function buildApp() {
  const configuredWebOrigins = env.WEB_ORIGINS
    ? env.WEB_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [env.WEB_ORIGIN];
  const allowedOrigins = new Set(configuredWebOrigins);

  if (env.APP_ENV === "development") {
    for (const origin of configuredWebOrigins) {
      try {
        const parsedOrigin = new URL(origin);
        if (parsedOrigin.hostname === "localhost") {
          allowedOrigins.add(`${parsedOrigin.protocol}//127.0.0.1${parsedOrigin.port ? `:${parsedOrigin.port}` : ""}`);
        }
        if (parsedOrigin.hostname === "127.0.0.1") {
          allowedOrigins.add(`${parsedOrigin.protocol}//localhost${parsedOrigin.port ? `:${parsedOrigin.port}` : ""}`);
        }
      } catch {
        // Ignore invalid origins here; env validation already guards normal startup paths.
      }
    }
  }

  const app = Fastify({
    logger: {
      transport: env.APP_ENV === "development"
        ? {
            target: "pino-pretty"
          }
        : undefined
    }
  });

  app.decorate("config", env);
  app.decorate("errors", { AppError });
  const authRepository = new ResilientAuthRepository(
    new PrismaAuthRepository(prisma),
    env.APP_ENV === "development" && LocalAuthRepository.isAvailable()
      ? new LocalAuthRepository()
      : null,
    app.log
  );
  const localBusinessStore = env.APP_ENV === "development" && LocalBusinessStore.isAvailable()
    ? new LocalBusinessStore()
    : null;
  app.decorate("repositories", {
    auth: authRepository,
    clients: new ResilientClientsRepository(
      new PrismaClientsRepository(prisma),
      localBusinessStore ? new LocalClientsRepository(localBusinessStore) : null,
      app.log
    ),
    commissions: new PrismaCommissionsRepository(prisma),
    dashboard: new PrismaDashboardRepository(prisma),
    finances: new PrismaFinanceRepository(prisma),
    generalExpenses: new PrismaGeneralExpensesRepository(prisma),
    leads: new PrismaLeadsRepository(prisma),
    matters: new ResilientMattersRepository(
      new PrismaMattersRepository(prisma),
      localBusinessStore ? new LocalMattersRepository(localBusinessStore) : null,
      app.log
    ),
    quotes: new PrismaQuotesRepository(prisma),
    tasks: new ResilientTasksRepository(
      new PrismaTasksRepository(prisma),
      localBusinessStore ? new LocalTasksRepository(localBusinessStore) : null,
      app.log
    ),
    users: new PrismaUsersRepository(prisma)
  });
  app.decorate("services", {
    AuthService,
    ClientsService,
    CommissionsService,
    DashboardService,
    FinancesService,
    GeneralExpensesService,
    LeadsService,
    MattersService,
    QuotesService,
    TasksService,
    UsersService
  });

  await app.register(helmet, { global: true });
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed."), false);
    },
    credentials: true
  });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute"
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    cookie: {
      cookieName: ACCESS_TOKEN_COOKIE_NAME,
      signed: false
    }
  });

  registerErrorHandler(app);

  await app.register(async (api) => {
    await api.register(healthRoutes);
    await api.register(authRoutes);
    await api.register(commissionsRoutes);
    await api.register(dashboardRoutes);
    await api.register(financesRoutes);
    await api.register(generalExpensesRoutes);
    await api.register(usersRoutes);
    await api.register(clientsRoutes);
    await api.register(quotesRoutes);
    await api.register(leadsRoutes);
    await api.register(mattersRoutes);
    await api.register(tasksRoutes);
  }, { prefix: "/api/v1" });

  return app;
}
