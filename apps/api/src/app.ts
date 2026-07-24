import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env";
import { AppError } from "./core/errors/app-error";
import { registerErrorHandler } from "./core/http/error-handler";
import { assertTenantScopedDatabaseSchema, prisma } from "./lib/prisma";
import { AccountingService } from "./modules/accounting/accounting.service";
import { AuthService } from "./modules/auth/auth.service";
import { BudgetPlanningService } from "./modules/budget-planning/budget-planning.service";
import { BulletinsService } from "./modules/bulletins/bulletins.service";
import { ClientsService } from "./modules/clients/clients.service";
import { CommissionsService } from "./modules/commissions/commissions.service";
import { DailyDocumentsService } from "./modules/daily-documents/daily-documents.service";
import { DashboardService } from "./modules/dashboard/dashboard.service";
import { FinancesService } from "./modules/finances/finances.service";
import { GeneralExpensesService } from "./modules/general-expenses/general-expenses.service";
import { GeneralSupervisionService } from "./modules/general-supervision/general-supervision.service";
import { HolidaysService } from "./modules/holidays/holidays.service";
import { InternalContractsService } from "./modules/internal-contracts/internal-contracts.service";
import { startKpiDailySnapshotScheduler } from "./modules/kpis/kpi-daily-snapshot-scheduler.js";
import { KpisService } from "./modules/kpis/kpis.service";
import { LaborFilesService } from "./modules/labor-files/labor-files.service";
import { LeadsService } from "./modules/leads/leads.service";
import { MattersService } from "./modules/matters/matters.service";
import { ModuleSettingsService } from "./modules/module-settings/module-settings.service";
import { QuotesService } from "./modules/quotes/quotes.service";
import { SalesService } from "./modules/sales/sales.service";
import { startTasksMaintenanceScheduler } from "./modules/tasks/tasks-maintenance.js";
import { TasksService } from "./modules/tasks/tasks.service";
import { UsersService } from "./modules/users/users.service";
import { accountingRoutes } from "./modules/accounting/accounting.routes";
import { healthRoutes } from "./modules/health/health.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { budgetPlanningRoutes } from "./modules/budget-planning/budget-planning.routes";
import { bulletinsRoutes } from "./modules/bulletins/bulletins.routes";
import { commissionsRoutes } from "./modules/commissions/commissions.routes";
import { dailyDocumentsRoutes } from "./modules/daily-documents/daily-documents.routes";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes";
import { financesRoutes } from "./modules/finances/finances.routes";
import { generalExpensesRoutes } from "./modules/general-expenses/general-expenses.routes";
import { generalSupervisionRoutes } from "./modules/general-supervision/general-supervision.routes";
import { holidaysRoutes } from "./modules/holidays/holidays.routes";
import { internalContractsRoutes } from "./modules/internal-contracts/internal-contracts.routes";
import { kpisRoutes } from "./modules/kpis/kpis.routes";
import { laborFilesRoutes } from "./modules/labor-files/labor-files.routes";
import { usersRoutes } from "./modules/users/users.routes";
import { clientsRoutes } from "./modules/clients/clients.routes";
import { quotesRoutes } from "./modules/quotes/quotes.routes";
import { leadsRoutes } from "./modules/leads/leads.routes";
import { mattersRoutes } from "./modules/matters/matters.routes";
import { moduleSettingsRoutes } from "./modules/module-settings/module-settings.routes";
import { periodicMessagesRoutes } from "./modules/periodic-messages/periodic-messages.routes";
import { googleWorkspaceRoutes } from "./modules/periodic-messages/google-workspace.routes";
import { startPeriodicMessagesScheduler } from "./modules/periodic-messages/periodic-messages.scheduler";
import { salesRoutes } from "./modules/sales/sales.routes";
import { tasksRoutes } from "./modules/tasks/tasks.routes";
import { PrismaAccountingRepository } from "./repositories/accounting.repository";
import { PrismaAuthRepository } from "./repositories/auth.repository";
import { PrismaBudgetPlanningRepository } from "./repositories/budget-planning.repository";
import { PrismaBulletinsRepository } from "./repositories/bulletins.repository";
import { PrismaClientsRepository } from "./repositories/clients.repository";
import { PrismaCommissionsRepository } from "./repositories/commissions.repository";
import { PrismaDailyDocumentsRepository } from "./repositories/daily-documents.repository";
import { PrismaDashboardRepository } from "./repositories/dashboard.repository";
import { PrismaFinanceRepository } from "./repositories/finances.repository";
import { PrismaGeneralSupervisionPreferencesRepository } from "./repositories/general-supervision-preferences.repository";
import { PrismaGeneralExpensesRepository } from "./repositories/general-expenses.repository";
import { PrismaHolidaysRepository } from "./repositories/holidays.repository";
import { PrismaInternalContractsRepository } from "./repositories/internal-contracts.repository";
import { PrismaKpisRepository } from "./repositories/kpis.repository";
import { KpiCommissionRequirementsService } from "./repositories/kpi-commission-requirements";
import { PrismaLaborFilesRepository, ResilientLaborFilesRepository } from "./repositories/labor-files.repository";
import { PrismaLeadsRepository } from "./repositories/leads.repository";
import { PrismaMattersRepository } from "./repositories/matters.repository";
import { PrismaModuleSettingsRepository } from "./repositories/module-settings.repository";
import { PrismaQuotesRepository } from "./repositories/quotes.repository";
import { ResilientAuthRepository } from "./repositories/resilient-auth.repository";
import {
  ResilientClientsRepository,
  ResilientFinanceRepository,
  ResilientMattersRepository,
  ResilientQuotesRepository,
  ResilientTasksRepository
} from "./repositories/resilient-business.repository";
import { PrismaSalesRepository } from "./repositories/sales.repository";
import { PrismaTasksRepository } from "./repositories/tasks.repository";
import { PrismaUsersRepository } from "./repositories/users.repository";
import type {
  AuthRepository,
  AccountingRepository,
  BulletinsRepository,
  ClientsRepository,
  DailyDocumentsRepository,
  FinanceRepository,
  HolidaysRepository,
  InternalContractsRepository,
  LaborFilesRepository,
  MattersRepository,
  QuotesRepository,
  SalesRepository,
  TasksRepository
} from "./repositories/types";
import { ACCESS_TOKEN_COOKIE_NAME } from "./core/auth/session-cookies";
import { runWithEmptyTenantContext } from "./core/tenant/tenant-context";

declare module "fastify" {
  interface FastifyInstance {
    config: typeof env;
    errors: {
      AppError: typeof AppError;
    };
    repositories: {
      auth: AuthRepository;
      accounting: AccountingRepository;
      budgetPlanning: PrismaBudgetPlanningRepository;
      bulletins: BulletinsRepository;
      clients: ClientsRepository;
      commissions: PrismaCommissionsRepository;
      kpiCommissionRequirements: KpiCommissionRequirementsService;
      dailyDocuments: DailyDocumentsRepository;
      dashboard: PrismaDashboardRepository;
      finances: FinanceRepository;
      generalSupervisionPreferences: PrismaGeneralSupervisionPreferencesRepository;
      generalExpenses: PrismaGeneralExpensesRepository;
      holidays: HolidaysRepository;
      internalContracts: InternalContractsRepository;
      kpis: PrismaKpisRepository;
      laborFiles: LaborFilesRepository;
      leads: PrismaLeadsRepository;
      matters: MattersRepository;
      moduleSettings: PrismaModuleSettingsRepository;
      quotes: QuotesRepository;
      sales: SalesRepository;
      tasks: TasksRepository;
      users: PrismaUsersRepository;
    };
    services: {
      AuthService: typeof AuthService;
      AccountingService: typeof AccountingService;
      BudgetPlanningService: typeof BudgetPlanningService;
      BulletinsService: typeof BulletinsService;
      ClientsService: typeof ClientsService;
      CommissionsService: typeof CommissionsService;
      DailyDocumentsService: typeof DailyDocumentsService;
      DashboardService: typeof DashboardService;
      FinancesService: typeof FinancesService;
      GeneralExpensesService: typeof GeneralExpensesService;
      GeneralSupervisionService: typeof GeneralSupervisionService;
      HolidaysService: typeof HolidaysService;
      InternalContractsService: typeof InternalContractsService;
      KpisService: typeof KpisService;
      LaborFilesService: typeof LaborFilesService;
      LeadsService: typeof LeadsService;
      MattersService: typeof MattersService;
      ModuleSettingsService: typeof ModuleSettingsService;
      QuotesService: typeof QuotesService;
      SalesService: typeof SalesService;
      TasksService: typeof TasksService;
      UsersService: typeof UsersService;
    };
  }
}

export async function buildApp() {
  const usePrettyLogger = env.APP_ENV === "local" && process.env.SIGE_DISABLE_PRETTY_LOGS !== "true";
  const configuredWebOrigins = env.WEB_ORIGINS
    ? env.WEB_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
    : [env.WEB_ORIGIN];
  const allowedOrigins = new Set(configuredWebOrigins);

  if (env.APP_ENV !== "test") {
    await assertTenantScopedDatabaseSchema(prisma);
  }

  if (env.APP_ENV === "local") {
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
      transport: usePrettyLogger
        ? {
            target: "pino-pretty"
          }
        : undefined
    }
  });

  app.decorate("config", env);
  app.decorate("errors", { AppError });
  app.addHook("onRequest", (_request, _reply, done) => {
    runWithEmptyTenantContext(done);
  });

  // Runtime persistence always goes through Prisma/PostgreSQL; APP_ENV decides which database host is allowed.
  const authRepository = new ResilientAuthRepository(
    new PrismaAuthRepository(prisma),
    null,
    app.log
  );
  const kpisRepository = new PrismaKpisRepository(prisma);
  const kpiCommissionRequirements = new KpiCommissionRequirementsService(prisma, kpisRepository);
  app.decorate("repositories", {
    auth: authRepository,
    accounting: new PrismaAccountingRepository(prisma),
    budgetPlanning: new PrismaBudgetPlanningRepository(prisma),
    bulletins: new PrismaBulletinsRepository(prisma),
    clients: new ResilientClientsRepository(
      new PrismaClientsRepository(prisma),
      null,
      app.log
    ),
    commissions: new PrismaCommissionsRepository(prisma, kpiCommissionRequirements),
    dailyDocuments: new PrismaDailyDocumentsRepository(prisma),
    dashboard: new PrismaDashboardRepository(prisma),
    finances: new ResilientFinanceRepository(
      new PrismaFinanceRepository(prisma),
      false,
      app.log
    ),
    generalSupervisionPreferences: new PrismaGeneralSupervisionPreferencesRepository(prisma),
    generalExpenses: new PrismaGeneralExpensesRepository(prisma),
    holidays: new PrismaHolidaysRepository(prisma),
    internalContracts: new PrismaInternalContractsRepository(prisma),
    kpis: kpisRepository,
    kpiCommissionRequirements,
    laborFiles: new ResilientLaborFilesRepository(
      new PrismaLaborFilesRepository(prisma),
      null,
      app.log
    ),
    leads: new PrismaLeadsRepository(prisma),
    matters: new ResilientMattersRepository(
      new PrismaMattersRepository(prisma),
      null,
      app.log
    ),
    moduleSettings: new PrismaModuleSettingsRepository(prisma),
    quotes: new ResilientQuotesRepository(
      new PrismaQuotesRepository(prisma),
      null,
      app.log
    ),
    sales: new PrismaSalesRepository(prisma),
    tasks: new ResilientTasksRepository(
      new PrismaTasksRepository(prisma),
      null,
      app.log
    ),
    users: new PrismaUsersRepository(prisma)
  });
  app.decorate("services", {
    AuthService,
    AccountingService,
    BudgetPlanningService,
    BulletinsService,
    ClientsService,
    CommissionsService,
    DailyDocumentsService,
    DashboardService,
    FinancesService,
    GeneralExpensesService,
    GeneralSupervisionService,
    HolidaysService,
    InternalContractsService,
    KpisService,
    LaborFilesService,
    LeadsService,
    MattersService,
    ModuleSettingsService,
    QuotesService,
    SalesService,
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
    await api.register(accountingRoutes);
    await api.register(healthRoutes);
    await api.register(authRoutes);
    await api.register(budgetPlanningRoutes);
    await api.register(bulletinsRoutes);
    await api.register(commissionsRoutes);
    await api.register(dailyDocumentsRoutes);
    await api.register(dashboardRoutes);
    await api.register(financesRoutes);
    await api.register(generalExpensesRoutes);
    await api.register(generalSupervisionRoutes);
    await api.register(holidaysRoutes);
    await api.register(internalContractsRoutes);
    await api.register(kpisRoutes);
    await api.register(laborFilesRoutes);
    await api.register(usersRoutes);
    await api.register(clientsRoutes);
    await api.register(quotesRoutes);
    await api.register(leadsRoutes);
    await api.register(mattersRoutes);
    await api.register(moduleSettingsRoutes);
    await api.register(periodicMessagesRoutes);
    await api.register(googleWorkspaceRoutes);
    await api.register(salesRoutes);
    await api.register(tasksRoutes);
  }, { prefix: "/api/v1" });

  if (env.APP_ENV !== "test") {
    const stopTasksMaintenance = startTasksMaintenanceScheduler(prisma, app.log);
    const stopKpiDailySnapshots = startKpiDailySnapshotScheduler(kpisRepository, app.log);
    const stopPeriodicMessages = startPeriodicMessagesScheduler(prisma, app.log);
    app.addHook("onClose", async () => {
      stopTasksMaintenance();
      stopKpiDailySnapshots();
      stopPeriodicMessages();
    });
  }

  return app;
}
