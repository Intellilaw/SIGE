import type { TaskModuleDefinition } from "./domain";

const track = (
  id: string,
  label: string,
  mode: "STATUS" | "WORKFLOW" = "STATUS",
  recurring = false,
  recurrenceRule?: TaskModuleDefinition["tracks"][number]["recurrenceRule"],
) => ({
  id,
  label,
  mode,
  recurring,
  recurrenceRule,
});

export const TASK_MODULES: TaskModuleDefinition[] = [
  {
    id: "litigation",
    team: "LITIGATION",
    label: "Litigio",
    summary: "Flujos judiciales, escritos y seguimiento procesal del equipo de litigio.",
    tracks: [
      track("escritos", "2. Escritos que deben ser presentados"),
      track("terminos", "Terminos"),
      track("escritos-fondo", "1. Escritos de fondo"),
      track("desahogo-prevenciones", "3. Desahogo de prevenciones"),
      track("audiencias", "6. Audiencias y citas oficiales"),
      track("citas-actuarios", "7. Citas con actuarios"),
      track("jueces-magistrados", "4. Hablar con jueces y magistrados"),
      track("publicaciones", "14. Publicaciones"),
      track("esperar-resolucion", "15. Esperar resolucion"),
      track("albacea", "16. Fechas de aceptacion del cargo de albacea"),
      track("apelaciones-preventiva", "9. Apelaciones de tramitacion preventiva"),
      track("archivo-judicial", "17. Expedientes devueltos del Archivo Judicial"),
      track("sentencias", "5. Sentencias pendientes"),
      track("copias", "11. Copias pendientes"),
      track("oficios", "12. Oficios y exhortos pendientes"),
      track("devoluciones", "18. Devoluciones de documentos pendientes"),
      track("amparos", "10. Apelaciones, recursos y amparos pendientes de ser radicados"),
      track("notificaciones", "8. Notificaciones y emplazamientos pendientes"),
      track("escaneados", "19. Expedientes que deben ser escaneados"),
      track("pruebas", "13. Pruebas pendientes"),
      track("delegados", "20. Asuntos delegados en equipo de derecho corporativo-laboral"),
      track("terceros-ajenos", "21. Dar seguimiento a acciones de terceros"),
      track("otros-tramites", "22. Otros tramites")
    ]
  },
  {
    id: "corporate-labor",
    team: "CORPORATE_LABOR",
    label: "Corporativo y laboral",
    summary: "Seguimiento corporativo, administrativo y post-firma para asuntos del equipo.",
    tracks: [
      track("tramites-impi", "1. Ingresar tramite IMPI"),
      track("tramites-sai", "2. Ingresar SAI"),
      track("informes-rnie", "3. Registrar informe trimestral o anual RNIE"),
      track("instrumentos-firma", "4. Instrumentos pendientes de firma"),
      track("cuentas-bancarias", "5. Cuentas bancarias (y similares) pendientes"),
      track("uso-efectivo", "6. Declaraciones de uso efectivo"),
      track("tramites-administrativos", "7. Otros tramites administrativos"),
      track("citas-audiencias", "8. Citas y audiencias"),
      track("cambio-accionistas", "9. Avisos SAT cambio de accionistas"),
      track("desahogo-prevenciones", "10. Desahogo de prevenciones"),
      track("esperar-resolucion", "11. Esperar resolucion"),
      track("registro-instrumento", "12. Registro de instrumento en RPP, RPM o RPC"),
      track("entrega-instrumento-clientes", "13. Entrega de instrumento a clientes"),
      track("busquedas-foneticas", "14. Busquedas foneticas"),
      track("terminos-corporativo", "Terminos")
    ]
  },
  {
    id: "settlements",
    team: "SETTLEMENTS",
    label: "Convenios",
    summary: "Flujos de convenios, contratos y mediacion del equipo de convenios.",
    tracks: [
      track("contratos-no-mediacion", "1. Convenios o contratos (no de mediacion)", "WORKFLOW"),
      track("convenios-mediacion", "2. Convenios de mediacion", "WORKFLOW"),
      track("desahogo-prevenciones", "3. Desahogo de prevenciones"),
      track("investigacion-antecedentes-registrales", "4. Investigacion de antecedentes registrales")
    ]
  },
  {
    id: "financial-law",
    team: "FINANCIAL_LAW",
    label: "Derecho financiero",
    summary: "Reportes regulatorios, respuestas y terminos recurrentes del equipo financiero.",
    tracks: [
      track("reportes-cnbv", "1. Reportes CNBV", "WORKFLOW", true),
      track("reportes-condusef-mensuales", "2. Reportes CONDUSEF (mensuales)", "WORKFLOW", true),
      track("reportes-condusef-trimestrales", "3. Reportes CONDUSEF (trimestrales)", "WORKFLOW", true),
      track("contratos-credito-sofom", "4. Contratos de credito SOFOM", "STATUS", true, { kind: "cuatrimestral_last_business_day" }),
      track("reportes-operaciones-vulnerables", "5. Reportes de operaciones vulnerables", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 17 }),
      track("quejas-condusef-contestadas", "6. Quejas CONDUSEF que deben ser contestadas"),
      track("desahogos-requerimientos", "7. Desahogos de requerimientos"),
      track("reportes-operaciones-inusuales", "8. Reportes de operaciones inusuales"),
      track("reportes-operaciones-preocupantes", "9. Reportes de operaciones preocupantes"),
      track("cuentas-bancarias-similares-proceso", "10. Cuentas bancarias y similares en proceso")
    ]
  },
  {
    id: "tax-compliance",
    team: "TAX_COMPLIANCE",
    label: "Compliance fiscal",
    summary: "Obligaciones fiscales, contables y recurrentes del equipo de compliance fiscal.",
    tracks: [
      track("cf-nomina-contablidad", "1. Compliance fiscal (con nomina y con contablidad)", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 10 }),
      track("cf-nomina-sin-contabilidad", "2. Compliance fiscal (con nomina sin contabilidad)", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 10 }),
      track("cf-operaciones-sin-nomina-con-contablidad", "3. Compliance fiscal (con operaciones, sin nomina y con contablidad)", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 10 }),
      track("cf-operaciones-sin-nomina-sin-contablidad", "4. Compliance fiscal (con operaciones, sin nomina y sin contablidad)", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 10 }),
      track("cf-sin-operaciones", "5. Compliance fiscal (sin operaciones)", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 17 }),
      track("retenciones-plataformas-digitales", "6. Retenciones por plataformas digitales (ISR e IVA)", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 10 }),
      track("procesamiento-nomina", "7. Procesamiento de nomina", "WORKFLOW", true, { kind: "monthly_fixed_day", day: 17 }),
      track("repse-imss-sisub", "8. Declaracion informativa REPSE - IMSS (SISUB)", "WORKFLOW", true),
      track("repse-infonavit-sisub", "9. Declaracion informativa REPSE - INFONAVIT (SISUB)", "WORKFLOW", true),
      track("declaracion-sueldos-salarios", "10. Declaracion informativa de sueldos y salarios / asimilados (15 de febrero)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 2 }),
      track("declaracion-residentes-extranjero", "11. Declaracion informativa de pagos a residentes en el extranjero (15 de febrero)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 2 }),
      track("prima-riesgo-imss", "12. Determinacion anual de la Prima en el Seguro de Riesgos de Trabajo - IMSS (28 de febrero)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 2 }),
      track("aviso-promedio-infonavit", "13. Aviso anual de promedio de trabajadores - INFONAVIT (ultimo dia de febrero, si aplica)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 2 }),
      track("declaracion-anual-personas-morales", "14. Declaracion anual de personas morales (31 de marzo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 3 }),
      track("issif", "15. Informacion Sobre la Situacion Fiscal - ISSIF (31 de marzo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 3 }),
      track("accionistas-extranjeros", "16. Declaracion anual de relacion de accionistas extranjeros (31 de marzo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 3 }),
      track("declaracion-anual-personas-fisicas", "17. Declaracion anual de personas fisicas (30 de abril)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 4 }),
      track("dim", "18. Declaracion Informativa Multiple - DIM (15 de mayo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 5 }),
      track("anexo9-dim", "19. Declaracion informativa de operaciones con partes relacionadas - Anexo 9 DIM (15 de mayo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 5 }),
      track("local-file", "20. Declaracion informativa local (Local File - art. 76-A LISR) (15 de mayo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 5 }),
      track("sipred", "21. Dictamen fiscal - SIPRED (opcional) (15 de mayo)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 5 }),
      track("diemse", "22. Declaracion Informativa DIEMSE (30 de junio)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 6 }),
      track("master-file-cbc", "23. Declaraciones informativas de Precios de Transferencia (Master File y Country-by-Country Report)", "WORKFLOW", true, { kind: "yearly_last_business_day_of_month", month: 12 }),
      track("inscripciones-rfc", "24. Inscripciones ante el RFC"),
      track("actualizacion-rfc", "25. Aviso de actualizacion al RFC"),
      track("forma-76", "26. Declaracion informativa de operaciones relevantes - Forma 76"),
      track("esquemas-reportables", "27. Aviso de esquemas reportables"),
      track("cambio-accionistas", "28. Aviso de modificacion o incorporacion de socios o accionistas"),
      track("aviso-fusion", "29. Aviso de fusion de sociedades"),
      track("aviso-escision", "30. Aviso de escision de sociedades"),
      track("aviso-liquidacion-rfc", "31. Aviso de liquidacion o cancelacion en el RFC"),
      track("cambio-residencia-fiscal", "32. Aviso de cambio de residencia fiscal"),
      track("compensacion-saldos-favor", "33. Aviso de compensacion de saldos a favor"),
      track("perdidas-fiscales-control", "34. Avisos relacionados con perdidas fiscales en cambios de control accionario"),
      track("inscripcion-patronal-imss", "35. Inscripcion patronal ante el IMSS"),
      track("modificacion-registro-patronal-imss", "36. Aviso de modificacion del registro patronal (IMSS)"),
      track("movimientos-imss", "37. Movimientos afiliatorios ante el IMSS"),
      track("avisos-patronales-infonavit", "38. Avisos patronales ante INFONAVIT"),
      track("vigencia-efirmas", "39. Vigencia de e.firmas"),
      track("citas-sat-pendientes", "40. Citas SAT pendientes"),
      track("tramites-en-proceso", "41. Tramites en proceso"),
      track("otros-terminos", "42. Otros terminos"),
      track("sociedades-domiciliadas-yacatas", "43. Sociedades domiciliadas en Yacatas")
    ]
  }
];

export function findTaskModule(moduleId: string) {
  return TASK_MODULES.find((module) => module.id === moduleId);
}
