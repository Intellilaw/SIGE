import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import type {
  InternalContractPaymentMilestone,
  Matter,
  ProfessionalServicesContractFieldValues,
  ProfessionalServicesContractPrefillResult,
  ProfessionalServicesContractServiceLine,
  Quote
} from "@sige/contracts";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip
} from "docx";
import JSZip from "jszip";
import PDFDocument from "pdfkit";
import { z } from "zod";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";
const PSP_CONTRACT_TEMPLATE_FILES = {
  ES: "Contrato de PSP (RC) (10.09.2024).docx",
  EN: "Professional services agreement (RC) (10.09.2024).docx"
} as const;
const IVA_RATE = 0.16;
const RC_COMPANY_NAME = "Rusconi Legal and Tax Technology S.A. de C.V.";
const RC_REPRESENTATIVE = "Eduardo Miguel Rusconi Trujillo";
const RC_RFC = "RAS191101N7A";
const RC_ADDRESS = "Calle Yacatas numero 215, colonia Narvarte Poniente, alcaldia Benito Juarez, C.P. 03020, en la Ciudad de Mexico";
const RC_BANK_ACCOUNT = [
  ["Titular", "Rusconi & Sauza, S.C."],
  ["Banco", "Citibanamex"],
  ["Numero de Cuenta", "7936923"],
  ["Sucursal", "7013"],
  ["CLABE", "002180701379369233"],
  ["Codigo SWIFT", "BNMXMXMM"]
] as const;

const BODY_COPY = {
  intro:
    "CONTRATO DE PRESTACION DE SERVICIOS PROFESIONALES QUE CELEBRAN RUSCONI LEGAL AND TAX TECHNOLOGY SOCIEDAD ANONIMA DE CAPITAL VARIABLE, EN CALIDAD DE PROFESIONAL ('RUSCONI CONSULTING'), Y LA PERSONA FISICA O MORAL SENALADA EN LA CARATULA DEL CONTRATO CON LA CALIDAD DE CLIENTE (EL 'CLIENTE'), AL TENOR DE LAS DECLARACIONES Y CLAUSULAS SIGUIENTES.",
  declarations:
    "Cada una de las partes declara que cuentan con las facultades correspondientes para la celebracion del presente contrato, que se encuentran al corriente y en cumplimiento de todas las obligaciones exigidas por las leyes mexicanas, que la celebracion del presente contrato no resulta en incumplimiento, o requiere cualquier consentimiento de conformidad con cualquier convenio, contrato o instrumento del cual sea parte o este obligado, no contraviene ninguna autorizacion, sentencia, orden, decreto o ley aplicable, y que no existen juicios sin resolver, reclamaciones, demandas o acciones en su contra que pudiesen de alguna manera afectar la existencia, validez y/o exigibilidad del presente contrato.",
  declarationBridge:
    "En virtud de lo anterior, las partes en el presente estan de acuerdo con las clausulas desarrolladas a continuacion.",
  clauses: [
    ["PRIMERA. Objeto.", "Mediante el presente contrato, Rusconi Consulting se obliga a prestar los servicios senalados en la caratula del mismo."],
    ["SEGUNDA. Recursos propios e independencia.", "Rusconi Consulting realizara las actividades a las que se refiere la clausula anterior de conformidad con su conocimiento, destreza, experiencia y herramientas personales, y sin recibir orden alguna por parte del Cliente. Asimismo, Rusconi Consulting realizara las actividades a las que se refiere la clausula anterior en los horarios que este decida de manera independiente. En este sentido, Rusconi Consulting y el Cliente aceptan que no existira relacion laboral alguna entre las partes."],
    ["TERCERA. Relaciones laborales de Rusconi Consulting.", "Rusconi Consulting se obliga a sacar a salvo y en paz al Cliente de cualquier controversia laboral que llegue a tener respecto a cualquier persona con la que establezca una relacion laboral. Asimismo, Rusconi Consulting se obliga a celebrar un contrato laboral con todo su personal, y a cubrir la totalidad de las obligaciones laborales y en materia de seguridad social a su cargo."],
    ["CUARTA. Contraprestacion.", "Como contraprestacion por la prestacion de sus servicios Rusconi Consulting percibira el pago de honorarios como se senala en la caratula del presente contrato."],
    ["QUINTA. IVA.", "La suma a la que se refiere la clausula anterior sera pagada mas el importe correspondiente al Impuesto al Valor Agregado."],
    ["SEXTA. Momento de pago.", "El pago al que se refiere la clausula cuarta sera realizado de conformidad con lo establecido en la caratula del presente contrato."],
    ["SEPTIMA. Intereses.", "En el caso de que el Cliente incurra en mora por sesenta dias naturales o mas con respecto a cualquier pago a su cargo, debera cubrir a favor de Rusconi Consulting la suma correspondiente al 2% (dos por ciento) mensual sobre los saldos no pagados. En caso de que el Cliente incurra en mora de sesenta dias, los intereses se calcularan retroactivamente desde el primer mes de mora. Asimismo, los intereses se calcularan por periodos mensuales adelantados contados a partir del primer dia en que se configure la mora."],
    ["OCTAVA. Lugar de pago.", "Todas las obligaciones pecuniarias derivadas de este contrato seran pagadas en la cuenta bancaria de Rusconi Consulting, misma que se senalo en la caratula del presente contrato."],
    ["NOVENA. Suspension de los servicios.", "El Cliente acepta que, en caso de que no se paguen los honorarios de acuerdo con lo pactado en este contrato, Rusconi Consulting podra suspender sus servicios sin que sea responsable de los danos y perjuicios procesales causados al cliente por la omision del despacho en la presentacion de escritos, cumplimiento de plazos procesales, asistencia a audiencias, ofrecimiento de pruebas o ejercicio de medios de defensa, entre otras omisiones que se produzcan despues de que el Cliente haya incurrido en mora."],
    ["DECIMA. Obligacion de pago en primer lugar a Rusconi Consulting.", "En caso de que parte o la totalidad de los honorarios deban serle pagados a Rusconi Consulting al momento en el que el Cliente reciba alguna cantidad de dinero, conforme a la caratula de este contrato, el Cliente se obliga a no disponer de ninguna porcion de dicha suma de dinero, bajo ninguna circunstancia o concepto, sin haber previamente pagado el 100% de los honorarios que se le adeuden a Rusconi Consulting."],
    ["", "En virtud de lo anterior, mientras el pago no haya sido realizado a Rusconi Consulting, el Cliente se considerara depositario de la suma que hubiere recibido como resultado del trabajo realizado por Rusconi Consulting, por lo que el Cliente se obliga a no disponer de manera alguna de ninguna porcion de dicha suma, sin haber realizado el pago de los honorarios pactados."],
    ["", "Por lo anterior, la contravencion a esta clausula sera entendida como disposicion ilegitima de cosa propia, lo que constituira el delito de abuso de confianza."],
    ["DECIMA PRIMERA. Comienzo de la vigencia.", "La vigencia del presente contrato surtira efectos a partir de las fechas senaladas en la caratula del presente contrato."],
    ["DECIMA SEGUNDA. Confidencialidad.", "Rusconi Consulting se obliga a tratar de manera estrictamente confidencial toda la informacion y documentos que el Cliente le haga llegar con motivo de este contrato (tales como firmas electronicas, estados de cuenta, escrituras, contratos, informacion de clientes y proveedores, propiedad intelectual u otros documentos o informacion analogos), sin poder revelar dicha informacion a ningun tercero, excepto tratandose de los colaboradores de Rusconi Consulting."],
    ["DECIMA TERCERA. Aviso de privacidad.", "Rusconi Legal and Tax Technology S.A. de C.V., con domicilio en Yacatas numero 215, colonia Narvarte Poniente, alcaldia Benito Juarez, codigo postal 03020, en la Ciudad de Mexico, es responsable de recabar sus datos personales, asi como del uso que se le de a los mismos y de su proteccion."],
    ["", "Su informacion personal sera utilizada para proveer los servicios juridicos, fiscales, contables y administrativos que usted haya solicitado, informarle sobre cambios en los mismos y evaluar la calidad del servicio que le brindamos. Para las finalidades antes mencionadas, requerimos obtener los siguientes datos personales: nombre, direccion, numeros telefonicos, correo electronico, mismos que son considerados como sensibles segun la Ley Federal de Proteccion de Datos Personales en Posesion de los Particulares. Los datos personales que nos sean proporcionados solo seran hechos del conocimiento de terceros cuando la naturaleza de los servicios juridicos contratados asi lo exija."],
    ["", "Asimismo, se le informa que todos los documentos que nos sean proporcionados, aun los originales, seran resguardados por Rusconi Legal and Tax Technology S.A. de C.V. unicamente por un periodo de cinco anos, tras lo cual seran destruidos sin responsabilidad para nosotros. Por ello, en caso de requerir cualquier documento que nos haya sido proporcionado, usted nos lo debera solicitar, por escrito, antes de que fenezca el termino de cinco anos posterior al momento en el que nos haya sido entregado."],
    ["", "Para tal efecto, es necesario que nos indique por escrito su deseo de acceder, rectificar o cancelar sus datos personales, asi como de oponerse al tratamiento de los mismos o revocar el consentimiento que para tal fin nos haya otorgado. Dicho escrito puede ser presentado en el domicilio arriba indicado."],
    ["", "Cualquier modificacion a este aviso de privacidad podra ser consultada en www.rusconi.law/privacidad."],
    ["DECIMA CUARTA. Pacto comisorio expreso.", "En caso de incumplimiento, la parte afectada podra dar por rescindido el presente contrato sin necesidad de declaracion judicial."],
    ["DECIMA QUINTA. Notificaciones.", "Las notificaciones hechas entre las partes de conformidad con este contrato deberan ser realizadas por escrito. Asimismo, para efectos del presente contrato, cualquier notificacion efectuada entre las partes podra ser realizada, indistintamente, en cualquiera de los siguientes lugares:"],
    ["", "En cualquier lugar, siempre que la notificacion respectiva se entienda directamente con la persona a ser notificada;"],
    ["", "En cualquiera de los domicilios senalados en las declaraciones de este contrato, aunque la notificacion no se realice directamente con la persona a ser notificada; o"],
    ["", "A traves de los correos electronicos senalados en este contrato."],
    ["DECIMA SEXTA. Titulos de las declaraciones y clausulas.", "Los titulos de las declaraciones y clausulas de este instrumento tienen la unica intencion de facilitar su lectura, y en ninguna forma deberan limitar o ampliar el contenido de las declaraciones o clausulas que encabezan."],
    ["DECIMA SEPTIMA. Independencia de las clausulas.", "En caso de que alguna clausula del presente instrumento sea declarada invalida por la autoridad competente, el resto del clausulado contenido en el mismo seguira siendo valido, sin ser afectado por la resolucion respectiva en forma alguna."],
    ["DECIMA OCTAVA. Anexos.", "Los anexos de este contrato, para ser legalmente exigibles entre las partes, deben estar firmados por las mismas partes que suscriben este instrumento, salvo en el caso de que dichos anexos sean documentos publicos."],
    ["DECIMA NOVENA. Jurisdiccion.", "Para la solucion de cualquier controversia derivada de este contrato, asi como para su interpretacion, las partes se someten a la jurisdiccion de los tribunales del fuero comun de la Ciudad de Mexico, asi como a las leyes aplicables en dicha ciudad renunciando a cualquier otro fuero que pudiere corresponderles por causa presente o futura."],
    ["VIGESIMA. Acuerdo unico.", "El presente contrato constituye la unica fuente de obligaciones entre las partes respecto al objeto al que se refiere la clausula primera. Ningun acuerdo previo oral o escrito podra modificar el alcance e interpretacion del contenido de este instrumento."]
  ] as const,
  closing:
    "Leido lo anterior, lo firman las partes estando en la Ciudad de Mexico."
};

export const professionalServicesContractFieldValuesSchema = z.object({
  language: z.enum(["ES", "EN"]).default("ES"),
  clientKind: z.enum(["PERSONA_FISICA", "PERSONA_MORAL"]).default("PERSONA_MORAL"),
  clientRfc: z.string().max(30).default(""),
  legalRepresentative: z.string().max(250).default(""),
  clientAddress: z.string().max(1200).default(""),
  clientPhone: z.string().max(80).default(""),
  clientEmail: z.string().max(250).default(""),
  startDate: z.string().max(30).default(""),
  endDate: z.string().max(30).default(""),
  signingDate: z.string().max(30).default("")
});

type GeneratedContractFile = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

type GeneratedContractFiles = {
  docx: GeneratedContractFile;
  pdf?: GeneratedContractFile | null;
};

type ContractRenderInput = {
  coverContractNumber: string;
  clientName: string;
  title: string;
  fields: ProfessionalServicesContractFieldValues;
  serviceLines: ProfessionalServicesContractServiceLine[];
  paymentMilestones: InternalContractPaymentMilestone[];
  totalMxn: number;
};

const noBorder = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF"
};

function normalizeText(value?: string | null) {
  return (value ?? "").trim();
}

function getProfessionalServicesTemplateUrls(language: ProfessionalServicesContractFieldValues["language"]) {
  const filename = PSP_CONTRACT_TEMPLATE_FILES[language];

  return [
    new URL(`../../../templates/${filename}`, import.meta.url),
    new URL(`../../templates/${filename}`, import.meta.url)
  ];
}

async function readProfessionalServicesTemplate(language: ProfessionalServicesContractFieldValues["language"]) {
  const failures: string[] = [];

  for (const templateUrl of getProfessionalServicesTemplateUrls(language)) {
    try {
      return await readFile(templateUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${templateUrl.pathname}: ${message}`);
    }
  }

  throw new Error(`No se pudo cargar la plantilla PSP ${language}. Rutas intentadas: ${failures.join(" | ")}`);
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateKey(value?: string | null) {
  const normalized = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatLongDate(value?: string | null, fallback = "__ de ______ de 20__") {
  const parsed = parseDateKey(value);
  if (!parsed) {
    return normalizeText(value) || fallback;
  }

  return parsed.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatContractDate(
  value: string | null | undefined,
  language: ProfessionalServicesContractFieldValues["language"],
  fallback?: string
) {
  const parsed = parseDateKey(value);
  const emptyFallback = fallback ?? (language === "EN" ? "________ __, 20__" : "__ de ______ de 20__");

  if (!parsed) {
    return normalizeText(value) || emptyFallback;
  }

  return parsed.toLocaleDateString(language === "EN" ? "en-US" : "es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function parseNumberish(value?: string | null) {
  const normalized = normalizeText(value).replace(/[$,\s]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatAmountCell(value: string, mode?: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "-";
  }

  if (mode === "VARIABLE") {
    return normalized;
  }

  const parsed = parseNumberish(normalized);
  return parsed === null ? normalized : formatCurrency(parsed);
}

function textOrFallback(value?: string | null, fallback = "No Aplica") {
  return normalizeText(value) || fallback;
}

function sanitizeDownloadFilenameSegment(value: string, fallback: string) {
  return (normalizeText(value) || fallback)
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .slice(0, 90)
    .trim() || fallback;
}

function buildProfessionalServicesContractFilename(input: ContractRenderInput, extension: "docx" | "pdf") {
  const contractNumber = sanitizeDownloadFilenameSegment(input.coverContractNumber, "Sin numero");
  const clientName = sanitizeDownloadFilenameSegment(input.clientName, "Cliente");
  const title = sanitizeDownloadFilenameSegment(input.title, "Sin titulo");

  return `Contrato (${contractNumber}) (${clientName}) (${title}).${extension}`;
}

function normalizeFieldValues(fields: ProfessionalServicesContractFieldValues): ProfessionalServicesContractFieldValues {
  return {
    language: fields.language === "EN" ? "EN" : "ES",
    clientKind: fields.clientKind,
    clientRfc: normalizeText(fields.clientRfc),
    legalRepresentative: normalizeText(fields.legalRepresentative),
    clientAddress: normalizeText(fields.clientAddress),
    clientPhone: normalizeText(fields.clientPhone),
    clientEmail: normalizeText(fields.clientEmail),
    startDate: normalizeText(fields.startDate),
    endDate: normalizeText(fields.endDate),
    signingDate: normalizeText(fields.signingDate)
  };
}

function guessClientKind(clientName: string): ProfessionalServicesContractFieldValues["clientKind"] {
  const normalized = normalizeText(clientName).toUpperCase();
  if (
    normalized.includes("S.A.")
    || normalized.includes("SA DE CV")
    || normalized.includes("S DE RL")
    || normalized.includes("S.C.")
    || normalized.includes("SC")
    || normalized.includes("LLC")
    || normalized.includes("INC")
    || normalized.includes("CORP")
    || normalized.includes("CONSULTING")
  ) {
    return "PERSONA_MORAL";
  }

  return "PERSONA_FISICA";
}

function buildDefaultFieldValues(quote: Quote): ProfessionalServicesContractFieldValues {
  return {
    language: "ES",
    clientKind: guessClientKind(quote.clientName),
    clientRfc: "",
    legalRepresentative: "",
    clientAddress: "",
    clientPhone: "",
    clientEmail: "",
    startDate: normalizeText(quote.quoteDate).slice(0, 10) || currentDateKey(),
    endDate: "",
    signingDate: currentDateKey()
  };
}

function buildLegacyServiceLines(quote: Quote): ProfessionalServicesContractServiceLine[] {
  return quote.lineItems.map((item, index) => ({
    id: `line-item-${index + 1}`,
    service: normalizeText(item.concept) || `Servicio ${index + 1}`,
    fees: formatCurrency(item.amountMxn),
    observations: "-",
    paymentMoment: ""
  }));
}

function buildServiceLinesFromQuote(quote: Quote): ProfessionalServicesContractServiceLine[] {
  if (!quote.amountColumns?.length || !quote.tableRows?.length) {
    return buildLegacyServiceLines(quote);
  }

  const enabledColumns = quote.amountColumns
    .map((column, index) => ({ column, index }))
    .filter(({ column }) => column.enabled);

  const lines = quote.tableRows.map((row, rowIndex) => {
    const fees = enabledColumns
      .map(({ column, index }) => {
        const cell = row.amountCells[index];
        if (!cell || cell.hidden || !normalizeText(cell.value)) {
          return null;
        }

        const formatted = formatAmountCell(String(cell.value ?? ""), column.mode);
        return enabledColumns.length > 1 ? `${normalizeText(column.title) || `Monto ${index + 1}`}: ${formatted}` : formatted;
      })
      .filter((entry): entry is string => Boolean(entry))
      .join(" / ");

    const observations = [
      normalizeText(row.notesCell?.value),
      row.excludeFromIva ? `Importe sin IVA (${Math.round(IVA_RATE * 100)}%).` : ""
    ].filter(Boolean).join(" ");

    return {
      id: row.id || `service-line-${rowIndex + 1}`,
      service: normalizeText(row.conceptDescription) || `Servicio ${rowIndex + 1}`,
      fees: fees || "-",
      observations: observations || "-",
      paymentMoment: row.paymentMoment?.hidden ? "" : normalizeText(row.paymentMoment?.value)
    } satisfies ProfessionalServicesContractServiceLine;
  });

  return lines.length > 0 ? lines : buildLegacyServiceLines(quote);
}

function buildPaymentMilestones(matter: Matter, quote: Quote, serviceLines: ProfessionalServicesContractServiceLine[]) {
  const rawMilestones = serviceLines
    .map((line) => normalizeText(line.paymentMoment))
    .filter(Boolean);

  if (rawMilestones.length === 0 && normalizeText(quote.milestone)) {
    rawMilestones.push(normalizeText(quote.milestone));
  }

  if (rawMilestones.length === 0 && normalizeText(matter.nextPaymentDate)) {
    rawMilestones.push(formatLongDate(matter.nextPaymentDate, normalizeText(matter.nextPaymentDate)));
  }

  const seen = new Set<string>();

  return rawMilestones
    .filter((label) => {
      const comparable = label.toLowerCase();
      if (seen.has(comparable)) {
        return false;
      }

      seen.add(comparable);
      return true;
    })
    .map((label, index) => ({
      id: `psp-milestone-${index + 1}`,
      label,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(label) ? label : undefined
    } satisfies InternalContractPaymentMilestone));
}

export function buildProfessionalServicesContractPrefill(
  matter: Matter,
  quote: Quote,
  existing?: {
    contractId: string;
    signatureStatus: ProfessionalServicesContractPrefillResult["signatureStatus"];
    availableFormats: ProfessionalServicesContractPrefillResult["availableFormats"];
    fields: ProfessionalServicesContractFieldValues;
  } | null
): ProfessionalServicesContractPrefillResult {
  const serviceLines = buildServiceLinesFromQuote(quote);
  const paymentMilestones = buildPaymentMilestones(matter, quote, serviceLines);
  const defaults = buildDefaultFieldValues(quote);
  const fields = existing
    ? {
        ...defaults,
        ...normalizeFieldValues(existing.fields)
      }
    : defaults;

  return {
    contractId: existing?.contractId,
    matterId: matter.id,
    contractNumber: quote.quoteNumber,
    clientNumber: matter.clientNumber,
    clientName: matter.clientName,
    quoteId: matter.quoteId,
    quoteNumber: matter.quoteNumber,
    subject: matter.subject,
    title: quote.title || `${matter.clientName} (${quote.quoteNumber}) (${matter.subject})`,
    signatureStatus: existing?.signatureStatus ?? "PENDING",
    availableFormats: existing?.availableFormats ?? [],
    fields,
    serviceLines,
    paymentMilestones,
    totalMxn: Number.isFinite(quote.totalMxn) ? quote.totalMxn : 0
  };
}

function createParagraph(
  text: string,
  options: {
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    size?: number;
    spacingAfter?: number;
    spacingBefore?: number;
  } = {}
) {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.BOTH,
    spacing: {
      after: options.spacingAfter ?? 120,
      before: options.spacingBefore ?? 0,
      line: 280
    },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        size: options.size ?? 21,
        font: "Times New Roman"
      })
    ]
  });
}

function createDocxCell(text: string, widthPercent: number, bold = false) {
  return new TableCell({
    width: {
      size: widthPercent,
      type: WidthType.PERCENTAGE
    },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder
    },
    children: [
      createParagraph(text, {
        bold,
        spacingAfter: 0,
        size: bold ? 20 : 19
      })
    ]
  });
}

function createDocxSectionTitle(title: string) {
  return createParagraph(title, {
    bold: true,
    size: 23,
    spacingBefore: 180,
    spacingAfter: 80
  });
}

function createKeyValueTable(rows: Array<[string, string]>, leftWidthPercent = 34) {
  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder
    },
    rows: rows.map(
      ([label, value]) =>
        new TableRow({
          children: [
            createDocxCell(`${label}:`, leftWidthPercent, true),
            createDocxCell(value, 100 - leftWidthPercent)
          ]
        })
    )
  });
}

function createServicesTable(lines: ProfessionalServicesContractServiceLine[]) {
  const headerCell = (text: string, widthPercent: number) =>
    new TableCell({
      width: {
        size: widthPercent,
        type: WidthType.PERCENTAGE
      },
      children: [
        createParagraph(text, {
          bold: true,
          align: AlignmentType.CENTER,
          spacingAfter: 0,
          size: 20
        })
      ]
    });

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          headerCell("Servicios", 42),
          headerCell("Honorarios", 26),
          headerCell("Observaciones", 32)
        ]
      }),
      ...lines.map(
        (line) =>
          new TableRow({
            children: [
              new TableCell({ width: { size: 42, type: WidthType.PERCENTAGE }, children: [createParagraph(line.service, { size: 19, spacingAfter: 0 })] }),
              new TableCell({ width: { size: 26, type: WidthType.PERCENTAGE }, children: [createParagraph(line.fees, { size: 19, spacingAfter: 0 })] }),
              new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, children: [createParagraph(line.observations, { size: 19, spacingAfter: 0 })] })
            ]
          })
      )
    ]
  });
}

function createSignatureTable(clientName: string, fields: ProfessionalServicesContractFieldValues) {
  const signerName = fields.clientKind === "PERSONA_MORAL"
    ? textOrFallback(fields.legalRepresentative, clientName)
    : clientName;
  const signerTitle = fields.clientKind === "PERSONA_MORAL"
    ? `Representante legal de ${clientName}`
    : "Cliente";

  const signatureCell = (lines: string[]) =>
    new TableCell({
      width: {
        size: 50,
        type: WidthType.PERCENTAGE
      },
      borders: {
        top: noBorder,
        bottom: noBorder,
        left: noBorder,
        right: noBorder
      },
      children: lines.map((line, index) =>
        createParagraph(line, {
          align: AlignmentType.CENTER,
          bold: index === 1,
          spacingAfter: index === lines.length - 1 ? 0 : 60
        })
      )
    });

  return new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE
    },
    borders: {
      top: noBorder,
      bottom: noBorder,
      left: noBorder,
      right: noBorder,
      insideHorizontal: noBorder,
      insideVertical: noBorder
    },
    rows: [
      new TableRow({
        children: [
          signatureCell([
            "__________________________________",
            RC_REPRESENTATIVE.toUpperCase(),
            "Apoderado legal de Rusconi Consulting"
          ]),
          signatureCell([
            "__________________________________",
            signerName.toUpperCase(),
            signerTitle
          ])
        ]
      })
    ]
  });
}

type XmlMatch = {
  value: string;
  index: number;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function collectXmlMatches(xml: string, pattern: RegExp): XmlMatch[] {
  return Array.from(xml.matchAll(pattern)).map((match) => ({
    value: match[0],
    index: match.index ?? 0
  }));
}

function createTemplateParagraphXml(
  text: string,
  options: {
    align?: "center" | "left" | "right";
    bold?: boolean;
  } = {}
) {
  const paragraphProperties = options.align
    ? `<w:pPr><w:jc w:val="${options.align}"/></w:pPr>`
    : "";
  const runProperties = [
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>',
    options.bold ? "<w:b/>" : "",
    '<w:sz w:val="24"/>',
    '<w:szCs w:val="24"/>'
  ].filter(Boolean).join("");

  return `<w:p>${paragraphProperties}<w:r><w:rPr>${runProperties}</w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function replaceTemplateCellContent(
  cellXml: string,
  lines: string | string[],
  options: {
    align?: "center" | "left" | "right";
    bold?: boolean;
  } = {}
) {
  const cellProperties = cellXml.match(/<w:tcPr\b[\s\S]*?<\/w:tcPr>/)?.[0] ?? "";
  const paragraphs = (Array.isArray(lines) ? lines : [lines])
    .map((line) => createTemplateParagraphXml(line, options))
    .join("");

  return `<w:tc>${cellProperties}${paragraphs}</w:tc>`;
}

function replaceTemplateRowCell(
  rowXml: string,
  cellIndex: number,
  lines: string | string[],
  options: {
    align?: "center" | "left" | "right";
    bold?: boolean;
  } = {}
) {
  let index = 0;

  return rowXml.replace(/<w:tc\b[\s\S]*?<\/w:tc>/g, (cellXml) => {
    if (index === cellIndex) {
      index += 1;
      return replaceTemplateCellContent(cellXml, lines, options);
    }

    index += 1;
    return cellXml;
  });
}

function replaceTemplateTableRowCell(
  tableXml: string,
  rowIndex: number,
  cellIndex: number,
  lines: string | string[],
  options: {
    align?: "center" | "left" | "right";
    bold?: boolean;
  } = {}
) {
  let index = 0;

  return tableXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, (rowXml) => {
    if (index === rowIndex) {
      index += 1;
      return replaceTemplateRowCell(rowXml, cellIndex, lines, options);
    }

    index += 1;
    return rowXml;
  });
}

function replaceTemplateTable(
  documentXml: string,
  tableIndex: number,
  transform: (tableXml: string) => string
) {
  let index = 0;

  return documentXml.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    if (index === tableIndex) {
      index += 1;
      return transform(tableXml);
    }

    index += 1;
    return tableXml;
  });
}

function replaceTemplateRows(
  tableXml: string,
  startRowIndex: number,
  deleteCount: number,
  newRows: string[]
) {
  const rows = collectXmlMatches(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/g);
  const first = rows[startRowIndex];
  const last = rows[startRowIndex + deleteCount - 1];

  if (!first || !last) {
    return tableXml;
  }

  return [
    tableXml.slice(0, first.index),
    newRows.join(""),
    tableXml.slice(last.index + last.value.length)
  ].join("");
}

function buildTemplateServicesTable(
  tableXml: string,
  lines: ProfessionalServicesContractServiceLine[],
  totalMxn: number
) {
  const rows = collectXmlMatches(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/g);
  const serviceRowTemplate = rows[1]?.value;
  const totalRowTemplate = rows[2]?.value;

  if (!serviceRowTemplate || !totalRowTemplate) {
    return tableXml;
  }

  const normalizedLines = lines.length > 0
    ? lines
    : [{ id: "psp-empty", service: "N/A", fees: "-", observations: "-", paymentMoment: "" }];

  const serviceRows = normalizedLines.map((line) => {
    return [
      [0, line.service],
      [1, line.fees],
      [2, line.observations]
    ].reduce(
      (rowXml, [cellIndex, value]) => replaceTemplateRowCell(rowXml, Number(cellIndex), String(value || "-")),
      serviceRowTemplate
    );
  });

  const totalRow = replaceTemplateRowCell(
    replaceTemplateRowCell(totalRowTemplate, 0, "TOTAL:", { bold: true }),
    1,
    `${formatCurrency(totalMxn)} M.N.`,
    { align: "center", bold: true }
  );

  return replaceTemplateRows(tableXml, 1, 2, [...serviceRows, totalRow]);
}

function fillSpanishProfessionalServicesTemplateXml(documentXml: string, input: ContractRenderInput) {
  const fields = normalizeFieldValues(input.fields);
  const signerName = fields.clientKind === "PERSONA_MORAL"
    ? textOrFallback(fields.legalRepresentative, input.clientName)
    : input.clientName;
  const signerTitle = fields.clientKind === "PERSONA_MORAL"
    ? `Representante legal de ${input.clientName}`
    : "Cliente";
  const paymentMomentLines = input.paymentMilestones.length > 0
    ? input.paymentMilestones.map((milestone) => `- ${milestone.label}`)
    : ["- Sin momento de pago especificado en la cotizacion."];

  let nextXml = documentXml;

  nextXml = replaceTemplateTable(nextXml, 0, (tableXml) =>
    replaceTemplateTableRowCell(tableXml, 0, 1, input.coverContractNumber, { align: "center" })
  );

  nextXml = replaceTemplateTable(nextXml, 1, (tableXml) => {
    const moralRows = [
      fields.clientKind === "PERSONA_MORAL" ? input.clientName : "No Aplica",
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientRfc) : "No Aplica",
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.legalRepresentative) : "No Aplica",
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientAddress) : "No Aplica",
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientPhone) : "No Aplica",
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientEmail) : "No Aplica"
    ];

    return moralRows.reduce(
      (currentXml, value, index) => replaceTemplateTableRowCell(currentXml, index + 1, 1, value),
      tableXml
    );
  });

  nextXml = replaceTemplateTable(nextXml, 2, (tableXml) => {
    const physicalRows = [
      fields.clientKind === "PERSONA_FISICA" ? input.clientName : "No Aplica",
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientRfc) : "No Aplica",
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientAddress) : "No Aplica",
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientPhone) : "No Aplica",
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientEmail) : "No Aplica"
    ];

    return physicalRows.reduce(
      (currentXml, value, index) => replaceTemplateTableRowCell(currentXml, index + 1, 1, value),
      tableXml
    );
  });

  nextXml = replaceTemplateTable(nextXml, 3, (tableXml) =>
    buildTemplateServicesTable(tableXml, input.serviceLines, input.totalMxn)
  );

  nextXml = replaceTemplateTable(nextXml, 4, (tableXml) =>
    replaceTemplateTableRowCell(tableXml, 1, 0, paymentMomentLines)
  );

  nextXml = replaceTemplateTable(nextXml, 6, (tableXml) => {
    const dateRows = [
      formatLongDate(fields.startDate),
      normalizeText(fields.endDate) ? formatLongDate(fields.endDate) : "Indeterminada",
      formatLongDate(fields.signingDate)
    ];

    return dateRows.reduce(
      (currentXml, value, index) => replaceTemplateTableRowCell(currentXml, index + 1, 1, value),
      tableXml
    );
  });

  nextXml = replaceTemplateTable(nextXml, 7, (tableXml) =>
    replaceTemplateTableRowCell(tableXml, 0, 1, [
      "____________________________________",
      signerName.toUpperCase(),
      signerTitle
    ], { align: "center" })
  );

  return nextXml;
}

function fillEnglishProfessionalServicesTemplateXml(documentXml: string, input: ContractRenderInput) {
  const fields = normalizeFieldValues(input.fields);
  const doesNotApply = "Does not apply";
  const signerName = fields.clientKind === "PERSONA_MORAL"
    ? textOrFallback(fields.legalRepresentative, input.clientName)
    : input.clientName;
  const signerTitle = fields.clientKind === "PERSONA_MORAL"
    ? `Legal representative of ${input.clientName}`
    : "Client";
  const paymentMomentLines = input.paymentMilestones.length > 0
    ? input.paymentMilestones.map((milestone) => `- ${milestone.label}`)
    : ["- No payment time specified in the quotation."];

  let nextXml = documentXml;

  nextXml = replaceTemplateTable(nextXml, 0, (tableXml) =>
    replaceTemplateTableRowCell(tableXml, 0, 1, input.coverContractNumber, { align: "center" })
  );

  nextXml = replaceTemplateTable(nextXml, 1, (tableXml) => {
    const legalPersonRows = [
      fields.clientKind === "PERSONA_MORAL" ? input.clientName : doesNotApply,
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientAddress, doesNotApply) : doesNotApply,
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientRfc, doesNotApply) : doesNotApply,
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.legalRepresentative, doesNotApply) : doesNotApply,
      doesNotApply,
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientPhone, doesNotApply) : doesNotApply,
      fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientEmail, doesNotApply) : doesNotApply
    ];

    return legalPersonRows.reduce(
      (currentXml, value, index) => replaceTemplateTableRowCell(currentXml, index + 1, 1, value),
      tableXml
    );
  });

  nextXml = replaceTemplateTable(nextXml, 2, (tableXml) => {
    const naturalPersonRows = [
      fields.clientKind === "PERSONA_FISICA" ? input.clientName : doesNotApply,
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientAddress, doesNotApply) : doesNotApply,
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientRfc, doesNotApply) : doesNotApply,
      doesNotApply,
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientPhone, doesNotApply) : doesNotApply,
      fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientEmail, doesNotApply) : doesNotApply
    ];

    return naturalPersonRows.reduce(
      (currentXml, value, index) => replaceTemplateTableRowCell(currentXml, index + 1, 1, value),
      tableXml
    );
  });

  nextXml = replaceTemplateTable(nextXml, 3, (tableXml) =>
    buildTemplateServicesTable(tableXml, input.serviceLines, input.totalMxn)
  );

  nextXml = replaceTemplateTable(nextXml, 4, (tableXml) =>
    replaceTemplateTableRowCell(tableXml, 1, 0, paymentMomentLines)
  );

  nextXml = replaceTemplateTable(nextXml, 6, (tableXml) => {
    const dateRows = [
      formatContractDate(fields.startDate, "EN"),
      normalizeText(fields.endDate) ? formatContractDate(fields.endDate, "EN") : "Indeterminate",
      formatContractDate(fields.signingDate, "EN")
    ];

    return dateRows.reduce(
      (currentXml, value, index) => replaceTemplateTableRowCell(currentXml, index + 1, 1, value),
      tableXml
    );
  });

  nextXml = replaceTemplateTable(nextXml, 7, (tableXml) =>
    replaceTemplateTableRowCell(tableXml, 0, 1, [
      "____________________________________",
      signerName.toUpperCase(),
      signerTitle
    ], { align: "center" })
  );

  return nextXml;
}

function fillProfessionalServicesTemplateXml(documentXml: string, input: ContractRenderInput) {
  const fields = normalizeFieldValues(input.fields);

  return fields.language === "EN"
    ? fillEnglishProfessionalServicesTemplateXml(documentXml, input)
    : fillSpanishProfessionalServicesTemplateXml(documentXml, input);
}

async function renderProfessionalServicesContractTemplateDocx(input: ContractRenderInput) {
  const fields = normalizeFieldValues(input.fields);
  const template = await readProfessionalServicesTemplate(fields.language);
  const zip = await JSZip.loadAsync(template);
  const documentFile = zip.file("word/document.xml");

  if (!documentFile) {
    throw new Error("La plantilla de contrato PSP no contiene word/document.xml.");
  }

  const documentXml = await documentFile.async("string");
  zip.file("word/document.xml", fillProfessionalServicesTemplateXml(documentXml, input));
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE"
  });
  return {
    buffer: Buffer.from(buffer),
    filename: buildProfessionalServicesContractFilename(input, "docx"),
    contentType: DOCX_MIME_TYPE
  };
}

async function renderLegacyProfessionalServicesContractDocx(input: ContractRenderInput) {
  const fields = normalizeFieldValues(input.fields);
  const startDate = formatLongDate(fields.startDate);
  const endDate = normalizeText(fields.endDate) ? formatLongDate(fields.endDate) : "Indeterminada";
  const signingDate = formatLongDate(fields.signingDate);
  const moralRows: Array<[string, string]> = [
    ["Nombre del cliente", fields.clientKind === "PERSONA_MORAL" ? input.clientName : "No Aplica"],
    ["Registro Federal de Contribuyentes", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientRfc) : "No Aplica"],
    ["Representante legal", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.legalRepresentative) : "No Aplica"],
    ["Domicilio", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientAddress) : "No Aplica"],
    ["Telefono", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientPhone) : "No Aplica"],
    ["Correo electronico", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientEmail) : "No Aplica"]
  ];
  const physicalRows: Array<[string, string]> = [
    ["Nombre del cliente", fields.clientKind === "PERSONA_FISICA" ? input.clientName : "No Aplica"],
    ["Registro Federal de Contribuyentes", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientRfc) : "No Aplica"],
    ["Domicilio", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientAddress) : "No Aplica"],
    ["Telefono", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientPhone) : "No Aplica"],
    ["Correo electronico", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientEmail) : "No Aplica"]
  ];
  const coverChildren = [
    createParagraph("CARATULA DEL CONTRATO DE PRESTACION DE SERVICIOS", {
      align: AlignmentType.CENTER,
      bold: true,
      size: 24,
      spacingAfter: 220
    }),
    createKeyValueTable([["Numero de contrato", input.coverContractNumber]], 34),
    createDocxSectionTitle("Datos del Cliente, en caso de ser persona moral"),
    createKeyValueTable(moralRows),
    createDocxSectionTitle("Datos de contacto del Cliente, en caso de ser persona fisica"),
    createKeyValueTable(physicalRows),
    createDocxSectionTitle("Datos de Rusconi Legal and Tax Technology S.A. de C.V. ('Rusconi Consulting')"),
    createKeyValueTable([
      ["Denominacion social", RC_COMPANY_NAME],
      ["Nombre del representante legal", RC_REPRESENTATIVE],
      ["Registro Federal de Contribuyentes", RC_RFC],
      ["Domicilio", RC_ADDRESS]
    ]),
    createDocxSectionTitle("Servicios, honorarios y observaciones"),
    createServicesTable(input.serviceLines.length > 0 ? input.serviceLines : [{
      id: "psp-empty",
      service: "N/A",
      fees: "-",
      observations: "-",
      paymentMoment: ""
    }]),
    createParagraph(`TOTAL: ${formatCurrency(input.totalMxn)} M.N.`, {
      bold: true,
      spacingBefore: 140,
      spacingAfter: 80
    }),
    createParagraph("Momento de pago:", {
      bold: true,
      spacingAfter: 40
    }),
    ...(input.paymentMilestones.length > 0
      ? input.paymentMilestones.map((milestone) => createParagraph(`- ${milestone.label}`, { size: 19, spacingAfter: 40 }))
      : [createParagraph("- Sin momento de pago especificado en la cotizacion.", { size: 19, spacingAfter: 40 })]),
    createDocxSectionTitle("Cuenta bancaria de RC"),
    createKeyValueTable(RC_BANK_ACCOUNT.map(([label, value]) => [label, value])),
    createDocxSectionTitle("Vigencia"),
    createKeyValueTable([
      ["Fecha de Inicio", startDate],
      ["Fecha de Terminacion", endDate],
      ["Fecha de firma del contrato", signingDate]
    ])
  ];

  const bodyChildren: Array<Paragraph | Table> = [
    createParagraph(BODY_COPY.intro, {
      align: AlignmentType.CENTER,
      bold: true,
      size: 22,
      spacingBefore: 0,
      spacingAfter: 240
    }),
    createParagraph("I. DECLARACIONES", {
      align: AlignmentType.CENTER,
      bold: true,
      size: 22,
      spacingAfter: 160
    }),
    createParagraph(BODY_COPY.declarations),
    createParagraph(BODY_COPY.declarationBridge),
    createParagraph("II. CLAUSULAS", {
      align: AlignmentType.CENTER,
      bold: true,
      size: 22,
      spacingBefore: 220,
      spacingAfter: 160
    }),
    createParagraph("Las partes se someten a las siguientes clausulas:")
  ];

  BODY_COPY.clauses.forEach(([title, body]) => {
    bodyChildren.push(createParagraph(title ? `${title} ${body}` : body, { spacingAfter: 150 }));
  });

  bodyChildren.push(
    createParagraph(BODY_COPY.closing, {
      spacingBefore: 220,
      spacingAfter: 420
    }),
    createSignatureTable(input.clientName, fields)
  );

  const doc = new DocxDocument({
    title: `Contrato PSP - ${input.clientName}`,
    creator: "SIGE",
    description: input.title,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11)
            },
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75)
            }
          }
        },
        children: [
          ...coverChildren,
          new Paragraph({
            pageBreakBefore: true,
            children: []
          }),
          ...bodyChildren
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  return {
    buffer: Buffer.from(buffer),
    filename: buildProfessionalServicesContractFilename(input, "docx"),
    contentType: DOCX_MIME_TYPE
  };
}

async function renderProfessionalServicesContractDocx(input: ContractRenderInput) {
  try {
    return await renderProfessionalServicesContractTemplateDocx(input);
  } catch (error) {
    if (
      error instanceof Error
      && ("code" in error ? (error as Error & { code?: string }).code === "ENOENT" : false)
    ) {
      return renderLegacyProfessionalServicesContractDocx(input);
    }

    throw error;
  }
}

function drawPdfSectionTitle(doc: PDFKit.PDFDocument, text: string) {
  ensurePdfSpace(doc, 38);
  doc.moveDown(0.4);
  doc.font("Times-Bold").fontSize(12).text(text, { align: "left" });
  doc.moveDown(0.15);
}

function ensurePdfSpace(doc: PDFKit.PDFDocument, neededHeight: number) {
  if (doc.y + neededHeight <= doc.page.height - doc.page.margins.bottom) {
    return;
  }

  doc.addPage();
}

function drawPdfKeyValueRows(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
  rows.forEach(([label, value]) => {
    ensurePdfSpace(doc, 24);
    doc.font("Times-Bold").fontSize(10).text(`${label}: `, { continued: true });
    doc.font("Times-Roman").fontSize(10).text(value || "No Aplica");
  });
}

function drawPdfTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  widths: number[]
) {
  const startX = doc.x;
  const headerHeight = 22;
  ensurePdfSpace(doc, headerHeight + 24);

  const drawRow = (values: string[], isHeader = false) => {
    const rowY = doc.y;
    const heights = values.map((value, index) =>
      doc.heightOfString(value || "-", {
        width: widths[index] - 10,
        align: index === 1 ? "right" : "left"
      })
    );
    const rowHeight = Math.max(isHeader ? 12 : 14, ...heights) + 10;
    ensurePdfSpace(doc, rowHeight + 4);
    const actualY = doc.y;

    values.forEach((value, index) => {
      const cellX = startX + widths.slice(0, index).reduce((sum, item) => sum + item, 0);
      doc
        .lineWidth(0.7)
        .rect(cellX, actualY, widths[index], rowHeight)
        .stroke("#8aa0b8");
      doc
        .font(isHeader ? "Times-Bold" : "Times-Roman")
        .fontSize(isHeader ? 10 : 9.5)
        .text(value || "-", cellX + 5, actualY + 5, {
          width: widths[index] - 10,
          align: index === 1 ? "right" : "left"
        });
    });

    doc.y = actualY + rowHeight;
    return rowY;
  };

  drawRow(headers, true);
  rows.forEach((row) => drawRow(row));
}

function renderProfessionalServicesContractPdf(input: ContractRenderInput) {
  const fields = normalizeFieldValues(input.fields);
  const moralRows: Array<[string, string]> = [
    ["Nombre del cliente", fields.clientKind === "PERSONA_MORAL" ? input.clientName : "No Aplica"],
    ["Registro Federal de Contribuyentes", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientRfc) : "No Aplica"],
    ["Representante legal", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.legalRepresentative) : "No Aplica"],
    ["Domicilio", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientAddress) : "No Aplica"],
    ["Telefono", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientPhone) : "No Aplica"],
    ["Correo electronico", fields.clientKind === "PERSONA_MORAL" ? textOrFallback(fields.clientEmail) : "No Aplica"]
  ];
  const physicalRows: Array<[string, string]> = [
    ["Nombre del cliente", fields.clientKind === "PERSONA_FISICA" ? input.clientName : "No Aplica"],
    ["Registro Federal de Contribuyentes", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientRfc) : "No Aplica"],
    ["Domicilio", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientAddress) : "No Aplica"],
    ["Telefono", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientPhone) : "No Aplica"],
    ["Correo electronico", fields.clientKind === "PERSONA_FISICA" ? textOrFallback(fields.clientEmail) : "No Aplica"]
  ];
  const doc = new PDFDocument({
    size: "LETTER",
    margins: {
      top: 54,
      right: 54,
      bottom: 54,
      left: 54
    },
    info: {
      Title: `Contrato PSP - ${input.clientName}`,
      Author: "SIGE"
    }
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  doc.font("Times-Bold").fontSize(14).text("CARATULA DEL CONTRATO DE PRESTACION DE SERVICIOS", {
    align: "center"
  });
  doc.moveDown(0.8);
  drawPdfKeyValueRows(doc, [["Numero de contrato", input.coverContractNumber]]);
  drawPdfSectionTitle(doc, "Datos del Cliente, en caso de ser persona moral");
  drawPdfKeyValueRows(doc, moralRows);
  drawPdfSectionTitle(doc, "Datos de contacto del Cliente, en caso de ser persona fisica");
  drawPdfKeyValueRows(doc, physicalRows);
  drawPdfSectionTitle(doc, "Datos de Rusconi Legal and Tax Technology S.A. de C.V. ('Rusconi Consulting')");
  drawPdfKeyValueRows(doc, [
    ["Denominacion social", RC_COMPANY_NAME],
    ["Nombre del representante legal", RC_REPRESENTATIVE],
    ["Registro Federal de Contribuyentes", RC_RFC],
    ["Domicilio", RC_ADDRESS]
  ]);
  drawPdfSectionTitle(doc, "Servicios, honorarios y observaciones");
  drawPdfTable(
    doc,
    ["Servicios", "Honorarios", "Observaciones"],
    (input.serviceLines.length > 0 ? input.serviceLines : [{
      id: "psp-empty",
      service: "N/A",
      fees: "-",
      observations: "-",
      paymentMoment: ""
    }]).map((line) => [line.service, line.fees, line.observations]),
    [220, 120, 132]
  );
  ensurePdfSpace(doc, 32);
  doc.moveDown(0.35);
  doc.font("Times-Bold").fontSize(10.5).text(`TOTAL: ${formatCurrency(input.totalMxn)} M.N.`);
  doc.moveDown(0.3);
  doc.font("Times-Bold").fontSize(10.5).text("Momento de pago:");
  if (input.paymentMilestones.length > 0) {
    input.paymentMilestones.forEach((milestone) => {
      doc.font("Times-Roman").fontSize(10).text(`- ${milestone.label}`);
    });
  } else {
    doc.font("Times-Roman").fontSize(10).text("- Sin momento de pago especificado en la cotizacion.");
  }
  drawPdfSectionTitle(doc, "Cuenta bancaria de RC");
  drawPdfKeyValueRows(doc, RC_BANK_ACCOUNT.map(([label, value]) => [label, value]));
  drawPdfSectionTitle(doc, "Vigencia");
  drawPdfKeyValueRows(doc, [
    ["Fecha de Inicio", formatLongDate(fields.startDate)],
    ["Fecha de Terminacion", normalizeText(fields.endDate) ? formatLongDate(fields.endDate) : "Indeterminada"],
    ["Fecha de firma del contrato", formatLongDate(fields.signingDate)]
  ]);

  doc.addPage();
  doc.font("Times-Bold").fontSize(13).text(BODY_COPY.intro, {
    align: "center"
  });
  doc.moveDown(0.7);
  doc.font("Times-Bold").fontSize(12).text("I. DECLARACIONES", { align: "center" });
  doc.moveDown(0.3);
  doc.font("Times-Roman").fontSize(10).text(BODY_COPY.declarations, { align: "justify" });
  doc.moveDown(0.4);
  doc.text(BODY_COPY.declarationBridge, { align: "justify" });
  doc.moveDown(0.6);
  doc.font("Times-Bold").fontSize(12).text("II. CLAUSULAS", { align: "center" });
  doc.moveDown(0.3);
  doc.font("Times-Roman").fontSize(10).text("Las partes se someten a las siguientes clausulas:");
  doc.moveDown(0.25);

  BODY_COPY.clauses.forEach(([title, body]) => {
    ensurePdfSpace(doc, 56);
    if (title) {
      doc.font("Times-Bold").fontSize(10).text(`${title} `, { continued: true, align: "justify" });
      doc.font("Times-Roman").fontSize(10).text(body, { align: "justify" });
    } else {
      doc.font("Times-Roman").fontSize(10).text(body, { align: "justify" });
    }
    doc.moveDown(0.2);
  });

  ensurePdfSpace(doc, 120);
  doc.moveDown(0.6);
  doc.font("Times-Roman").fontSize(10).text(BODY_COPY.closing, { align: "justify" });
  doc.moveDown(1.2);

  const leftX = doc.x;
  const rightX = leftX + 250;
  const lineY = doc.y + 12;
  const signerName = fields.clientKind === "PERSONA_MORAL"
    ? textOrFallback(fields.legalRepresentative, input.clientName)
    : input.clientName;
  const signerTitle = fields.clientKind === "PERSONA_MORAL"
    ? `Representante legal de ${input.clientName}`
    : "Cliente";

  doc.moveTo(leftX, lineY).lineTo(leftX + 190, lineY).stroke();
  doc.moveTo(rightX, lineY).lineTo(rightX + 190, lineY).stroke();
  doc.font("Times-Bold").fontSize(10).text(RC_REPRESENTATIVE.toUpperCase(), leftX, lineY + 6, { width: 190, align: "center" });
  doc.font("Times-Roman").fontSize(9.5).text("Apoderado legal de Rusconi Consulting", leftX, lineY + 20, { width: 190, align: "center" });
  doc.font("Times-Bold").fontSize(10).text(signerName.toUpperCase(), rightX, lineY + 6, { width: 190, align: "center" });
  doc.font("Times-Roman").fontSize(9.5).text(signerTitle, rightX, lineY + 20, { width: 190, align: "center" });

  doc.end();

  return new Promise<{ buffer: Buffer; filename: string; contentType: string }>((resolve, reject) => {
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        filename: buildProfessionalServicesContractFilename(input, "pdf"),
        contentType: PDF_MIME_TYPE
      });
    });
    doc.on("error", reject);
  });
}

export async function renderProfessionalServicesContractFiles(input: ContractRenderInput): Promise<GeneratedContractFiles> {
  const docx = await renderProfessionalServicesContractDocx(input);
  return { docx, pdf: null };
}
