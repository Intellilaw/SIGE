const statusTabs = (pendingLabel = "1. Pendientes", completedLabel = "2. Completados") => [
    { key: "pendientes", status: "pendiente", label: pendingLabel, isCompleted: false },
    { key: "presentados", status: "presentado", label: completedLabel, isCompleted: true }
];
const workflowTabs = (labels) => labels.map((label, index) => ({
    key: `stage_${index + 1}`,
    stage: index + 1,
    label,
    isCompleted: index === labels.length - 1
}));
const table = (config) => ({
    mode: config.mode ?? "status",
    dateLabel: config.dateLabel ?? "Fecha en la que la tarea debe ser realizada",
    showDateColumn: config.showDateColumn ?? true,
    tabs: config.tabs ?? statusTabs(),
    ...config
});
const litigationTables = [
    table({ slug: "escritos-fondo", sourceTable: "escritos_fondo", title: "1. Escritos de fondo", mode: "workflow", tabs: workflowTabs(["1. Pendientes", "2. Terminados sin presentar", "3. Presentados"]), dateLabel: "Fecha debe presentarse" }),
    table({ slug: "escritos", sourceTable: "escritos_kpi", title: "2. Escritos que deben ser presentados", autoTerm: true, termManagedDate: true, dateLabel: "Fecha presentar" }),
    table({ slug: "desahogo-prevenciones", sourceTable: "desahogo_prevenciones", title: "3. Desahogo de Prevenciones", autoTerm: true, termManagedDate: true, tabs: statusTabs("1. Pendientes", "2. Presentados"), dateLabel: "Fecha Presentar" }),
    table({ slug: "jueces-magistrados", sourceTable: "hablar_jueces_magistrados", title: "4. Hablar con jueces y magistrados", tabs: statusTabs("1. Pendientes", "2. Historial"), dateLabel: "Fecha Estimada" }),
    table({ slug: "sentencias", sourceTable: "sentencias_pendientes", title: "5. Sentencias pendientes", dateLabel: "Fecha Esperada" }),
    table({ slug: "audiencias", sourceTable: "audiencias_citas_oficiales", title: "6. Audiencias y citas oficiales", dateLabel: "Fecha de la audiencia/cita" }),
    table({ slug: "citas-actuarios", sourceTable: "citas_actuarios", title: "7. Citas con actuarios", dateLabel: "Fecha en la que la cita debe realizarse" }),
    table({ slug: "notificaciones", sourceTable: "notificaciones_emplazamientos_pendientes", title: "8. Notificaciones y emplazamientos", dateLabel: "Fecha en la que la tarea debe ser realizada" }),
    table({ slug: "apelaciones-preventiva", sourceTable: "apelaciones_tramitacion_preventiva", title: "9. Apelaciones de tramitacion preventiva" }),
    table({ slug: "amparos", sourceTable: "apelaciones_recursos_amparos_pendientes", title: "10. Apelaciones, recursos y amparos pendientes de ser radicados", dateLabel: "Fecha Limite" }),
    table({ slug: "copias", sourceTable: "copias_pendientes", title: "11. Copias pendientes", dateLabel: "Fecha Limite" }),
    table({ slug: "oficios", sourceTable: "oficios_exhortos_pendientes", title: "12. Oficios y exhortos pendientes", dateLabel: "Fecha Limite" }),
    table({ slug: "pruebas", sourceTable: "pruebas_pendientes", title: "13. Pruebas pendientes", dateLabel: "Fecha Pruebas" }),
    table({ slug: "publicaciones", sourceTable: "publicaciones", title: "14. Publicaciones", dateLabel: "Fecha de la publicacion" }),
    table({ slug: "esperar-resolucion", sourceTable: "esperar_resolucion", title: "15. Esperar resolucion", dateLabel: "Fecha esperada" }),
    table({ slug: "albacea", sourceTable: "fechas_aceptacion_albacea", title: "16. Fechas de aceptacion del cargo de albacea", dateLabel: "Fecha en que se acepto el cargo" }),
    table({ slug: "archivo-judicial", sourceTable: "expedientes_devueltos_archivo", title: "17. Expedientes devueltos del Archivo Judicial", dateLabel: "Fecha esperada" }),
    table({ slug: "devoluciones", sourceTable: "devoluciones_documentos_pendientes", title: "18. Devoluciones de documentos", tabs: statusTabs("1. Pendientes", "2. Devueltos / Concluidos") }),
    table({ slug: "escaneados", sourceTable: "expedientes_escaneados", title: "19. Expedientes a escanear", tabs: statusTabs("1. Pendientes", "2. Escaneados / Concluidos") }),
    table({ slug: "delegados", sourceTable: "asuntos_delegados_corporativo", title: "20. Asuntos delegados Corporativo-Laboral", tabs: statusTabs("1. Pendientes", "2. Concluidos") }),
    table({ slug: "terceros-ajenos", sourceTable: "seguimiento_terceros_ajenos", title: "21. Dar seguimiento a acciones de terceros", dateLabel: "Fecha Esperada" }),
    table({ slug: "otros-tramites", sourceTable: "otros_tramites", title: "22. Otros tramites", dateLabel: "Fecha Esperada" })
];
const corporateTables = [
    table({ slug: "tramites-impi", sourceTable: "tramites_impi", title: "1. Ingresar tramite IMPI", dateEditable: true }),
    table({ slug: "tramites-sai", sourceTable: "tramites_sai", title: "2. Ingresar SAI", dateEditable: true }),
    table({ slug: "informes-rnie", sourceTable: "informes_rnie", title: "3. Registrar informe trimestral o anual RNIE", autoTerm: true, termManagedDate: true, dateLabel: "Fecha limite" }),
    table({ slug: "instrumentos-firma", sourceTable: "instrumentos_pendientes_firma", title: "4. Instrumentos pendientes de firma", dateEditable: true }),
    table({ slug: "cuentas-bancarias", sourceTable: "cuentas_bancarias_pend", title: "5. Cuentas bancarias (y similares) pendientes", dateEditable: true }),
    table({ slug: "uso-efectivo", sourceTable: "declaraciones_uso_efectivo", title: "6. Declaraciones de uso efectivo", autoTerm: true, termManagedDate: true, dateLabel: "Fecha limite" }),
    table({ slug: "tramites-administrativos", sourceTable: "otros_tramites_administrativos", title: "7. Otros tramites administrativos", dateEditable: true }),
    table({ slug: "citas-audiencias", sourceTable: "citas_audiencias_corporativo", title: "8. Citas y audiencias", dateLabel: "Fecha Evento", dateEditable: true }),
    table({ slug: "cambio-accionistas", sourceTable: "avisos_sat_cambio_accionistas", title: "9. Avisos SAT cambio de accionistas", autoTerm: true, termManagedDate: true, dateLabel: "Fecha limite" }),
    table({ slug: "desahogo-prevenciones", sourceTable: "desahogo_prevenciones_corporativo", title: "10. Desahogo de prevenciones", autoTerm: true, termManagedDate: true, dateLabel: "Fecha limite" }),
    table({ slug: "esperar-resolucion", sourceTable: "esperar_resolucion_corporativo", title: "11. Esperar resolucion", dateEditable: true }),
    table({ slug: "registro-instrumento", sourceTable: "registro_instrumento_rpp_rpm_rpc", title: "12. Registro de instrumento en RPP, RPM o RPC", dateEditable: true }),
    table({ slug: "entrega-instrumento-clientes", sourceTable: "entrega_instrumento_clientes", title: "13. Entrega de instrumento a clientes", dateEditable: true }),
    table({ slug: "busquedas-foneticas", sourceTable: "busquedas_foneticas", title: "14. Busquedas foneticas", dateEditable: true })
];
const conveniosTables = [
    table({ slug: "contratos-no-mediacion", sourceTable: "convenios_contratos_no_mediacion", title: "1. Convenios o contratos (no de mediacion)", mode: "workflow", tabs: workflowTabs(["1. Convenios o contratos (no de mediacion) en proceso", "2. Convenios o contratos (no de mediacion) enviados al cliente", "3. Convenios o contratos (no de mediacion) aprobados por el cliente"]), dateEditable: true }),
    table({ slug: "convenios-mediacion", sourceTable: "convenios_mediacion", title: "2. Convenios de mediacion", mode: "workflow", tabs: workflowTabs(["1. Pendientes de firma", "2. Pendiente de registro CJA", "3. Pendiente de entrega a cliente tras CJA", "4. Pendiente RPP, RPM o RPC", "5. Pendiente de entrega a cliente tras RPP, RPM o RPC", "6. Ya procesados de manera completa"]), dateEditable: true }),
    table({ slug: "desahogo-prevenciones", sourceTable: "desahogo_prevenciones_convenios", title: "3. Desahogo de prevenciones", autoTerm: true, termManagedDate: true, dateLabel: "Fecha limite" }),
    table({ slug: "investigacion-antecedentes-registrales", sourceTable: "investigacion_antecedentes_registrales", title: "4. Investigacion de antecedentes registrales", dateEditable: true })
];
const financieroTables = [
    table({ slug: "reportes-cnbv", sourceTable: "fin_reportes_cnbv", title: "1. Reportes CNBV", mode: "workflow", tabs: workflowTabs(["1. Solicitudes periodicas de informacion", "2. Reportes IFIT pendientes", "3. Reportes procesados de manera completa"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true, reportedPeriodLabel: "Mes reportado", dateLabel: "Fecha limite" }),
    table({ slug: "reportes-condusef-mensuales", sourceTable: "fin_reportes_condusef", title: "2. Reportes CONDUSEF (mensuales)", mode: "workflow", tabs: workflowTabs(["1. Solicitudes periodicas de informacion", "2. Reportes REUS pendientes (primera quincena)", "3. Reportes REUS pendientes (segunda quincena)", "4. Reportes RECO pendientes", "5. Reportes REDECO (mensuales) pendientes", "6. Reportes REUNE (mensuales) pendientes", "7. Reportes procesados de manera completa"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true, reportedPeriodLabel: "Mes reportado", dateLabel: "Fecha limite" }),
    table({ slug: "reportes-condusef-trimestrales", sourceTable: "fin_reportes_condusef_trimestrales", title: "3. Reportes CONDUSEF (trimestrales)", mode: "workflow", tabs: workflowTabs(["1. Solicitudes periodicas de informacion", "2. Reportes REDECO (trimestrales) pendientes", "3. Reportes REUNE (trimestrales) pendientes", "4. Reportes procesados de manera completa"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true, reportedPeriodLabel: "Trimestre reportado", dateLabel: "Fecha limite" }),
    table({ slug: "contratos-credito-sofom", sourceTable: "fin_contratos_credito_sofom", title: "4. Contratos de credito SOFOM", autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true, reportedPeriodLabel: "Trimestre al que corresponde el contrato", dateLabel: "Fecha limite", tabs: statusTabs("1. Proximos contratos a ser celebrados", "2. Contratos celebrados") }),
    table({ slug: "reportes-operaciones-vulnerables", sourceTable: "fin_reportes_operaciones_vulnerables", title: "5. Reportes de operaciones vulnerables", mode: "workflow", tabs: workflowTabs(["1. Solicitudes periodicas de informacion", "2. Reportes de operaciones vulnerables pendientes", "3. Reportes procesados de manera completa"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true, reportedPeriodLabel: "Mes reportado", dateLabel: "Fecha limite" }),
    table({ slug: "quejas-condusef-contestadas", sourceTable: "fin_quejas_condusef_contestadas", title: "6. Quejas CONDUSEF que deben ser contestadas", autoTerm: true, termManagedDate: true, dateLabel: "Fecha en la que la queja debe ser contestada" }),
    table({ slug: "desahogos-requerimientos", sourceTable: "fin_desahogos_requerimientos", title: "7. Desahogos de requerimientos", autoTerm: true, termManagedDate: true }),
    table({ slug: "reportes-operaciones-inusuales", sourceTable: "fin_reportes_operaciones_inusuales", title: "8. Reportes de operaciones inusuales", autoTerm: true, termManagedDate: true }),
    table({ slug: "reportes-operaciones-preocupantes", sourceTable: "fin_reportes_operaciones_preocupantes", title: "9. Reportes de operaciones preocupantes", autoTerm: true, termManagedDate: true }),
    table({ slug: "cuentas-bancarias-similares-proceso", sourceTable: "fin_cuentas_bancarias_similares_proceso", title: "10. Cuentas bancarias y similares en proceso", dateLabel: "Fecha en la que la tarea debe ser completada" })
];
const complianceTables = [
    table({ slug: "cf-nomina-contablidad", sourceTable: "comp_cf_nomina_contab", title: "1. Compliance fiscal (con nomina y con contablidad)", mode: "workflow", tabs: workflowTabs(["1. Envio de predeclaracion", "2. Declaracion provisional de ISR e IVA", "3. DIOT", "4. Determinacion de cuotas obrero patronales IMSS", "5. Impuesto sobre nominas", "6. Envio de entregable", "7. Timbrado de nomina del mes corriente", "8. Registro de la contabilidad", "9. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    table({ slug: "cf-nomina-sin-contabilidad", sourceTable: "comp_cf_nomina_sin_contab", title: "2. Compliance fiscal (con nomina sin contabilidad)", mode: "workflow", tabs: workflowTabs(["1. Envio de predeclaracion", "2. Declaracion provisional de ISR e IVA", "3. DIOT", "4. Determinacion de cuotas obrero patronales IMSS", "5. Impuesto sobre nominas", "6. Envio de entregable", "7. Timbrado de nomina del mes corriente", "8. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    table({ slug: "cf-operaciones-sin-nomina-con-contablidad", sourceTable: "comp_cf_oper_sin_nomina_contab", title: "3. Compliance fiscal (con operaciones, sin nomina y con contablidad)", mode: "workflow", tabs: workflowTabs(["1. Envio de predeclaracion", "2. Declaracion provisional de ISR e IVA", "3. DIOT", "4. Envio de entregable", "5. Registro de la contabilidad", "6. Carga de contabilidad en el SAT", "7. Envio de contabilidad mensual y acuse", "8. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    table({ slug: "cf-operaciones-sin-nomina-sin-contablidad", sourceTable: "comp_cf_oper_sin_nomina_sin_contab", title: "4. Compliance fiscal (con operaciones, sin nomina y sin contablidad)", mode: "workflow", tabs: workflowTabs(["1. Envio de predeclaracion", "2. Declaracion provisional de ISR e IVA", "3. DIOT", "4. Envio de entregable", "5. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    table({ slug: "cf-sin-operaciones", sourceTable: "comp_cf_sin_operaciones", title: "5. Compliance fiscal (sin operaciones)", mode: "workflow", tabs: workflowTabs(["1. Declaracion provisional de ISR e IVA", "2. DIOT", "3. Envio de entregable", "4. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    table({ slug: "retenciones-plataformas-digitales", sourceTable: "comp_ret_plat_digitales", title: "6. Retenciones por plataformas digitales (ISR e IVA)", mode: "workflow", tabs: workflowTabs(["1. Envio de predeclaracion", "2. Declaracion de retenciones", "3. Envio de entregable", "4. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    table({ slug: "procesamiento-nomina", sourceTable: "comp_procesamiento_nomina", title: "7. Procesamiento de nomina", mode: "workflow", tabs: workflowTabs(["1. Determinacion de cuotas obrero patronales IMSS", "2. Impuesto sobre nominas", "3. Timbrado de nomina", "4. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true }),
    ...[
        ["repse-imss-sisub", "comp_repse_imss_sisub", "8. Declaracion informativa REPSE - IMSS (SISUB)"],
        ["repse-infonavit-sisub", "comp_repse_infonavit_sisub", "9. Declaracion informativa REPSE - INFONAVIT (SISUB)"],
        ["declaracion-sueldos-salarios", "comp_decl_sueldos_salarios", "10. Declaracion informativa de sueldos y salarios / asimilados (15 de febrero)"],
        ["declaracion-residentes-extranjero", "comp_decl_residentes_extranjero", "11. Declaracion informativa de pagos a residentes en el extranjero (15 de febrero)"],
        ["prima-riesgo-imss", "comp_prima_riesgo_imss", "12. Determinacion anual de la Prima en el Seguro de Riesgos de Trabajo - IMSS (28 de febrero)"],
        ["aviso-promedio-infonavit", "comp_aviso_promedio_infonavit", "13. Aviso anual de promedio de trabajadores - INFONAVIT"],
        ["declaracion-anual-personas-morales", "comp_declaraciones_anuales", "14. Declaracion anual de personas morales (31 de marzo)"],
        ["issif", "comp_issif", "15. Informacion Sobre la Situacion Fiscal - ISSIF (31 de marzo)"],
        ["accionistas-extranjeros", "comp_declaracion_anual_accionistas_extranjeros", "16. Declaracion anual de relacion de accionistas extranjeros (31 de marzo)"],
        ["declaracion-anual-personas-fisicas", "comp_decl_anual_personas_fisicas", "17. Declaracion anual de personas fisicas (30 de abril)"],
        ["dim", "comp_dim", "18. Declaracion Informativa Multiple - DIM (15 de mayo)"],
        ["anexo9-dim", "comp_anexo9_dim", "19. Declaracion informativa de operaciones con partes relacionadas - Anexo 9 DIM (15 de mayo)"],
        ["local-file", "comp_local_file", "20. Declaracion informativa local (Local File - art. 76-A LISR) (15 de mayo)"],
        ["sipred", "comp_sipred", "21. Dictamen fiscal - SIPRED (opcional) (15 de mayo)"],
        ["diemse", "comp_diemse", "22. Declaracion Informativa DIEMSE (30 de junio)"],
        ["master-file-cbc", "comp_master_file_cbc", "23. Declaraciones informativas de Precios de Transferencia"]
    ].map(([slug, sourceTable, title]) => table({ slug, sourceTable, title, mode: "workflow", tabs: workflowTabs(["1. Declaracion pendiente", "2. Proceso completo"]), autoTerm: true, termManagedDate: true, periodicProcess: true, showReportedPeriod: true, reportedPeriodLabel: "Ejercicio fiscal" })),
    table({ slug: "inscripciones-rfc", sourceTable: "comp_inscripciones_rfc", title: "24. Inscripciones ante el RFC", autoTerm: false, termManagedDate: false }),
    table({ slug: "actualizacion-rfc", sourceTable: "comp_actualizacion_rfc", title: "25. Aviso de actualizacion al RFC", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "forma-76", sourceTable: "comp_forma_76", title: "26. Declaracion informativa de operaciones relevantes - Forma 76", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "esquemas-reportables", sourceTable: "comp_esquemas_reportables", title: "27. Aviso de esquemas reportables", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "cambio-accionistas", sourceTable: "comp_declaracion_cambio_accionistas", title: "28. Aviso de modificacion o incorporacion de socios o accionistas", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "aviso-fusion", sourceTable: "comp_aviso_fusion", title: "29. Aviso de fusion de sociedades", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "aviso-escision", sourceTable: "comp_aviso_escision", title: "30. Aviso de escision de sociedades", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "aviso-liquidacion-rfc", sourceTable: "comp_aviso_liquidacion_rfc", title: "31. Aviso de liquidacion o cancelacion en el RFC", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "cambio-residencia-fiscal", sourceTable: "comp_cambio_residencia_fiscal", title: "32. Aviso de cambio de residencia fiscal", autoTerm: true, termManagedDate: true }),
    table({ slug: "compensacion-saldos-favor", sourceTable: "comp_compensacion_saldos_favor", title: "33. Aviso de compensacion de saldos a favor", autoTerm: true, termManagedDate: true }),
    table({ slug: "perdidas-fiscales-control", sourceTable: "comp_perdidas_fiscales_control", title: "34. Avisos relacionados con perdidas fiscales en cambios de control accionario", autoTerm: true, termManagedDate: true }),
    table({ slug: "inscripcion-patronal-imss", sourceTable: "comp_inscripcion_patronal_imss", title: "35. Inscripcion patronal ante el IMSS", autoTerm: false, termManagedDate: false }),
    table({ slug: "modificacion-registro-patronal-imss", sourceTable: "comp_mod_reg_patronal_imss", title: "36. Aviso de modificacion del registro patronal (IMSS)", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "movimientos-imss", sourceTable: "comp_movimientos_imss", title: "37. Movimientos afiliatorios ante el IMSS", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "avisos-patronales-infonavit", sourceTable: "comp_avisos_patronales_infonavit", title: "38. Avisos patronales ante INFONAVIT", autoTerm: true, termManagedDate: true }),
    table({ slug: "vigencia-efirmas", sourceTable: "comp_vigencia_efirmas", title: "39. Vigencia de e.firmas", autoTerm: true, termManagedDate: true, dateLabel: "Fecha en la que debe ser renovada la e.firma" }),
    table({ slug: "citas-sat-pendientes", sourceTable: "comp_citas_sat_pendientes", title: "40. Citas SAT pendientes", dateLabel: "Fecha de la cita", dateEditable: true }),
    table({ slug: "tramites-en-proceso", sourceTable: "comp_tramites_en_proceso", title: "41. Tramites en proceso", dateEditable: true }),
    table({ slug: "otros-terminos", sourceTable: "comp_otros_terminos", title: "42. Otros terminos", autoTerm: true, termManagedDate: true, dateLabel: "Termino" }),
    table({ slug: "sociedades-domiciliadas-yacatas", sourceTable: "comp_empresas_domiciliadas_yacatas", title: "43. Sociedades domiciliadas en Yacatas", showDateColumn: false })
];
export const LEGACY_TASK_MODULES = [
    {
        slug: "litigio",
        moduleId: "litigation",
        label: "Litigio",
        defaultResponsible: "LAMR",
        termEventLabel: "Escrito",
        termDateLabel: "Fecha Termino",
        verificationColumns: [
            { key: "verificado_meoo", label: "V. MEOO" },
            { key: "verificado_lamr", label: "V. LAMR" },
            { key: "verificado_ekpo", label: "V. EKPO" },
            { key: "verificado_nbsg", label: "V. NBSG" }
        ],
        tables: litigationTables,
        hasRecurringTerms: false
    },
    {
        slug: "corporativo",
        moduleId: "corporate-labor",
        label: "Corporativo y laboral",
        defaultResponsible: "CRV/CAGC",
        termEventLabel: "Evento corporativo",
        termDateLabel: "Fecha Termino",
        verificationColumns: [
            { key: "verificado_crv", label: "V. CRV" },
            { key: "verificado_cagc", label: "V. CAGC" }
        ],
        tables: corporateTables,
        hasRecurringTerms: false
    },
    {
        slug: "convenios",
        moduleId: "settlements",
        label: "Convenios",
        defaultResponsible: "MLDM/CAOG",
        termEventLabel: "Evento convenios",
        termDateLabel: "Fecha Termino",
        verificationColumns: [
            { key: "verificado_lider", label: "V. MLDM" },
            { key: "verificado_colaborador", label: "V. CAOG" }
        ],
        tables: conveniosTables,
        hasRecurringTerms: true
    },
    {
        slug: "financiero",
        moduleId: "financial-law",
        label: "Derecho financiero",
        defaultResponsible: "RJVO/HKMG",
        termEventLabel: "Evento financiero",
        termDateLabel: "Fecha limite",
        verificationColumns: [
            { key: "verificado_lider", label: "V. RJVO" },
            { key: "verificado_colaborador", label: "V. HKMG" }
        ],
        tables: financieroTables,
        hasRecurringTerms: true
    },
    {
        slug: "compliance",
        moduleId: "tax-compliance",
        label: "Compliance fiscal",
        defaultResponsible: "MPC/YMAH",
        termEventLabel: "Evento compliance",
        termDateLabel: "Fecha limite",
        verificationColumns: [
            { key: "verificado_lider", label: "V. MPC" },
            { key: "verificado_colaborador", label: "V. YMAH" }
        ],
        tables: complianceTables,
        hasRecurringTerms: true
    }
];
export const LEGACY_TASK_MODULE_BY_SLUG = Object.fromEntries(LEGACY_TASK_MODULES.map((module) => [module.slug, module]));
export const LEGACY_TASK_MODULE_BY_ID = Object.fromEntries(LEGACY_TASK_MODULES.map((module) => [module.moduleId, module]));
export function getLegacyTaskTable(module, tableSlug) {
    return module.tables.find((tableConfig) => tableConfig.slug === tableSlug);
}
export function getAdjacentLegacyTaskTable(module, tableSlug, direction) {
    const index = module.tables.findIndex((tableConfig) => tableConfig.slug === tableSlug);
    if (index < 0) {
        return module.tables[0];
    }
    const nextIndex = (index + direction + module.tables.length) % module.tables.length;
    return module.tables[nextIndex];
}
