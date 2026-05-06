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
import { BudgetPlanningService } from "./modules/budget-planning/budget-planning.service";
import { ClientsService } from "./modules/clients/clients.service";
import { CommissionsService } from "./modules/commissions/commissions.service";
import { DailyDocumentsService } from "./modules/daily-documents/daily-documents.service";
import { DashboardService } from "./modules/dashboard/dashboard.service";
import { FinancesService } from "./modules/finances/finances.service";
import { GeneralExpensesService } from "./modules/general-expenses/general-expenses.service";
import { InternalContractsService } from "./modules/internal-contracts/internal-contracts.service";
import { LeadsService } from "./modules/leads/leads.service";
import { MattersService } from "./modules/matters/matters.service";
import { QuotesService } from "./modules/quotes/quotes.service";
import { TasksService } from "./modules/tasks/tasks.service";
import { UsersService } from "./modules/users/users.service";
import { healthRoutes } from "./modules/health/health.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { budgetPlanningRoutes } from "./modules/budget-planning/budget-planning.routes";
import { commissionsRoutes } from "./modules/commissions/commissions.routes";
import { dailyDocumentsRoutes } from "./modules/daily-documents/daily-documents.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { financesRoutes } from "./modules/finances/finances.routes";
import { generalExpensesRoutes } from "./modules/general-expenses/general-expenses.routes";
import { internalContractsRoutes } from "./modules/internal-contracts/internal-contracts.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { clientsRoutes } from "./modules/clients/clients.routes";
import { quotesRoutes } from "./modules/quotes/quotes.routes";
import { leadsRoutes } from "./modules/leads/leads.routes";
import { mattersRoutes } from "./modules/matters/matters.routes";
import { tasksRoutes } from "./modules/tasks/tasks.routes";
import { PrismaAuthRepository } from "./repositories/auth.repository";
import { PrismaBudgetPlanningRepository } from "./repositories/budget-planning.repository";
import { PrismaClientsRepository } from "./repositories/clients.repository";
import { PrismaCommissionsRepository } from "./repositories/commissions.repository";
import { PrismaDailyDocumentsRepository } from "./repositories/daily-documents.repository";
import { PrismaDashboardRepository } from "./repositories/dashboard.repository";
import { PrismaFinanceRepository } from "./repositories/finances.repository";
import { PrismaGeneralExpensesRepository } from "./repositories/general-expenses.repository";
import { PrismaInternalContractsRepository } from "./repositories/internal-contracts.repository";
import { PrismaLeadsRepository } from "./repositories/leads.repository";
import { LocalAuthRepository } from "./repositories/local-auth.repository";
import {
  LocalBusinessStore,
  LocalClientsRepository,
  LocalMattersRepository,
  LocalQuotesRepository,
  LocalTasksRepository
} from "./repositories/local-business.repository";
import { PrismaMattersRepository } from "./repositories/matters.repository";
import { PrismaQuotesRepository } from "./repositories/quotes.repository";
import { ResilientAuthRepository } from "./repositories/resilient-auth.repository";
import {
  ResilientClientsRepository,
  ResilientMattersRepository,
  ResilientQuotesRepository,
  ResilientTasksRepository
} from "./repositories/resilient-business.repository";
import { PrismaTasksRepository } from "./repositories/tasks.repository";
import { PrismaUsersRepository } from "./repositories/users.repository";
import type {
  AuthRepository,
  ClientsRepository,
  DailyDocumentsRepository,
  InternalContractsRepository,
  MattersRepository,
  QuotesRepository,
  TasksRepository
} from "./repositories/types";
import { ACCESS_TOKEN_COOKIE_NAME } from "./core/auth/session-cookies";

declare module "fastify" {
  interface FastifyInstance {
    config: typeof env;
    errors: {
      AppError: typeof AppError;
    };
    repositories: {
      auth: AuthRepository;
      budgetPlanning: PrismaBudgetPlanningRepository;
      clients: ClientsRepository;
      commissions: PrismaCommissionsRepository;
      dailyDocuments: DailyDocumentsRepository;
      dashboard: PrismaDashboardRepository;
      finances: PrismaFinanceRepository;
      generalExpenses: PrismaGeneralExpensesRepository;
      internalContracts: InternalContractsRepository;
      leads: PrismaLeadsRepository;
      matters: MattersRepository;
      quotes: QuotesRepository;
      tasks: TasksRepository;
      users: PrismaUsersRepository;
    };
    services: {
      AuthService: typeof AuthService;
      BudgetPlanningService: typeof BudgetPlanningService;
      ClientsService: typeof ClientsService;
      CommissionsService: typeof CommissionsService;
      DailyDocumentsService: typeof DailyDocumentsService;
      DashboardService: typeof DashboardService;
      FinancesService: typeof FinancesService;
      GeneralExpensesService: typeof GeneralExpensesService;
      InternalContractsService: typeof InternalContractsService;
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
    budgetPlanning: new PrismaBudgetPlanningRepository(prisma),
    clients: new ResilientClientsRepository(
      new PrismaClientsRepository(prisma),
      localBusinessStore ? new LocalClientsRepository(localBusinessStore) : null,
      app.log
    ),
    commissions: new PrismaCommissionsRepository(prisma),
    dailyDocuments: new PrismaDailyDocumentsRepository(prisma),
    dashboard: new PrismaDashboardRepository(prisma),
    finances: new PrismaFinanceRepository(prisma),
    generalExpenses: new PrismaGeneralExpensesRepository(prisma),
    internalContracts: new PrismaInternalContractsRepository(prisma),
    leads: new PrismaLeadsRepository(prisma),
    matters: new ResilientMattersRepository(
      new PrismaMattersRepository(prisma),
      localBusinessStore ? new LocalMattersRepository(localBusinessStore) : null,
      app.log
    ),
    quotes: new ResilientQuotesRepository(
      new PrismaQuotesRepository(prisma),
      localBusinessStore ? new LocalQuotesRepository(localBusinessStore) : null,
      app.log
    ),
    tasks: new ResilientTasksRepository(
      new PrismaTasksRepository(prisma),
      localBusinessStore ? new LocalTasksRepository(localBusinessStore) : null,
      app.log
    ),
    users: new PrismaUsersRepository(prisma)
  });
  app.decorate("services", {
    AuthService,
    BudgetPlanningService,
    ClientsService,
    CommissionsService,
    DailyDocumentsService,
    DashboardService,
    FinancesService,
    GeneralExpensesService,
    InternalContractsService,
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
    await api.register(budgetPlanningRoutes);
    await api.register(commissionsRoutes);
    await api.register(dailyDocumentsRoutes);
    await api.register(dashboardRoutes);
    await api.register(financesRoutes);
    await api.register(generalExpensesRoutes);
    await api.register(internalContractsRoutes);
    await api.register(usersRoutes);
    await api.register(clientsRoutes);
    await api.register(quotesRoutes);
    await api.register(leadsRoutes);
    await api.register(mattersRoutes);
    await api.register(tasksRoutes);
  }, { prefix: "/api/v1" });

  return app;
}
