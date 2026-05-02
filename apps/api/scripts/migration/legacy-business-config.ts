import { LEGACY_TASK_MODULES } from "../../../web/src/features/tasks/task-legacy-config.js";

type ModuleId =
  | "litigation"
  | "corporate-labor"
  | "settlements"
  | "financial-law"
  | "tax-compliance";

export interface LegacyExecutionModuleConfig {
  moduleId: ModuleId;
  historyTable: string;
  termsTable: string;
  eventsTable: string;
  additionalTasksTable: string;
  monthlyViewTable?: string;
  matterTable: string;
}

const EXECUTION_MODULE_CONFIGS: LegacyExecutionModuleConfig[] = [
  {
    moduleId: "litigation",
    historyTable: "distribuidor_history",
    termsTable: "terminos",
    eventsTable: "sucesos",
    additionalTasksTable: "tareas_adicionales_litigio",
    matterTable: "litigio_matters"
  },
  {
    moduleId: "corporate-labor",
    historyTable: "distribuidor_history_corporativo",
    termsTable: "terminos_corporativo",
    eventsTable: "sucesos_corporativo",
    additionalTasksTable: "tareas_adicionales_corporativo",
    matterTable: "corporativo_matters"
  },
  {
    moduleId: "settlements",
    historyTable: "distribuidor_history_convenios",
    termsTable: "terminos_convenios",
    eventsTable: "sucesos_convenios",
    additionalTasksTable: "tareas_adicionales_convenios",
    matterTable: "convenios_matters"
  },
  {
    moduleId: "financial-law",
    historyTable: "distribuidor_history_financiero",
    termsTable: "terminos_financiero",
    eventsTable: "sucesos_financiero",
    additionalTasksTable: "tareas_adicionales_financiero",
    monthlyViewTable: "seguimiento_mensual_financiero",
    matterTable: "financiero_matters"
  },
  {
    moduleId: "tax-compliance",
    historyTable: "distribuidor_history_compliance",
    termsTable: "terminos_compliance",
    eventsTable: "sucesos_compliance",
    additionalTasksTable: "tareas_adicionales_compliance",
    monthlyViewTable: "seguimiento_mensual_compliance",
    matterTable: "compliance_matters"
  }
];

export const LEGACY_CORE_TABLES = [
  "clients",
  "quote_types",
  "quotes",
  "leads_tracking",
  "active_matters",
  "finance_records",
  "finance_snapshots",
  "gastos_generales",
  "commission_receivers",
  "commission_records",
  "commission_snapshots",
  "dias_inhabiles"
] as const;

export const LEGACY_ALL_TABLES = (() => {
  const tables = new Set<string>(LEGACY_CORE_TABLES);

  for (const moduleConfig of EXECUTION_MODULE_CONFIGS) {
    tables.add(moduleConfig.historyTable);
    tables.add(moduleConfig.termsTable);
    tables.add(moduleConfig.eventsTable);
    tables.add(moduleConfig.additionalTasksTable);
    tables.add(moduleConfig.matterTable);
    if (moduleConfig.monthlyViewTable) {
      tables.add(moduleConfig.monthlyViewTable);
    }

    const module = LEGACY_TASK_MODULES.find((entry) => entry.moduleId === moduleConfig.moduleId);
    if (!module) {
      continue;
    }

    for (const table of module.tables) {
      tables.add(table.sourceTable);
    }
  }

  return [...tables].sort((left, right) => left.localeCompare(right));
})();

export function getExecutionModuleConfig(moduleId: ModuleId) {
  return EXECUTION_MODULE_CONFIGS.find((entry) => entry.moduleId === moduleId);
}

export const LEGACY_EXECUTION_MODULES = LEGACY_TASK_MODULES.map((module) => {
  const config = getExecutionModuleConfig(module.moduleId as ModuleId);
  if (!config) {
    throw new Error(`Missing migration config for module ${module.moduleId}.`);
  }

  return {
    ...config,
    slug: module.slug,
    label: module.label,
    defaultResponsible: module.defaultResponsible,
    verificationKeys: module.verificationColumns.map((column) => column.key),
    sourceTables: module.tables.map((table) => ({
      slug: table.slug,
      title: table.title,
      sourceTable: table.sourceTable,
      mode: table.mode,
      autoTerm: table.autoTerm ?? false,
      showReportedPeriod: table.showReportedPeriod ?? false
    }))
  };
});
