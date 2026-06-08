export type IntelligenceConnectionStatus = "base" | "ready" | "active";

export interface IntelligenceConnection {
  id: string;
  section: string;
  surface: string;
  status: IntelligenceConnectionStatus;
  promptName: string;
  promptVersion: string;
  prompt: string;
  context: string[];
  output: string[];
  cadence: string;
}

export const OPENAI_FRONTIER_MODEL = {
  modelId: "gpt-5.5",
  policy: "Usar el modelo OpenAI de mayor capacidad disponible en la configuracion activa.",
  configurationKey: "OPENAI_RUSCONI_INTELLIGENCE_MODEL",
  source: "Referencia vigente consultada en docs oficiales de OpenAI el 18/05/2026."
} as const;

export const RUSCONI_INTELLIGENCE_CONNECTIONS: IntelligenceConnection[] = [
  {
    id: "RI-000",
    section: "Nucleo Rusconi Intelligence",
    surface: "Registro maestro de prompts y contexto",
    status: "base",
    promptName: "Supervisor transversal SIGE",
    promptVersion: "v0.1",
    prompt:
      "Verifica la seccion SIGE conectada, identifica riesgos operativos, inconsistencias, omisiones y posibles mejoras. Responde con comentarios breves, accionables y trazables al ID de conexion Rusconi Intelligence.",
    context: [
      "ID de conexion RI asignado a la seccion, columna o flujo.",
      "Nombre del modulo SIGE, responsable operativo y tipo de dato evaluado.",
      "Registros visibles para el usuario y metadatos de fecha, estado y prioridad.",
      "Reglas internas del modulo y excepciones aprobadas por direccion."
    ],
    output: [
      "Comentario ejecutivo para el usuario.",
      "Nivel de atencion sugerido.",
      "Referencia del ID RI que genero el comentario."
    ],
    cadence: "Revision periodica por direccion antes de activar cada nueva seccion conectada."
  },
  {
    id: "RI-001",
    section: "Ejecucion",
    surface: "Columna Input de RI",
    status: "active",
    promptName: "Tareas pendientes desde Telegram",
    promptVersion: "v0.2",
    prompt:
      "Lee el contexto operativo del grupo interno de Telegram vinculado al asunto y cruza esa informacion con los datos visibles del asunto en Ejecucion. Identifica tareas pendientes reales, compromisos abiertos, instrucciones no atendidas, fechas relevantes, responsables mencionados y bloqueos operativos. Escribe en la columna Input de RI una respuesta breve y accionable que diga que esta pendiente y que debe hacer el equipo ahora. No hagas recomendaciones genericas, no inventes tareas y no ejecutes acciones: si el grupo no tiene contexto suficiente, indica que falta contexto del grupo o que debe revisarse manualmente.",
    context: [
      "Datos del asunto, cliente, cotizacion, proceso especifico e ID del asunto.",
      "Siguiente tarea, fecha de siguiente tarea, origen y canal operativo.",
      "ID y nombre del grupo interno de Telegram asociado al asunto.",
      "Mensajes recientes y contexto historico relevante del grupo interno de Telegram.",
      "Tareas vigentes, vencimientos, responsables y estados visibles en SIGE.",
      "Autoridad de dias inhabiles, estado de conclusion, hito de conclusion y notas visibles del asunto."
    ],
    output: [
      "Texto breve para la columna Input de RI.",
      "Tarea pendiente principal o lista muy corta de tareas pendientes.",
      "Accion concreta que debe realizar el equipo ahora.",
      "Dato faltante o bloqueo, cuando impida determinar la siguiente accion.",
      "Referencia visual RI-001 en el encabezado de la columna."
    ],
    cadence: "Ajuste de prompt cuando direccion refine como RI-001 debe leer grupos de Telegram y convertirlos en tareas pendientes accionables."
  },
  {
    id: "RI-002",
    section: "Ejecucion",
    surface: "Pestana emergente Crear tareas",
    status: "active",
    promptName: "Deteccion semantica de tareas duplicadas",
    promptVersion: "v0.1",
    prompt:
      "Antes de distribuir una nueva tarea, compara semanticamente su nombre, contexto del asunto y proceso especifico contra tareas vigentes del mismo proceso. Si detectas una coincidencia contextual relevante, alerta al usuario sin impedir que confirme el registro duplicado.",
    context: [
      "Nombre de la tarea seleccionada y nombres editados en los destinos de distribucion.",
      "Tareas vigentes del mismo asunto o proceso, excluyendo tareas completadas.",
      "Cliente, asunto, proceso especifico e ID del asunto visibles en la pestana emergente.",
      "Sinonimos juridicos y operativos que puedan expresar la misma obligacion con textos distintos."
    ],
    output: [
      "Alerta no bloqueante dentro de Crear tareas cuando exista posible duplicado vigente.",
      "Referencia visual RI-002 en la pestana emergente y en la alerta.",
      "Permiso explicito para registrar la tarea duplicada si el usuario confirma la excepcion."
    ],
    cadence: "Ajuste de prompt cuando direccion refine los criterios de duplicidad por equipo o tipo de proceso."
  },
  {
    id: "RI-003",
    section: "Expedientes laborales / Gastos generales",
    surface: "Salario diario en Expedientes laborales y Gastos generales / 2. Nomina",
    status: "active",
    promptName: "Validacion de salario diario contra contrato laboral",
    promptVersion: "v0.1",
    prompt:
      "Compara el salario diario capturado en el expediente laboral contra el salario vigente extraido del contrato laboral y sus addenda. Si el salario esta expresado como salario mensual bruto, toma el salario mensual mas reciente encontrado en contrato/addenda y conviertelo a salario diario dividiendolo entre 30. Cuando el mismo distintivo aparezca en Nomina, confirma adicionalmente que el salario diario de nomina coincide con el salario diario verificado de Expedientes Laborales. Si falta cualquier pieza de evidencia, marca la validacion como no coincidente.",
    context: [
      "Salario diario capturado en Informacion general del expediente laboral.",
      "Contrato laboral cargado en Word o PDF firmado cuando exista.",
      "Addenda laboral cargada en PDF cuando exista y pueda actualizar el salario contractual.",
      "Salario mensual bruto mas reciente extraido de contrato/addenda y convertido a salario diario dividiendolo entre 30.",
      "Salario diario visible en Gastos generales / 2. Nomina cuando la fila esta vinculada a un expediente laboral.",
      "Nombre del colaborador, fecha de ingreso y metadatos del documento contractual."
    ],
    output: [
      "Distintivo RI-003 visible en la tarjeta Salario diario.",
      "Distintivo RI-003 visible en el campo Salario diario de Nomina.",
      "Palomita verde cuando el salario diario coincide con el contrato laboral.",
      "Tache rojo cuando no coincide, falta contrato, falta salario legible en el contrato o la nomina no esta vinculada al expediente."
    ],
    cadence: "Ajuste de prompt cuando direccion defina tolerancias o reglas especiales por tipo de contrato laboral."
  }
];

export function findRusconiIntelligenceConnection(connectionId: string) {
  return RUSCONI_INTELLIGENCE_CONNECTIONS.find((connection) => connection.id === connectionId) ?? null;
}
