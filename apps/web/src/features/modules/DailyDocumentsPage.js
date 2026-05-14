import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../api/http-client";
function dateInputValue(date) {
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
const today = dateInputValue(new Date());
const rusconiLetterheadUrl = "/assets/rusconi-letterhead-2025.jpg";
const rusconiLetterheadDimensions = {
    width: 816,
    height: 1056
};
const regularPageMargins = {
    top: 1440,
    right: 1440,
    bottom: 1440,
    left: 1440
};
const letterheadPageMargins = {
    top: 1800,
    right: 1440,
    bottom: 1800,
    left: 1440,
    header: 0,
    footer: 708
};
const basePlaceDateFields = [
    { name: "place", label: "Lugar", placeholder: "Ciudad de México", defaultValue: "Ciudad de México" },
    { name: "date", label: "Fecha", type: "date" }
];
const laborPowerAttorneyFallback = "APODERADOS PENDIENTES";
const grantorTypeLabels = {
    physical: "Persona física",
    moral: "Persona moral"
};
const receiptDocumentKindLabels = {
    original: "Original/copia certificada",
    simple: "Copia simple"
};
function toErrorMessage(error) {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Ocurrio un error inesperado.";
}
function normalizeText(valueToNormalize) {
    return (valueToNormalize ?? "").trim();
}
function normalizeSearchText(valueToNormalize) {
    return normalizeText(valueToNormalize)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
function value(values, key, fallback) {
    return values[key]?.trim() || fallback;
}
function normalizePartyName(rawName, uppercase = false) {
    const normalizedName = normalizeText(rawName).replace(/\s+/g, " ");
    return uppercase ? normalizedName.toLocaleUpperCase("es-MX") : normalizedName;
}
function getGrantorType(values) {
    return values.grantorType === "moral" ? "moral" : "physical";
}
function fallbackValue(values, keys, fallback) {
    const foundValue = keys.map((key) => normalizeText(values[key])).find(Boolean);
    return foundValue || fallback;
}
function getGrantorFields(values, options) {
    const uppercase = options?.uppercase ?? false;
    const grantorType = getGrantorType(values);
    const physicalName = normalizePartyName(fallbackValue(values, ["grantorPersonName", "grantor"], "poderdante pendiente"), uppercase);
    const companyName = normalizePartyName(fallbackValue(values, ["grantorCompanyName", "employer"], "sociedad otorgante pendiente"), uppercase);
    const companyRepresentative = normalizePartyName(fallbackValue(values, ["grantorCompanyRepresentative", "grantor"], "apoderado de la sociedad pendiente"), uppercase);
    return {
        grantorType,
        physicalName,
        companyName,
        companyRepresentative,
        text: grantorType === "moral"
            ? `${companyName}, por conducto de su apoderado ${companyRepresentative}`
            : physicalName,
        signatureName: grantorType === "moral" ? companyRepresentative : physicalName,
        signatureRole: grantorType === "moral" ? "Apoderado de la sociedad otorgante" : "Otorgante"
    };
}
function splitAttorneyNames(rawAttorneys) {
    const normalizedAttorneys = normalizeText(rawAttorneys);
    if (!normalizedAttorneys) {
        return [];
    }
    return normalizedAttorneys
        .split(/\r?\n|;|,|\s+(?:e|y)\s+(?=[A-ZÁÉÍÓÚÑ])/i)
        .map((attorney) => normalizeText(attorney))
        .filter(Boolean);
}
function attorneyFormRows(rawAttorneys) {
    if (!rawAttorneys) {
        return [""];
    }
    if (/\r?\n/.test(rawAttorneys)) {
        return rawAttorneys.split(/\r?\n/);
    }
    const parsedAttorneys = splitAttorneyNames(rawAttorneys);
    return parsedAttorneys.length ? parsedAttorneys : [rawAttorneys];
}
function formatSpanishNameList(names) {
    if (names.length <= 1) {
        return names[0] ?? laborPowerAttorneyFallback;
    }
    const head = names.slice(0, -1).join(", ");
    const last = names[names.length - 1];
    const connector = /^[ií]/i.test(last) ? " e " : " y ";
    return `${head}${connector}${last}`;
}
function formatLongDate(rawDate) {
    if (!rawDate)
        return "fecha pendiente";
    const date = new Date(`${rawDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return rawDate;
    }
    return new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(date);
}
function formatPlaceDate(values) {
    return `${value(values, "place", "lugar pendiente")}, ${formatLongDate(values.date)}`;
}
function amountLabel(values) {
    const amount = Number(values.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
        return value(values, "amount", "cantidad pendiente");
    }
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2
    }).format(amount);
}
function moneyReceiptAmountLabel(values) {
    return `${amountLabel(values)} M.N.`;
}
function moneyReceiptConcept(values) {
    const concept = value(values, "concept", "concepto pendiente").replace(/[.\s]+$/g, "");
    return `${concept}.`;
}
function isReceiptDocumentKind(valueToCheck) {
    return valueToCheck === "original" || valueToCheck === "simple";
}
function receiptDocumentItems(rawDocuments) {
    const normalizedDocuments = normalizeText(rawDocuments);
    if (!normalizedDocuments) {
        return [{ description: "", kind: "original" }];
    }
    try {
        const parsedDocuments = JSON.parse(normalizedDocuments);
        if (Array.isArray(parsedDocuments)) {
            const rows = parsedDocuments.map((item) => {
                const kind = String(item.kind);
                return {
                    description: normalizeText(item.description),
                    kind: isReceiptDocumentKind(kind) ? kind : "original"
                };
            });
            return rows.length ? rows : [{ description: "", kind: "original" }];
        }
    }
    catch {
        // Existing saved receipts may still contain the old line-based textarea value.
    }
    const legacyRows = normalizedDocuments
        .split(/\r?\n/)
        .map((description) => normalizeText(description))
        .filter(Boolean)
        .map((description) => ({ description, kind: "original" }));
    return legacyRows.length ? legacyRows : [{ description: "", kind: "original" }];
}
function serializeReceiptDocumentItems(items) {
    return JSON.stringify(items.map((item) => ({
        description: normalizeText(item.description),
        kind: item.kind
    })));
}
function receiptDocumentRows(rawDocuments, minimumRows = 5) {
    const rows = receiptDocumentItems(rawDocuments).filter((item) => normalizeText(item.description));
    while (rows.length < minimumRows) {
        rows.push({ description: "", kind: "original" });
    }
    return rows;
}
function receiptCheckboxSymbol(isChecked) {
    return isChecked ? "☑" : "☐";
}
const dailyDocumentTemplates = [
    {
        id: "general-power-letter",
        title: "Carta poder general",
        shortTitle: "Poder general",
        summary: "Mandato amplio para tramites, gestiones, firma de acuses y recepcion de documentos.",
        fields: [
            ...basePlaceDateFields,
            { name: "recipient", label: "Dirigido a", placeholder: "A quien corresponda" },
            { name: "grantorType", label: "Tipo de poderdante", type: "grantor-type", defaultValue: "physical" },
            {
                name: "grantorPersonName",
                label: "Nombre de la persona física otorgante",
                placeholder: "Nombre de quien otorga",
                visibleWhen: { name: "grantorType", value: "physical" }
            },
            {
                name: "grantorCompanyName",
                label: "Nombre de la sociedad otorgante",
                placeholder: "Nombre de la sociedad",
                visibleWhen: { name: "grantorType", value: "moral" }
            },
            {
                name: "grantorCompanyRepresentative",
                label: "Apoderado de la sociedad otorgante",
                placeholder: "Nombre del apoderado de la sociedad",
                visibleWhen: { name: "grantorType", value: "moral" }
            },
            { name: "attorney", label: "Apoderado", placeholder: "Nombre de quien recibe el poder" },
            { name: "matter", label: "Asunto", placeholder: "Tramites, gestiones o actos autorizados" },
            { name: "witnessOne", label: "Testigo 1", placeholder: "Nombre del primer testigo" },
            { name: "witnessTwo", label: "Testigo 2", placeholder: "Nombre del segundo testigo" }
        ],
        build: (values) => {
            const grantor = getGrantorFields(values);
            return {
                title: "Carta poder general",
                subtitle: formatPlaceDate(values),
                subtitleAlignment: "right",
                paragraphs: [
                    value(values, "recipient", "A quien corresponda"),
                    `Por medio de la presente, ${grantor.text} otorga poder general, amplio y suficiente a ${value(values, "attorney", "apoderado pendiente")} para que en su nombre y representacion realice los actos y gestiones relacionados con ${value(values, "matter", "asunto pendiente")}.`,
                    "La presente carta poder se firma para los efectos legales y administrativos correspondientes."
                ],
                signers: [
                    grantor.signatureName,
                    value(values, "attorney", "Apoderado"),
                    value(values, "witnessOne", "Testigo"),
                    value(values, "witnessTwo", "Testigo")
                ],
                signatures: [
                    { name: grantor.signatureName, role: grantor.signatureRole },
                    { name: value(values, "attorney", "Apoderado pendiente"), role: "Apoderado" },
                    { name: value(values, "witnessOne", "Testigo pendiente"), role: "Testigo" },
                    { name: value(values, "witnessTwo", "Testigo pendiente"), role: "Testigo" }
                ],
                signatureColumns: 2,
                showPageNumbers: true
            };
        }
    },
    {
        id: "labor-power-letter",
        title: "Carta poder laboral",
        shortTitle: "Poder laboral",
        summary: "Autorizacion para comparecer o gestionar asuntos ante autoridad laboral.",
        fields: [
            ...basePlaceDateFields,
            { name: "grantorType", label: "Tipo de poderdante", type: "grantor-type", defaultValue: "moral" },
            {
                name: "grantorPersonName",
                label: "Nombre de la persona física poderdante",
                placeholder: "Nombre de la persona física",
                visibleWhen: { name: "grantorType", value: "physical" }
            },
            {
                name: "grantorCompanyName",
                label: "Nombre de la sociedad otorgante",
                placeholder: "CHAN-QING INTERNACIONAL IMPORTACION Y EXPORTACION, S.A. DE C.V.",
                visibleWhen: { name: "grantorType", value: "moral" }
            },
            {
                name: "grantorCompanyRepresentative",
                label: "Apoderado de la sociedad otorgante",
                placeholder: "YUHUI CHEN",
                visibleWhen: { name: "grantorType", value: "moral" }
            },
            {
                name: "attorney",
                label: "Apoderados",
                type: "attorneys",
                placeholder: "Nombre del apoderado"
            },
            { name: "witnessOne", label: "Testigo 1", placeholder: "Nombre del primer testigo" },
            { name: "witnessTwo", label: "Testigo 2", placeholder: "Nombre del segundo testigo" }
        ],
        build: (values) => {
            const grantor = getGrantorFields(values, { uppercase: true });
            const attorneyNames = splitAttorneyNames(values.attorney)
                .map((attorney) => attorney.replace(/\s+/g, " ").toLocaleUpperCase("es-MX"));
            const attorneys = formatSpanishNameList(attorneyNames.length ? attorneyNames : [laborPowerAttorneyFallback]);
            const title = grantor.grantorType === "moral"
                ? `CARTA PODER QUE SUSCRIBE ${grantor.companyName}, POR CONDUCTO DE SU APODERADO ${grantor.companyRepresentative}, EN CALIDAD DE PODERDANTE, AL TENOR DE LA CLÁUSULA ESTABLECIDA A CONTINUACIÓN.`
                : `CARTA PODER QUE SUSCRIBE ${grantor.physicalName}, EN CALIDAD DE PODERDANTE, AL TENOR DE LA CLÁUSULA ESTABLECIDA A CONTINUACIÓN.`;
            const clause = grantor.grantorType === "moral"
                ? `${grantor.companyRepresentative}, en calidad de representante legal de ${grantor.companyName} (en adelante la “Empresa”) personalidad que se acredita en términos del instrumento notarial agregado a este escrito como Anexo 1, en este acto otorgo poder especial a ${attorneys}, en calidad de apoderados, quienes podrán ejercerlo de manera conjunta o separada, para efectos de que representen a mi poderdante ante todas las instancias y autoridades laborales competentes, judiciales y administrativas, a fin de defender los intereses de mi representada fuera y dentro de juicio, derivados de cualquier controversia suscitada a raíz de la existencia presente o pasada de cualquier relación laboral de la que mi representada haya formado parte. Entre las facultades conferidas a los apoderados se encuentran, de manera enunciativa más no limitativa, la de interponer demandas, absolver posiciones, transigir, desistirse de acciones o instancias respecto a cualquier demandado, interponer recursos ordinarios y extraordinarios en cualquier procedimiento así como demandas de amparo contra cualquier acto reclamado, así como todo acto inherente a la correcta defensa de los intereses de mi representada derivados de cualquier controversia suscitada a raíz de la existencia presente o pasada de cualquier relación laboral de la que mi representada haya formado parte. El presente poder se otorga para que los apoderados lo ejerzan de conformidad con el artículo 692 de la Ley Federal del Trabajo.`
                : `${grantor.physicalName}, por mi propio derecho, en este acto otorgo poder especial a ${attorneys}, en calidad de apoderados, quienes podrán ejercerlo de manera conjunta o separada, para efectos de que me representen ante todas las instancias y autoridades laborales competentes, judiciales y administrativas, a fin de defender mis intereses fuera y dentro de juicio, derivados de cualquier controversia suscitada a raíz de la existencia presente o pasada de cualquier relación laboral de la que haya formado parte. Entre las facultades conferidas a los apoderados se encuentran, de manera enunciativa más no limitativa, la de interponer demandas, absolver posiciones, transigir, desistirse de acciones o instancias respecto a cualquier demandado, interponer recursos ordinarios y extraordinarios en cualquier procedimiento así como demandas de amparo contra cualquier acto reclamado, así como todo acto inherente a la correcta defensa de mis intereses derivados de cualquier controversia suscitada a raíz de la existencia presente o pasada de cualquier relación laboral de la que haya formado parte. El presente poder se otorga para que los apoderados lo ejerzan de conformidad con el artículo 692 de la Ley Federal del Trabajo.`;
            return {
                title,
                subtitle: formatPlaceDate(values),
                paragraphs: [
                    "CLÁUSULA ÚNICA",
                    clause
                ],
                signers: [
                    grantor.signatureName,
                    ...attorneyNames,
                    value(values, "witnessOne", "Testigo"),
                    value(values, "witnessTwo", "Testigo")
                ],
                signatures: [
                    { name: grantor.signatureName, role: grantor.grantorType === "moral" ? "Apoderado de la sociedad otorgante" : "Poderdante" },
                    ...(attorneyNames.length ? attorneyNames : [laborPowerAttorneyFallback]).map((attorney) => ({
                        name: attorney,
                        role: "Apoderado"
                    })),
                    { name: value(values, "witnessOne", "Testigo pendiente"), role: "Testigo" },
                    { name: value(values, "witnessTwo", "Testigo pendiente"), role: "Testigo" }
                ],
                signatureColumns: 2
            };
        }
    },
    {
        id: "money-receipt",
        title: "Recibo de dinero",
        shortTitle: "Recibo de dinero",
        summary: "Constancia de recepcion de pago, anticipo, reembolso o entrega de efectivo.",
        fields: [
            {
                name: "concept",
                label: "Concepto",
                type: "textarea",
                placeholder: "Iguala mensual correspondiente a abril de 2021"
            },
            { name: "paymentType", label: "Pago parcial / pago total", type: "payment-type", defaultValue: "Pago total" },
            { name: "amount", label: "Monto", type: "number", placeholder: "1500.00" },
            { name: "receivedBy", label: "Nombre de quien recibe", placeholder: "Ma. Del Carmen Hernández" },
            { name: "date", label: "Fecha de recibido", type: "date" }
        ],
        build: (values) => ({
            title: "Recibo de dinero",
            subtitle: "",
            paragraphs: [],
            signers: [],
            letterhead: "rusconi",
            formLayout: {
                type: "money-receipt",
                concept: moneyReceiptConcept(values),
                paymentType: fallbackValue(values, ["paymentType", "paymentMethod"], "pago pendiente"),
                amount: moneyReceiptAmountLabel(values),
                receivedBy: value(values, "receivedBy", "pendiente"),
                receivedDate: formatLongDate(values.date)
            }
        })
    },
    {
        id: "rc-received-document-receipt",
        title: "Recibo de documentos recibidos por RC",
        shortTitle: "Docs recibidos RC",
        summary: "Constancia de documentos que Rusconi Consulting recibe de un cliente o tercero.",
        fields: [
            { name: "date", label: "Fecha", type: "date" },
            {
                name: "documents",
                label: "Documentos recibidos por Rusconi Consulting",
                type: "document-list",
                placeholder: "Descripcion del documento recibido"
            },
            { name: "deliveredBy", label: "Nombre de quien entrega", placeholder: "Nombre de quien entrega" },
            { name: "receivedBy", label: "Nombre de quien recibe", placeholder: "Nombre de quien recibe por RC", defaultValue: "Rusconi Consulting" }
        ],
        build: (values) => {
            const documents = values.documents ?? "";
            const deliveredBy = value(values, "deliveredBy", "");
            const receivedBy = value(values, "receivedBy", "Rusconi Consulting");
            return {
                title: "Recibo de documentos",
                subtitle: "",
                paragraphs: [],
                signers: [],
                letterhead: "rusconi",
                formLayout: {
                    type: "rc-received-documents",
                    descriptionHeading: "DESCRIPCIÓN DE LOS DOCUMENTOS RECIBIDOS POR\nRUSCONI CONSULTING",
                    documents,
                    documentRows: receiptDocumentRows(documents),
                    deliveredBy,
                    receivedBy,
                    date: formatLongDate(values.date)
                }
            };
        }
    },
    {
        id: "rc-delivered-document-receipt",
        title: "Recibo de documentos entregados por RC",
        shortTitle: "Docs entregados RC",
        summary: "Constancia de documentos que Rusconi Consulting entrega a un cliente o tercero.",
        fields: [
            { name: "date", label: "Fecha", type: "date" },
            {
                name: "documents",
                label: "Documentos entregados por Rusconi Consulting",
                type: "document-list",
                placeholder: "Descripcion del documento entregado"
            },
            { name: "deliveredBy", label: "Nombre de quien entrega", placeholder: "Nombre de quien entrega por RC", defaultValue: "Rusconi Consulting" },
            { name: "receivedBy", label: "Nombre de quien recibe", placeholder: "Nombre de quien recibe" }
        ],
        build: (values) => {
            const documents = values.documents ?? "";
            const deliveredBy = value(values, "deliveredBy", "Rusconi Consulting");
            const receivedBy = value(values, "receivedBy", "");
            return {
                title: "Recibo de documentos",
                subtitle: "",
                paragraphs: [],
                signers: [],
                letterhead: "rusconi",
                formLayout: {
                    type: "rc-delivered-documents",
                    descriptionHeading: "DESCRIPCIÓN DE LOS DOCUMENTOS ENTREGADOS POR\nRUSCONI CONSULTING",
                    documents,
                    documentRows: receiptDocumentRows(documents),
                    deliveredBy,
                    receivedBy,
                    date: formatLongDate(values.date)
                }
            };
        }
    },
    {
        id: "property-delivery-receipt",
        title: "Acta de entrega recepcion de inmueble",
        shortTitle: "Entrega inmueble",
        summary: "Acta para documentar entrega fisica, llaves, servicios y estado general del inmueble.",
        fields: [
            ...basePlaceDateFields,
            { name: "deliveredBy", label: "Entrega", placeholder: "Nombre de quien entrega" },
            { name: "receivedBy", label: "Recibe", placeholder: "Nombre de quien recibe" },
            { name: "propertyAddress", label: "Domicilio del inmueble", placeholder: "Calle, numero, colonia, ciudad" },
            { name: "propertyType", label: "Tipo de inmueble", placeholder: "Casa, departamento, local, oficina..." },
            { name: "keys", label: "Llaves y controles", placeholder: "Numero de juegos de llaves, controles, tarjetas..." },
            { name: "services", label: "Servicios y medidores", type: "textarea", placeholder: "Agua, luz, gas, internet, lecturas o adeudos conocidos" },
            { name: "condition", label: "Estado general", type: "textarea", placeholder: "Estado fisico, mobiliario, accesorios, danos o pendientes" },
            { name: "notes", label: "Observaciones", type: "textarea", placeholder: "Anexos fotograficos, inventario, pendientes de entrega" }
        ],
        build: (values) => ({
            title: "Acta de entrega recepcion de inmueble",
            subtitle: formatPlaceDate(values),
            paragraphs: [
                `Comparecen ${value(values, "deliveredBy", "persona que entrega pendiente")} como parte que entrega y ${value(values, "receivedBy", "persona que recibe pendiente")} como parte que recibe, para hacer constar la entrega recepcion del inmueble ubicado en ${value(values, "propertyAddress", "domicilio pendiente")}.`,
                `El inmueble se identifica como ${value(values, "propertyType", "tipo de inmueble pendiente")} y se entrega con ${value(values, "keys", "llaves o controles pendientes")}.`,
                `Servicios y medidores: ${value(values, "services", "servicios pendientes")}`,
                `Estado general del inmueble: ${value(values, "condition", "estado pendiente")}`,
                value(values, "notes", "Sin observaciones adicionales.")
            ],
            details: [
                { label: "Domicilio", value: value(values, "propertyAddress", "domicilio pendiente") },
                { label: "Tipo de inmueble", value: value(values, "propertyType", "tipo pendiente") },
                { label: "Llaves y controles", value: value(values, "keys", "pendiente") }
            ],
            signers: [value(values, "deliveredBy", "Entrega"), value(values, "receivedBy", "Recibe")]
        })
    }
];
function sortClients(clients) {
    return [...clients].sort((left, right) => {
        const numberDelta = left.clientNumber.localeCompare(right.clientNumber, "es-MX", { numeric: true });
        return numberDelta || left.name.localeCompare(right.name, "es-MX", { sensitivity: "base" });
    });
}
function clientPickerLabel(client) {
    return `${client.clientNumber} - ${client.name}`;
}
function clientPickerSearchContent(client) {
    return normalizeSearchText(`${client.clientNumber} ${client.name}`);
}
function sortAssignedDocuments(assignments) {
    return [...assignments].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
function sortClientGroups(left, right) {
    const numberDelta = left.clientNumber.localeCompare(right.clientNumber, "es-MX", { numeric: true });
    return numberDelta || left.clientName.localeCompare(right.clientName, "es-MX", { sensitivity: "base" });
}
function groupAssignmentsByClient(assignments) {
    const groups = new Map();
    assignments.forEach((assignment) => {
        const group = groups.get(assignment.clientId);
        if (group) {
            group.assignments.push(assignment);
            return;
        }
        groups.set(assignment.clientId, {
            clientId: assignment.clientId,
            clientNumber: assignment.clientNumber,
            clientName: assignment.clientName,
            assignments: [assignment]
        });
    });
    return [...groups.values()].sort(sortClientGroups).map((group) => ({
        ...group,
        assignments: [...group.assignments].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    }));
}
function findTemplate(templateId) {
    const normalizedTemplateId = templateId === "document-receipt" ? "rc-received-document-receipt" : templateId;
    return dailyDocumentTemplates.find((template) => template.id === normalizedTemplateId) ?? dailyDocumentTemplates[0];
}
function mergeTemplateValues(template, values) {
    const mergedValues = {
        ...initialValuesForTemplate(template),
        ...values
    };
    if (template.id === "general-power-letter") {
        if (!mergedValues.grantorType) {
            mergedValues.grantorType = "physical";
        }
        if (!normalizeText(mergedValues.grantorPersonName) && normalizeText(mergedValues.grantor)) {
            mergedValues.grantorPersonName = mergedValues.grantor;
        }
    }
    if (template.id === "labor-power-letter") {
        if (!values.grantorType && (normalizeText(values.employer) || normalizeText(values.grantor))) {
            mergedValues.grantorType = "moral";
        }
        if (!normalizeText(mergedValues.grantorPersonName) && mergedValues.grantorType === "physical" && normalizeText(mergedValues.grantor)) {
            mergedValues.grantorPersonName = mergedValues.grantor;
        }
        if (!normalizeText(mergedValues.grantorCompanyName) && normalizeText(mergedValues.employer)) {
            mergedValues.grantorCompanyName = mergedValues.employer;
        }
        if (!normalizeText(mergedValues.grantorCompanyRepresentative) && normalizeText(mergedValues.grantor)) {
            mergedValues.grantorCompanyRepresentative = mergedValues.grantor;
        }
    }
    if (template.id === "money-receipt" && !normalizeText(mergedValues.paymentType) && normalizeText(mergedValues.paymentMethod)) {
        mergedValues.paymentType = mergedValues.paymentMethod;
    }
    return mergedValues;
}
function initialValuesForTemplate(template) {
    return template.fields.reduce((values, field) => {
        values[field.name] = field.type === "date" ? today : field.defaultValue ?? "";
        return values;
    }, {});
}
function slugify(valueToSlug) {
    return valueToSlug
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}
function escapeHtml(valueToEscape) {
    return valueToEscape
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function getDocumentSignatures(document) {
    const explicitSignatures = document.signatures?.filter((signature) => normalizeText(signature.name));
    if (explicitSignatures?.length) {
        return explicitSignatures;
    }
    return document.signers.map((signer) => ({ name: signer }));
}
function shouldShowPageNumbers(document) {
    return document.showPageNumbers !== false;
}
function pageNumberLabel(currentPage, totalPages) {
    return `Página ${currentPage} de ${totalPages}`;
}
function getSignatureColumnCount(document, signatureCount) {
    if (document.signatureColumns) {
        return document.signatureColumns;
    }
    return Math.min(Math.max(signatureCount, 1), 2);
}
function chunkItems(items, chunkSize) {
    const chunks = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }
    return chunks;
}
function getSubtitleAlignment(document) {
    return document.subtitleAlignment === "right" ? "right" : "center";
}
function hasRusconiLetterhead(document) {
    return document.letterhead === "rusconi";
}
function getDocumentPageMargins(document) {
    return hasRusconiLetterhead(document) ? letterheadPageMargins : regularPageMargins;
}
async function fetchAsset(assetUrl) {
    const response = await fetch(assetUrl);
    if (!response.ok) {
        throw new Error("No se pudo cargar la hoja membretada.");
    }
    return response;
}
async function fetchAssetArrayBuffer(assetUrl) {
    return fetchAsset(assetUrl).then((response) => response.arrayBuffer());
}
async function fetchAssetDataUrl(assetUrl) {
    const blob = await fetchAsset(assetUrl).then((response) => response.blob());
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer la hoja membretada."));
        reader.readAsDataURL(blob);
    });
}
function isDocumentStandaloneHeading(paragraph) {
    return paragraph.trim().toLocaleUpperCase("es-MX") === "CLÁUSULA ÚNICA";
}
function getRcDeliveredForm(document) {
    return document.formLayout?.type === "rc-delivered-documents" || document.formLayout?.type === "rc-received-documents"
        ? document.formLayout
        : null;
}
function getMoneyReceiptForm(document) {
    return document.formLayout?.type === "money-receipt" ? document.formLayout : null;
}
function rcDeliveredFormText(form) {
    const documentLines = form.documentRows
        .filter((row) => normalizeText(row.description))
        .map((row) => `${row.description} - ${receiptCheckboxSymbol(row.kind === "original")} ${receiptDocumentKindLabels.original} ${receiptCheckboxSymbol(row.kind === "simple")} ${receiptDocumentKindLabels.simple}`);
    return [
        form.descriptionHeading,
        documentLines.join("\n") || "Documentos pendientes",
        `NOMBRE DE QUIEN ENTREGA: ${form.deliveredBy || "pendiente"}`,
        `FECHA: ${form.date}`,
        `NOMBRE DE QUIEN RECIBE: ${form.receivedBy || "pendiente"}`,
        `FIRMA DE QUIEN RECIBE LOS DOCUMENTOS:\n______________________________\n${form.receivedBy || "pendiente"}`
    ];
}
function rcDeliveredFormHtml(form) {
    const descriptionHeading = form.descriptionHeading.split("\n").map(escapeHtml).join("<br>");
    const documentRows = form.documentRows
        .map((row) => {
        const description = normalizeText(row.description);
        return `<tr>
        <td class="rc-doc-description">${description ? escapeHtml(description) : "&nbsp;"}</td>
        <td class="rc-doc-kind">${description ? `<span class="doc-checkbox${row.kind === "original" ? " is-checked" : ""}"></span>${escapeHtml(receiptDocumentKindLabels.original)}` : "&nbsp;"}</td>
        <td class="rc-doc-kind">${description ? `<span class="doc-checkbox${row.kind === "simple" ? " is-checked" : ""}"></span>${escapeHtml(receiptDocumentKindLabels.simple)}` : "&nbsp;"}</td>
      </tr>`;
    })
        .join("");
    return `<section class="rc-delivered-form">
    <table class="rc-delivered-docs-table">
      <thead>
        <tr><th colspan="3">${descriptionHeading}</th></tr>
      </thead>
      <tbody>${documentRows}</tbody>
    </table>
    <table class="rc-delivered-meta-table">
      <tbody>
        <tr>
          <th>NOMBRE DE QUIEN ENTREGA</th>
          <th>FECHA</th>
        </tr>
        <tr>
          <td>${escapeHtml(form.deliveredBy)}</td>
          <td>${escapeHtml(form.date)}</td>
        </tr>
        <tr>
          <th>NOMBRE DE QUIEN RECIBE</th>
          <td>${escapeHtml(form.receivedBy)}</td>
        </tr>
      </tbody>
    </table>
    <div class="rc-receiver-signature">
      <strong>${escapeHtml(form.receivedBy || "Nombre de quien recibe")}</strong>
      <em>Firma de quien recibe los documentos</em>
    </div>
  </section>`;
}
function moneyReceiptFormText(form) {
    return [
        `CONCEPTO: ${form.concept}`,
        `PAGO PARCIAL/PAGO TOTAL: ${form.paymentType}`,
        `MONTO: ${form.amount}`,
        "PAGO RECIBIDO POR RUSCONI CONSULTING",
        `NOMBRE DE QUIEN RECIBE: ${form.receivedBy}`,
        `FECHA DE RECIBIDO: ${form.receivedDate}`,
        `FIRMA DE QUIEN RECIBE EL DINERO:\n______________________________\n${form.receivedBy || "pendiente"}`
    ];
}
function moneyReceiptFormHtml(form) {
    return `<section class="money-receipt-form">
    <div class="money-receipt-lines">
      <p><strong>CONCEPTO:</strong> ${escapeHtml(form.concept)}</p>
      <p><strong>PAGO PARCIAL/PAGO TOTAL:</strong> ${escapeHtml(form.paymentType)}</p>
      <p><strong>MONTO:</strong> ${escapeHtml(form.amount)}</p>
    </div>
    <table class="money-receipt-table">
      <thead>
        <tr><th colspan="2">PAGO RECIBIDO POR RUSCONI CONSULTING</th></tr>
        <tr>
          <th>NOMBRE DE QUIEN RECIBE</th>
          <th>FECHA DE RECIBIDO</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(form.receivedBy)}</td>
          <td>${escapeHtml(form.receivedDate)}</td>
        </tr>
      </tbody>
    </table>
    <div class="money-receiver-signature">
      <strong>${escapeHtml(form.receivedBy || "Nombre de quien recibe")}</strong>
      <em>Firma de quien recibe el dinero</em>
    </div>
  </section>`;
}
function generatedDocumentToText(document) {
    const form = getRcDeliveredForm(document);
    const moneyForm = getMoneyReceiptForm(document);
    const detailLines = document.details?.map((detail) => `${detail.label}: ${detail.value}`) ?? [];
    const signerLines = getDocumentSignatures(document).map((signature) => `______________________________\n${signature.name}${signature.role ? `\n${signature.role}` : ""}`);
    return [
        document.title,
        document.subtitle,
        ...(form ? rcDeliveredFormText(form) : moneyForm ? moneyReceiptFormText(moneyForm) : document.paragraphs),
        ...detailLines,
        ...signerLines,
        shouldShowPageNumbers(document) ? pageNumberLabel(1, 1) : ""
    ]
        .filter(Boolean)
        .join("\n\n");
}
function generatedDocumentToHtml(document) {
    const form = getRcDeliveredForm(document);
    const moneyForm = getMoneyReceiptForm(document);
    const signatures = getDocumentSignatures(document);
    const signatureColumns = getSignatureColumnCount(document, signatures.length);
    const subtitleAlignment = getSubtitleAlignment(document);
    const letterheadClass = hasRusconiLetterhead(document) ? ' class="letterhead-page"' : "";
    const detailRows = document.details
        ?.map((detail) => `<tr><th>${escapeHtml(detail.label)}</th><td>${escapeHtml(detail.value)}</td></tr>`)
        .join("") ?? "";
    const signerRows = signatures
        .map((signature) => `<div class="signature"><span></span><strong>${escapeHtml(signature.name)}</strong>${signature.role ? `<em>${escapeHtml(signature.role)}</em>` : ""}</div>`)
        .join("");
    const pageNumber = shouldShowPageNumbers(document)
        ? `<footer class="page-number">${escapeHtml(pageNumberLabel(1, 1))}</footer>`
        : "";
    const regularBody = `${document.paragraphs
        .map((paragraph) => `<p${isDocumentStandaloneHeading(paragraph) ? ' class="clause-heading"' : ""}>${escapeHtml(paragraph)}</p>`)
        .join("")}
  ${detailRows ? `<table>${detailRows}</table>` : ""}
  ${signerRows ? `<div class="signatures">${signerRows}</div>` : ""}`;
    const bodyContent = form ? rcDeliveredFormHtml(form) : moneyForm ? moneyReceiptFormHtml(moneyForm) : regularBody;
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(document.title)}</title>
  <style>
    body { color: #172033; font-family: Arial, sans-serif; line-height: 1.55; margin: 48px; padding-bottom: 32px; }
    body.letterhead-page { background: #fff url("${rusconiLetterheadUrl}") center top / 100% 100% no-repeat; box-sizing: border-box; margin: 0; min-height: 11in; padding: 1.35in 0.82in 1.4in; width: 8.5in; }
    h1 { font-size: 24px; margin: 0 0 8px; text-align: center; text-transform: uppercase; }
    .subtitle { color: #52606d; margin: 0 0 32px; text-align: ${subtitleAlignment}; }
    p { margin: 0 0 18px; text-align: justify; }
    .clause-heading { font-weight: 700; text-align: center; }
    .rc-delivered-form { display: grid; gap: 34px; margin-top: 20px; }
    .rc-delivered-docs-table, .rc-delivered-meta-table { border-collapse: collapse; font-family: "Times New Roman", serif; margin: 0 auto; width: 92%; }
    .rc-delivered-docs-table th, .rc-delivered-docs-table td, .rc-delivered-meta-table th, .rc-delivered-meta-table td { border: 1px solid #111; padding: 4px 8px; }
    .rc-delivered-docs-table th, .rc-delivered-meta-table th { background: #d9d9d9; font-size: 16px; font-weight: 700; text-align: center; }
    .rc-delivered-docs-table td { height: 24px; }
    .rc-delivered-meta-table td { height: 26px; text-align: center; }
    .rc-doc-description { text-align: left; width: 50%; }
    .rc-doc-kind { text-align: center; white-space: nowrap; width: 25%; }
    .doc-checkbox { border: 1px solid #111; display: inline-block; height: 9px; margin-right: 5px; position: relative; vertical-align: -1px; width: 9px; }
    .doc-checkbox.is-checked::after { border-bottom: 2px solid #111; border-left: 2px solid #111; content: ""; display: block; height: 3px; left: 1px; position: absolute; top: 1px; transform: rotate(-45deg); width: 6px; }
    .rc-receiver-signature { border-top: 1px solid #111; color: #000; font-family: "Times New Roman", serif; margin: 42px auto 0; padding-top: 8px; text-align: center; width: 58%; }
    .rc-receiver-signature strong, .rc-receiver-signature em { display: block; overflow-wrap: anywhere; }
    .rc-receiver-signature strong { font-size: 15px; font-weight: 700; }
    .rc-receiver-signature em { font-size: 13px; font-style: normal; font-weight: 700; margin-top: 4px; }
    .money-receipt-form { color: #000; display: grid; font-family: "Times New Roman", serif; gap: 56px; margin: 72px auto 0; width: 92%; }
    .money-receipt-lines { display: grid; gap: 28px; }
    .money-receipt-lines p { color: #000; font-size: 17px; line-height: 1.7; margin: 0; text-align: left; }
    .money-receipt-lines strong { font-weight: 700; }
    .money-receipt-table { border-collapse: collapse; font-family: "Times New Roman", serif; margin: 0 auto; width: 100%; }
    .money-receipt-table th, .money-receipt-table td { border: 1px solid #111; color: #000; padding: 2px 8px; text-align: center; }
    .money-receipt-table th { background: #d9d9d9; font-size: 17px; font-weight: 700; line-height: 1.1; }
    .money-receipt-table td { font-size: 16px; font-weight: 700; line-height: 1.2; }
    .money-receiver-signature { border-top: 1px solid #111; color: #000; font-family: "Times New Roman", serif; margin: -10px auto 0; padding-top: 8px; text-align: center; width: 58%; }
    .money-receiver-signature strong, .money-receiver-signature em { display: block; overflow-wrap: anywhere; }
    .money-receiver-signature strong { font-size: 15px; font-weight: 700; }
    .money-receiver-signature em { font-size: 13px; font-style: normal; font-weight: 700; margin-top: 4px; }
    table { border-collapse: collapse; margin: 24px 0; width: 100%; }
    th, td { border: 1px solid #d9e2ec; padding: 10px; text-align: left; vertical-align: top; }
    th { width: 28%; }
    .signatures { display: grid; gap: 42px 28px; grid-template-columns: repeat(${signatureColumns}, minmax(0, 1fr)); margin-top: 72px; }
    .signature { text-align: center; }
    .signature span { border-top: 1px solid #172033; display: block; margin-bottom: 8px; }
    .signature strong, .signature em { display: block; overflow-wrap: anywhere; }
    .signature em { color: #52606d; font-style: normal; font-weight: 700; margin-top: 4px; }
    .page-number { bottom: 24px; color: #52606d; font-size: 11px; left: 0; position: fixed; right: 0; text-align: center; }
    @page { margin: 0; size: letter; }
  </style>
</head>
<body${letterheadClass}>
  <h1>${escapeHtml(document.title)}</h1>
  ${document.subtitle ? `<p class="subtitle">${escapeHtml(document.subtitle)}</p>` : ""}
  ${bodyContent}
  ${pageNumber}
</body>
</html>`;
}
function documentFileName(document, extension) {
    return `${slugify(document.title)}.${extension}`;
}
function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function downloadWordDocument(document) {
    const { AlignmentType, Document: WordDocument, Footer, Header, HorizontalPositionRelativeFrom, ImageRun, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, TableBorders, VerticalPositionRelativeFrom, WidthType } = await import("docx");
    const form = getRcDeliveredForm(document);
    const moneyForm = getMoneyReceiptForm(document);
    const isFormDocument = Boolean(form || moneyForm);
    const signatures = getDocumentSignatures(document);
    const signatureColumns = getSignatureColumnCount(document, signatures.length);
    const signatureRows = chunkItems(signatures, signatureColumns);
    const subtitleAlignment = getSubtitleAlignment(document) === "right" ? AlignmentType.RIGHT : AlignmentType.CENTER;
    const letterheadData = hasRusconiLetterhead(document) ? await fetchAssetArrayBuffer(rusconiLetterheadUrl) : null;
    const pageMargins = getDocumentPageMargins(document);
    const children = [
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
            children: [
                new TextRun({
                    text: document.title.toUpperCase(),
                    bold: true,
                    size: 28,
                    font: isFormDocument ? "Times New Roman" : "Arial",
                    color: "172033"
                })
            ]
        })
    ];
    if (document.subtitle) {
        children.push(new Paragraph({
            alignment: subtitleAlignment,
            spacing: { after: 440 },
            children: [
                new TextRun({
                    text: document.subtitle,
                    bold: true,
                    size: 22,
                    font: "Arial",
                    color: "52606D"
                })
            ]
        }));
    }
    if (form) {
        const tableHeaderShading = { fill: "D9D9D9" };
        const formParagraph = (text, bold = false, alignLeft = false) => new Paragraph({
            alignment: alignLeft ? AlignmentType.LEFT : AlignmentType.CENTER,
            children: [
                new TextRun({
                    text,
                    bold,
                    size: 24,
                    font: "Times New Roman",
                    color: "000000"
                })
            ]
        });
        children.push(new Paragraph({ spacing: { after: 160 }, text: "" }));
        children.push(new Table({
            width: { size: 92, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            columnSpan: 3,
                            shading: tableHeaderShading,
                            children: form.descriptionHeading.split("\n").map((headingLine) => formParagraph(headingLine, true))
                        })
                    ]
                }),
                ...form.documentRows.map((row) => {
                    const description = normalizeText(row.description);
                    return new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 50, type: WidthType.PERCENTAGE },
                                children: [formParagraph(description || " ", false, true)]
                            }),
                            new TableCell({
                                width: { size: 25, type: WidthType.PERCENTAGE },
                                children: [
                                    formParagraph(description ? `${receiptCheckboxSymbol(row.kind === "original")} ${receiptDocumentKindLabels.original}` : " ", false)
                                ]
                            }),
                            new TableCell({
                                width: { size: 25, type: WidthType.PERCENTAGE },
                                children: [
                                    formParagraph(description ? `${receiptCheckboxSymbol(row.kind === "simple")} ${receiptDocumentKindLabels.simple}` : " ", false)
                                ]
                            })
                        ]
                    });
                })
            ]
        }));
        children.push(new Paragraph({ spacing: { after: 420 }, text: "" }));
        children.push(new Table({
            width: { size: 92, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            shading: tableHeaderShading,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            children: [formParagraph("NOMBRE DE QUIEN ENTREGA", true)]
                        }),
                        new TableCell({
                            shading: tableHeaderShading,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            children: [formParagraph("FECHA", true)]
                        })
                    ]
                }),
                new TableRow({
                    children: [
                        new TableCell({ children: [formParagraph(form.deliveredBy)] }),
                        new TableCell({ children: [formParagraph(form.date)] })
                    ]
                }),
                new TableRow({
                    children: [
                        new TableCell({
                            shading: tableHeaderShading,
                            children: [formParagraph("NOMBRE DE QUIEN RECIBE", true)]
                        }),
                        new TableCell({ children: [formParagraph(form.receivedBy)] })
                    ]
                })
            ]
        }));
        children.push(new Paragraph({ spacing: { after: 560 }, text: "" }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                new TextRun({
                    text: "______________________________",
                    font: "Times New Roman",
                    size: 24,
                    color: "000000"
                })
            ]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [
                new TextRun({
                    text: form.receivedBy || "Nombre de quien recibe",
                    bold: true,
                    font: "Times New Roman",
                    size: 22,
                    color: "000000"
                })
            ]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60 },
            children: [
                new TextRun({
                    text: "Firma de quien recibe los documentos",
                    bold: true,
                    font: "Times New Roman",
                    size: 20,
                    color: "000000"
                })
            ]
        }));
    }
    if (moneyForm) {
        const moneyTextRun = (text, bold = false) => new TextRun({
            text,
            bold,
            size: 24,
            font: "Times New Roman",
            color: "000000"
        });
        const moneyLine = (label, text) => new Paragraph({
            spacing: { after: 360, line: 360 },
            children: [moneyTextRun(label, true), moneyTextRun(text)]
        });
        const moneyCellParagraph = (text, bold = false) => new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [moneyTextRun(text, bold)]
        });
        const tableHeaderShading = { fill: "D9D9D9" };
        children.push(new Paragraph({ spacing: { after: 700 }, text: "" }));
        children.push(moneyLine("CONCEPTO: ", moneyForm.concept));
        children.push(moneyLine("PAGO PARCIAL/PAGO TOTAL: ", moneyForm.paymentType));
        children.push(moneyLine("MONTO: ", moneyForm.amount));
        children.push(new Paragraph({ spacing: { after: 560 }, text: "" }));
        children.push(new Table({
            width: { size: 92, type: WidthType.PERCENTAGE },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            columnSpan: 2,
                            shading: tableHeaderShading,
                            children: [moneyCellParagraph("PAGO RECIBIDO POR RUSCONI CONSULTING", true)]
                        })
                    ]
                }),
                new TableRow({
                    children: [
                        new TableCell({
                            shading: tableHeaderShading,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            children: [moneyCellParagraph("NOMBRE DE QUIEN RECIBE", true)]
                        }),
                        new TableCell({
                            shading: tableHeaderShading,
                            width: { size: 50, type: WidthType.PERCENTAGE },
                            children: [moneyCellParagraph("FECHA DE RECIBIDO", true)]
                        })
                    ]
                }),
                new TableRow({
                    children: [
                        new TableCell({ children: [moneyCellParagraph(moneyForm.receivedBy, true)] }),
                        new TableCell({ children: [moneyCellParagraph(moneyForm.receivedDate, true)] })
                    ]
                })
            ]
        }));
        children.push(new Paragraph({ spacing: { after: 560 }, text: "" }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [moneyTextRun("______________________________")]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100 },
            children: [moneyTextRun(moneyForm.receivedBy || "Nombre de quien recibe", true)]
        }));
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60 },
            children: [moneyTextRun("Firma de quien recibe el dinero", true)]
        }));
    }
    document.paragraphs.forEach((paragraph) => {
        const isHeading = isDocumentStandaloneHeading(paragraph);
        children.push(new Paragraph({
            alignment: isHeading ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
            spacing: { after: isHeading ? 160 : 220, line: 360 },
            children: [
                new TextRun({
                    text: paragraph,
                    bold: isHeading,
                    size: 24,
                    font: "Arial",
                    color: "172033"
                })
            ]
        }));
    });
    if (document.details?.length) {
        children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: document.details.map((detail) => new TableRow({
                children: [
                    new TableCell({
                        width: { size: 28, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: detail.label, bold: true, font: "Arial", size: 22 })]
                            })
                        ]
                    }),
                    new TableCell({
                        width: { size: 72, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                children: [new TextRun({ text: detail.value, font: "Arial", size: 22 })]
                            })
                        ]
                    })
                ]
            }))
        }));
    }
    if (signatures.length) {
        children.push(new Paragraph({ spacing: { after: 760 }, text: "" }));
        children.push(new Table({
            borders: TableBorders.NONE,
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: signatureRows.map((row) => new TableRow({
                children: Array.from({ length: signatureColumns }, (_, index) => {
                    const signature = row[index];
                    return (new TableCell({
                        width: { size: 100 / signatureColumns, type: WidthType.PERCENTAGE },
                        children: signature
                            ? [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [new TextRun({ text: "______________________________", font: "Arial", size: 22 })]
                                }),
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    spacing: { before: 120 },
                                    children: [new TextRun({ text: signature.name, bold: true, font: "Arial", size: 22 })]
                                }),
                                ...(signature.role
                                    ? [
                                        new Paragraph({
                                            alignment: AlignmentType.CENTER,
                                            spacing: { before: 60, after: 280 },
                                            children: [
                                                new TextRun({
                                                    text: signature.role,
                                                    bold: true,
                                                    font: "Arial",
                                                    size: 20,
                                                    color: "52606D"
                                                })
                                            ]
                                        })
                                    ]
                                    : [])
                            ]
                            : [new Paragraph({ text: "" })]
                    }));
                })
            }))
        }));
    }
    const wordDocument = new WordDocument({
        creator: "SIGE",
        title: document.title,
        description: "Documento generado desde SIGE",
        sections: [
            {
                properties: {
                    page: {
                        margin: pageMargins
                    }
                },
                headers: letterheadData
                    ? {
                        default: new Header({
                            children: [
                                new Paragraph({
                                    children: [
                                        new ImageRun({
                                            type: "jpg",
                                            data: letterheadData,
                                            transformation: rusconiLetterheadDimensions,
                                            floating: {
                                                horizontalPosition: {
                                                    relative: HorizontalPositionRelativeFrom.PAGE,
                                                    offset: 0
                                                },
                                                verticalPosition: {
                                                    relative: VerticalPositionRelativeFrom.PAGE,
                                                    offset: 0
                                                },
                                                allowOverlap: true,
                                                behindDocument: true
                                            }
                                        })
                                    ]
                                })
                            ]
                        })
                    }
                    : undefined,
                footers: shouldShowPageNumbers(document)
                    ? {
                        default: new Footer({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({ text: "Página ", font: "Arial", size: 18 }),
                                        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18 }),
                                        new TextRun({ text: " de ", font: "Arial", size: 18 }),
                                        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18 })
                                    ]
                                })
                            ]
                        })
                    }
                    : undefined,
                children
            }
        ]
    });
    const blob = await Packer.toBlob(wordDocument);
    saveBlob(blob, documentFileName(document, "docx"));
}
function splitPdfText(pdf, text, maxWidth) {
    const lines = pdf.splitTextToSize(text, maxWidth);
    return Array.isArray(lines) ? lines.map(String) : [String(lines)];
}
async function downloadPdfDocument(document) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ format: "letter", unit: "pt" });
    const form = getRcDeliveredForm(document);
    const moneyForm = getMoneyReceiptForm(document);
    const isFormDocument = Boolean(form || moneyForm);
    const signatures = getDocumentSignatures(document);
    const signatureColumns = getSignatureColumnCount(document, signatures.length);
    const signatureRows = chunkItems(signatures, signatureColumns);
    const letterheadDataUrl = hasRusconiLetterhead(document) ? await fetchAssetDataUrl(rusconiLetterheadUrl) : null;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = letterheadDataUrl ? 72 : 54;
    const topLimit = letterheadDataUrl ? 112 : 72;
    const contentWidth = pageWidth - margin * 2;
    const bottomLimit = pageHeight - (letterheadDataUrl ? 126 : margin);
    let y = topLimit;
    function addLetterheadBackground() {
        if (!letterheadDataUrl)
            return;
        pdf.addImage(letterheadDataUrl, "JPEG", 0, 0, pageWidth, pageHeight);
    }
    function ensureSpace(height) {
        if (y + height <= bottomLimit)
            return;
        pdf.addPage();
        addLetterheadBackground();
        y = topLimit;
    }
    function addAlignedText(text, size, style, spaceAfter, align = "center") {
        pdf.setFont(isFormDocument ? "times" : "helvetica", style);
        pdf.setFontSize(size);
        const lines = splitPdfText(pdf, text, contentWidth);
        const lineHeight = size * 1.35;
        const x = align === "right" ? pageWidth - margin : pageWidth / 2;
        ensureSpace(lines.length * lineHeight + spaceAfter);
        pdf.text(lines, x, y, { align, maxWidth: contentWidth });
        y += lines.length * lineHeight + spaceAfter;
    }
    function addParagraph(text) {
        const isHeading = isDocumentStandaloneHeading(text);
        pdf.setFont("helvetica", isHeading ? "bold" : "normal");
        pdf.setFontSize(12);
        const lines = splitPdfText(pdf, text, contentWidth);
        const lineHeight = 18;
        ensureSpace(lines.length * lineHeight + 12);
        pdf.text(lines, isHeading ? pageWidth / 2 : margin, y, {
            align: isHeading ? "center" : "left",
            maxWidth: contentWidth
        });
        y += lines.length * lineHeight + 14;
    }
    addLetterheadBackground();
    addAlignedText(document.title.toUpperCase(), 18, "bold", form ? 22 : 36);
    if (document.subtitle) {
        addAlignedText(document.subtitle, 12, "bold", 44, getSubtitleAlignment(document));
    }
    if (form) {
        const tableWidth = contentWidth * 0.92;
        const tableX = margin + (contentWidth - tableWidth) / 2;
        const headerHeight = 34;
        const rowHeight = 32;
        const descriptionWidth = tableWidth * 0.5;
        const kindWidth = tableWidth * 0.25;
        function drawCenteredCellText(text, x, cellY, width, height, bold = false) {
            pdf.setFont("times", bold ? "bold" : "normal");
            pdf.setFontSize(12);
            const lines = splitPdfText(pdf, text, width - 12);
            const lineHeight = 13;
            const textY = cellY + height / 2 - ((lines.length - 1) * lineHeight) / 2 + 4;
            pdf.text(lines, x + width / 2, textY, { align: "center", maxWidth: width - 12 });
        }
        function drawDescriptionCell(text, x, cellY, width) {
            pdf.setFont("times", "normal");
            pdf.setFontSize(10);
            pdf.text(splitPdfText(pdf, text, width - 12), x + 6, cellY + 19, { maxWidth: width - 12 });
        }
        function drawDocumentKindCell(kind, isChecked, x, cellY, width) {
            const boxSize = 8;
            const label = receiptDocumentKindLabels[kind];
            pdf.setFont("times", "normal");
            pdf.setFontSize(9);
            const labelWidth = pdf.getTextWidth(label);
            const contentWidthForCell = boxSize + 4 + labelWidth;
            const boxX = x + Math.max(6, (width - contentWidthForCell) / 2);
            const boxY = cellY + rowHeight / 2 - boxSize / 2;
            pdf.rect(boxX, boxY, boxSize, boxSize);
            if (isChecked) {
                pdf.line(boxX + 1.5, boxY + 4.5, boxX + 3.5, boxY + 6.5);
                pdf.line(boxX + 3.5, boxY + 6.5, boxX + 7, boxY + 1.5);
            }
            pdf.text(label, boxX + boxSize + 4, cellY + rowHeight / 2 + 3, { maxWidth: width - boxSize - 14 });
        }
        ensureSpace(headerHeight + form.documentRows.length * rowHeight + 36);
        pdf.setDrawColor(17, 17, 17);
        pdf.setFillColor(217, 217, 217);
        pdf.rect(tableX, y, tableWidth, headerHeight, "FD");
        drawCenteredCellText(form.descriptionHeading, tableX, y, tableWidth, headerHeight, true);
        y += headerHeight;
        form.documentRows.forEach((row) => {
            const description = normalizeText(row.description);
            pdf.rect(tableX, y, descriptionWidth, rowHeight);
            pdf.rect(tableX + descriptionWidth, y, kindWidth, rowHeight);
            pdf.rect(tableX + descriptionWidth + kindWidth, y, kindWidth, rowHeight);
            if (description) {
                drawDescriptionCell(description, tableX, y, descriptionWidth);
                drawDocumentKindCell("original", row.kind === "original", tableX + descriptionWidth, y, kindWidth);
                drawDocumentKindCell("simple", row.kind === "simple", tableX + descriptionWidth + kindWidth, y, kindWidth);
            }
            y += rowHeight;
        });
        y += 52;
        ensureSpace(rowHeight * 3);
        const halfWidth = tableWidth / 2;
        pdf.setFillColor(217, 217, 217);
        pdf.rect(tableX, y, halfWidth, rowHeight, "FD");
        pdf.rect(tableX + halfWidth, y, halfWidth, rowHeight, "FD");
        drawCenteredCellText("NOMBRE DE QUIEN ENTREGA", tableX, y, halfWidth, rowHeight, true);
        drawCenteredCellText("FECHA", tableX + halfWidth, y, halfWidth, rowHeight, true);
        y += rowHeight;
        pdf.rect(tableX, y, halfWidth, rowHeight);
        pdf.rect(tableX + halfWidth, y, halfWidth, rowHeight);
        drawCenteredCellText(form.deliveredBy, tableX, y, halfWidth, rowHeight);
        drawCenteredCellText(form.date, tableX + halfWidth, y, halfWidth, rowHeight);
        y += rowHeight;
        pdf.setFillColor(217, 217, 217);
        pdf.rect(tableX, y, halfWidth, rowHeight, "FD");
        pdf.rect(tableX + halfWidth, y, halfWidth, rowHeight);
        drawCenteredCellText("NOMBRE DE QUIEN RECIBE", tableX, y, halfWidth, rowHeight, true);
        drawCenteredCellText(form.receivedBy, tableX + halfWidth, y, halfWidth, rowHeight);
        y += rowHeight;
        y += 56;
        ensureSpace(92);
        const signatureWidth = tableWidth * 0.58;
        const signatureX = tableX + (tableWidth - signatureWidth) / 2;
        const signatureCenter = tableX + tableWidth / 2;
        const receiverNameLines = splitPdfText(pdf, form.receivedBy || "Nombre de quien recibe", signatureWidth - 12);
        pdf.setDrawColor(17, 17, 17);
        pdf.line(signatureX, y, signatureX + signatureWidth, y);
        pdf.setFont("times", "bold");
        pdf.setFontSize(11);
        pdf.text(receiverNameLines, signatureCenter, y + 18, { align: "center", maxWidth: signatureWidth - 12 });
        pdf.setFontSize(10);
        pdf.text("Firma de quien recibe los documentos", signatureCenter, y + 24 + receiverNameLines.length * 12, {
            align: "center",
            maxWidth: signatureWidth - 12
        });
        y += 82;
    }
    if (moneyForm) {
        const tableWidth = contentWidth * 0.92;
        const tableX = margin + (contentWidth - tableWidth) / 2;
        const labelLineHeight = 19;
        const tableRowHeight = 24;
        function addMoneyLabeledLine(label, text, spaceAfter = 26) {
            pdf.setFont("times", "bold");
            pdf.setFontSize(13);
            const labelWidth = pdf.getTextWidth(label);
            const lines = splitPdfText(pdf, text, tableWidth - labelWidth - 4);
            ensureSpace(lines.length * labelLineHeight + spaceAfter);
            pdf.text(label, tableX, y);
            pdf.setFont("times", "normal");
            pdf.text(lines, tableX + labelWidth, y, { maxWidth: tableWidth - labelWidth - 4 });
            y += lines.length * labelLineHeight + spaceAfter;
        }
        function drawMoneyCell(text, x, cellY, width, height, bold = false) {
            pdf.setFont("times", bold ? "bold" : "normal");
            pdf.setFontSize(12);
            const lines = splitPdfText(pdf, text, width - 12);
            const lineHeight = 13;
            const textY = cellY + height / 2 - ((lines.length - 1) * lineHeight) / 2 + 4;
            pdf.text(lines, x + width / 2, textY, { align: "center", maxWidth: width - 12 });
        }
        y += 32;
        addMoneyLabeledLine("CONCEPTO: ", moneyForm.concept, 28);
        addMoneyLabeledLine("PAGO PARCIAL/PAGO TOTAL: ", moneyForm.paymentType, 28);
        addMoneyLabeledLine("MONTO: ", moneyForm.amount, 64);
        ensureSpace(tableRowHeight * 3);
        const halfWidth = tableWidth / 2;
        pdf.setDrawColor(17, 17, 17);
        pdf.setFillColor(217, 217, 217);
        pdf.rect(tableX, y, tableWidth, tableRowHeight, "FD");
        drawMoneyCell("PAGO RECIBIDO POR RUSCONI CONSULTING", tableX, y, tableWidth, tableRowHeight, true);
        y += tableRowHeight;
        pdf.setFillColor(217, 217, 217);
        pdf.rect(tableX, y, halfWidth, tableRowHeight, "FD");
        pdf.rect(tableX + halfWidth, y, halfWidth, tableRowHeight, "FD");
        drawMoneyCell("NOMBRE DE QUIEN RECIBE", tableX, y, halfWidth, tableRowHeight, true);
        drawMoneyCell("FECHA DE RECIBIDO", tableX + halfWidth, y, halfWidth, tableRowHeight, true);
        y += tableRowHeight;
        pdf.rect(tableX, y, halfWidth, tableRowHeight);
        pdf.rect(tableX + halfWidth, y, halfWidth, tableRowHeight);
        drawMoneyCell(moneyForm.receivedBy, tableX, y, halfWidth, tableRowHeight, true);
        drawMoneyCell(moneyForm.receivedDate, tableX + halfWidth, y, halfWidth, tableRowHeight, true);
        y += tableRowHeight;
        y += 48;
        ensureSpace(86);
        const moneySignatureWidth = tableWidth * 0.58;
        const moneySignatureX = tableX + (tableWidth - moneySignatureWidth) / 2;
        const moneySignatureCenter = tableX + tableWidth / 2;
        const receiverNameLines = splitPdfText(pdf, moneyForm.receivedBy || "Nombre de quien recibe", moneySignatureWidth - 12);
        pdf.setDrawColor(17, 17, 17);
        pdf.line(moneySignatureX, y, moneySignatureX + moneySignatureWidth, y);
        pdf.setFont("times", "bold");
        pdf.setFontSize(11);
        pdf.text(receiverNameLines, moneySignatureCenter, y + 18, { align: "center", maxWidth: moneySignatureWidth - 12 });
        pdf.setFontSize(10);
        pdf.text("Firma de quien recibe el dinero", moneySignatureCenter, y + 24 + receiverNameLines.length * 12, {
            align: "center",
            maxWidth: moneySignatureWidth - 12
        });
        y += 78;
    }
    document.paragraphs.forEach(addParagraph);
    if (document.details?.length) {
        const labelWidth = 140;
        const valueWidth = contentWidth - labelWidth;
        y += 8;
        document.details.forEach((detail) => {
            pdf.setFontSize(10);
            const labelLines = splitPdfText(pdf, detail.label, labelWidth - 18);
            const valueLines = splitPdfText(pdf, detail.value, valueWidth - 18);
            const rowHeight = Math.max(labelLines.length, valueLines.length) * 14 + 16;
            ensureSpace(rowHeight);
            pdf.setDrawColor(217, 226, 236);
            pdf.rect(margin, y, labelWidth, rowHeight);
            pdf.rect(margin + labelWidth, y, valueWidth, rowHeight);
            pdf.setFont("helvetica", "bold");
            pdf.text(labelLines, margin + 9, y + 18, { maxWidth: labelWidth - 18 });
            pdf.setFont("helvetica", "normal");
            pdf.text(valueLines, margin + labelWidth + 9, y + 18, { maxWidth: valueWidth - 18 });
            y += rowHeight;
        });
    }
    if (signatures.length) {
        ensureSpace(140);
        y += 72;
        signatureRows.forEach((row) => {
            const signatureWidth = contentWidth / signatureColumns;
            ensureSpace(112);
            row.forEach((signature, index) => {
                const left = margin + signatureWidth * index;
                const lineStart = left + 16;
                const lineEnd = left + signatureWidth - 16;
                const center = left + signatureWidth / 2;
                const nameLines = splitPdfText(pdf, signature.name, signatureWidth - 28);
                pdf.setDrawColor(23, 32, 51);
                pdf.line(lineStart, y, lineEnd, y);
                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(10);
                pdf.text(nameLines, center, y + 18, {
                    align: "center",
                    maxWidth: signatureWidth - 28
                });
                if (signature.role) {
                    pdf.setTextColor(82, 96, 109);
                    pdf.text(splitPdfText(pdf, signature.role, signatureWidth - 28), center, y + 22 + nameLines.length * 12, {
                        align: "center",
                        maxWidth: signatureWidth - 28
                    });
                    pdf.setTextColor(0, 0, 0);
                }
            });
            y += 112;
        });
    }
    if (shouldShowPageNumbers(document)) {
        const pageCount = pdf.getNumberOfPages();
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            pdf.setPage(pageNumber);
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(82, 96, 109);
            pdf.text(pageNumberLabel(pageNumber, pageCount), pageWidth / 2, pageHeight - 28, { align: "center" });
        }
        pdf.setTextColor(0, 0, 0);
    }
    pdf.save(documentFileName(document, "pdf"));
}
function DocumentPreview({ document }) {
    const form = getRcDeliveredForm(document);
    const moneyForm = getMoneyReceiptForm(document);
    const signatures = getDocumentSignatures(document);
    const signatureClassName = `daily-doc-signatures${document.signatureColumns === 2 ? " daily-doc-signatures-two-column" : ""}`;
    const paperClassName = `daily-doc-paper${hasRusconiLetterhead(document) ? " daily-doc-paper-letterhead" : ""}${form ? " daily-doc-paper-rc-receipt" : ""}${moneyForm ? " daily-doc-paper-money-receipt" : ""}`;
    return (_jsxs("article", { className: paperClassName, "aria-live": "polite", children: [_jsxs("header", { children: [_jsx("h3", { children: document.title }), document.subtitle ? (_jsx("span", { className: document.subtitleAlignment === "right" ? "daily-doc-subtitle-right" : undefined, children: document.subtitle })) : null] }), form ? (_jsxs("section", { className: "daily-doc-rc-delivered-form", children: [_jsxs("table", { className: "daily-doc-rc-docs-table", children: [_jsx("thead", { children: _jsx("tr", { children: _jsx("th", { colSpan: 3, children: form.descriptionHeading.split("\n").map((headingLine, index) => (_jsxs("span", { children: [index > 0 ? _jsx("br", {}) : null, headingLine] }, headingLine))) }) }) }), _jsx("tbody", { children: form.documentRows.map((row, index) => (_jsxs("tr", { children: [_jsx("td", { className: "daily-doc-rc-doc-description", children: row.description || "\u00A0" }), _jsx("td", { className: "daily-doc-rc-doc-kind", children: row.description ? (_jsxs(_Fragment, { children: [_jsx("span", { className: `daily-doc-checkbox${row.kind === "original" ? " is-checked" : ""}` }), receiptDocumentKindLabels.original] })) : ("\u00A0") }), _jsx("td", { className: "daily-doc-rc-doc-kind", children: row.description ? (_jsxs(_Fragment, { children: [_jsx("span", { className: `daily-doc-checkbox${row.kind === "simple" ? " is-checked" : ""}` }), receiptDocumentKindLabels.simple] })) : ("\u00A0") })] }, `${row.description}-${index}`))) })] }), _jsx("table", { className: "daily-doc-rc-meta-table", children: _jsxs("tbody", { children: [_jsxs("tr", { children: [_jsx("th", { children: "NOMBRE DE QUIEN ENTREGA" }), _jsx("th", { children: "FECHA" })] }), _jsxs("tr", { children: [_jsx("td", { children: form.deliveredBy }), _jsx("td", { children: form.date })] }), _jsxs("tr", { children: [_jsx("th", { children: "NOMBRE DE QUIEN RECIBE" }), _jsx("td", { children: form.receivedBy })] })] }) }), _jsxs("div", { className: "daily-doc-rc-receiver-signature", children: [_jsx("strong", { children: form.receivedBy || "Nombre de quien recibe" }), _jsx("em", { children: "Firma de quien recibe los documentos" })] })] })) : moneyForm ? (_jsxs("section", { className: "daily-doc-money-receipt-form", children: [_jsxs("div", { className: "daily-doc-money-receipt-lines", children: [_jsxs("p", { children: [_jsx("strong", { children: "CONCEPTO:" }), " ", moneyForm.concept] }), _jsxs("p", { children: [_jsx("strong", { children: "PAGO PARCIAL/PAGO TOTAL:" }), " ", moneyForm.paymentType] }), _jsxs("p", { children: [_jsx("strong", { children: "MONTO:" }), " ", moneyForm.amount] })] }), _jsxs("table", { className: "daily-doc-money-receipt-table", children: [_jsxs("thead", { children: [_jsx("tr", { children: _jsx("th", { colSpan: 2, children: "PAGO RECIBIDO POR RUSCONI CONSULTING" }) }), _jsxs("tr", { children: [_jsx("th", { children: "NOMBRE DE QUIEN RECIBE" }), _jsx("th", { children: "FECHA DE RECIBIDO" })] })] }), _jsx("tbody", { children: _jsxs("tr", { children: [_jsx("td", { children: moneyForm.receivedBy }), _jsx("td", { children: moneyForm.receivedDate })] }) })] }), _jsxs("div", { className: "daily-doc-money-receiver-signature", children: [_jsx("strong", { children: moneyForm.receivedBy || "Nombre de quien recibe" }), _jsx("em", { children: "Firma de quien recibe el dinero" })] })] })) : (_jsx("div", { className: "daily-doc-paper-body", children: document.paragraphs.map((paragraph, index) => (_jsx("p", { className: isDocumentStandaloneHeading(paragraph) ? "daily-doc-clause-heading" : undefined, children: paragraph }, `${paragraph}-${index}`))) })), document.details?.length ? (_jsx("dl", { className: "daily-doc-details", children: document.details.map((detail) => (_jsxs("div", { children: [_jsx("dt", { children: detail.label }), _jsx("dd", { children: detail.value })] }, detail.label))) })) : null, signatures.length ? (_jsx("footer", { className: signatureClassName, children: signatures.map((signature, index) => (_jsxs("div", { children: [_jsx("span", {}), _jsx("strong", { children: signature.name }), signature.role ? _jsx("em", { children: signature.role }) : null] }, `${signature.name}-${signature.role ?? ""}-${index}`))) })) : null, shouldShowPageNumbers(document) ? _jsx("div", { className: "daily-doc-page-number", children: pageNumberLabel(1, 1) }) : null] }));
}
export function DailyDocumentsPage() {
    const [activeTab, setActiveTab] = useState("generate");
    const [selectedTemplateId, setSelectedTemplateId] = useState(dailyDocumentTemplates[0].id);
    const selectedTemplate = findTemplate(selectedTemplateId);
    const [templateValues, setTemplateValues] = useState(() => dailyDocumentTemplates.reduce((values, template) => {
        values[template.id] = initialValuesForTemplate(template);
        return values;
    }, {}));
    const [clients, setClients] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [selectedClientId, setSelectedClientId] = useState("");
    const [clientSearch, setClientSearch] = useState("");
    const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
    const [assignmentTitle, setAssignmentTitle] = useState(dailyDocumentTemplates[0].title);
    const [editingDocumentId, setEditingDocumentId] = useState(null);
    const [assignedSearch, setAssignedSearch] = useState("");
    const [loadingModuleData, setLoadingModuleData] = useState(true);
    const [savingAssignment, setSavingAssignment] = useState(false);
    const [deletingDocumentId, setDeletingDocumentId] = useState(null);
    const [copyStatus, setCopyStatus] = useState("");
    const [flash, setFlash] = useState(null);
    const values = templateValues[selectedTemplate.id];
    const selectedClient = useMemo(() => clients.find((client) => client.id === selectedClientId) ?? null, [clients, selectedClientId]);
    const generatedDocument = useMemo(() => selectedTemplate.build(values), [selectedTemplate, values]);
    const generatedText = useMemo(() => generatedDocumentToText(generatedDocument), [generatedDocument]);
    const generatedHtml = useMemo(() => generatedDocumentToHtml(generatedDocument), [generatedDocument]);
    const filteredClientOptions = useMemo(() => {
        const terms = normalizeSearchText(clientSearch).split(/\s+/).filter(Boolean);
        if (!terms.length) {
            return clients.slice(0, 10);
        }
        return clients
            .filter((client) => {
            const searchContent = clientPickerSearchContent(client);
            return terms.every((term) => searchContent.includes(term));
        })
            .slice(0, 12);
    }, [clients, clientSearch]);
    const filteredAssignments = useMemo(() => {
        const term = normalizeText(assignedSearch).toLowerCase();
        if (!term) {
            return assignments;
        }
        return assignments.filter((assignment) => [
            assignment.title,
            assignment.templateTitle,
            assignment.clientName,
            assignment.clientNumber
        ].some((entry) => entry.toLowerCase().includes(term)));
    }, [assignments, assignedSearch]);
    const groupedAssignments = useMemo(() => groupAssignmentsByClient(filteredAssignments), [filteredAssignments]);
    async function loadModuleData() {
        setLoadingModuleData(true);
        setFlash(null);
        try {
            const [clientRows, assignmentRows] = await Promise.all([
                apiGet("/clients"),
                apiGet("/daily-documents")
            ]);
            setClients(sortClients(clientRows));
            setAssignments(sortAssignedDocuments(assignmentRows));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setLoadingModuleData(false);
        }
    }
    useEffect(() => {
        void loadModuleData();
    }, []);
    function selectTemplate(templateId) {
        const nextTemplate = findTemplate(templateId);
        setSelectedTemplateId(templateId);
        setAssignmentTitle(nextTemplate.title);
        setCopyStatus("");
    }
    function updateValue(fieldName, nextValue) {
        setTemplateValues((currentValues) => ({
            ...currentValues,
            [selectedTemplate.id]: {
                ...currentValues[selectedTemplate.id],
                [fieldName]: nextValue
            }
        }));
        setCopyStatus("");
    }
    function updateDocumentReceiptClientParty(fieldName, flagName, nextValue, useSelectedClient = false) {
        setTemplateValues((currentValues) => ({
            ...currentValues,
            [selectedTemplate.id]: {
                ...currentValues[selectedTemplate.id],
                [fieldName]: nextValue,
                [flagName]: useSelectedClient ? "true" : ""
            }
        }));
        setCopyStatus("");
    }
    function toggleDocumentReceiptClientParty(fieldName, flagName, checked) {
        if (checked && selectedClient) {
            updateDocumentReceiptClientParty(fieldName, flagName, selectedClient.name, true);
            return;
        }
        updateValue(flagName, "");
    }
    function updateAttorneyValue(fieldName, index, nextValue) {
        const rows = attorneyFormRows(values[fieldName] ?? "");
        rows[index] = nextValue;
        updateValue(fieldName, rows.join("\n"));
    }
    function addAttorneyField(fieldName) {
        updateValue(fieldName, [...attorneyFormRows(values[fieldName] ?? ""), ""].join("\n"));
    }
    function removeAttorneyField(fieldName, index) {
        const rows = attorneyFormRows(values[fieldName] ?? "").filter((_, rowIndex) => rowIndex !== index);
        updateValue(fieldName, (rows.length ? rows : [""]).join("\n"));
    }
    function updateReceiptDocument(fieldName, index, nextItem) {
        const rows = receiptDocumentItems(values[fieldName] ?? "");
        const currentRow = rows[index] ?? { description: "", kind: "original" };
        rows[index] = {
            ...currentRow,
            ...nextItem,
            kind: nextItem.kind ?? currentRow.kind
        };
        updateValue(fieldName, serializeReceiptDocumentItems(rows));
    }
    function addReceiptDocument(fieldName) {
        updateValue(fieldName, serializeReceiptDocumentItems([...receiptDocumentItems(values[fieldName] ?? ""), { description: "", kind: "original" }]));
    }
    function removeReceiptDocument(fieldName, index) {
        const rows = receiptDocumentItems(values[fieldName] ?? "").filter((_, rowIndex) => rowIndex !== index);
        updateValue(fieldName, serializeReceiptDocumentItems(rows.length ? rows : [{ description: "", kind: "original" }]));
    }
    function resetDraft() {
        const firstTemplate = dailyDocumentTemplates[0];
        setSelectedTemplateId(firstTemplate.id);
        setTemplateValues((currentValues) => ({
            ...currentValues,
            [firstTemplate.id]: initialValuesForTemplate(firstTemplate)
        }));
        setSelectedClientId("");
        setClientSearch("");
        setIsClientSearchOpen(false);
        setAssignmentTitle(firstTemplate.title);
        setEditingDocumentId(null);
        setCopyStatus("");
    }
    function payloadFromCurrentDraft() {
        return {
            templateId: selectedTemplate.id,
            templateTitle: selectedTemplate.title,
            title: normalizeText(assignmentTitle) || selectedTemplate.title,
            clientId: selectedClientId,
            values
        };
    }
    async function copyDocument() {
        try {
            await navigator.clipboard.writeText(generatedText);
            setCopyStatus("Documento copiado.");
        }
        catch {
            setCopyStatus("No se pudo copiar el documento.");
        }
    }
    function selectAssignmentClient(client) {
        setSelectedClientId(client.id);
        setClientSearch(clientPickerLabel(client));
        setIsClientSearchOpen(false);
        if (selectedTemplate.id === "rc-delivered-document-receipt" && values.useClientAsDocumentReceiver === "true") {
            updateDocumentReceiptClientParty("receivedBy", "useClientAsDocumentReceiver", client.name, true);
        }
        if (selectedTemplate.id === "rc-received-document-receipt" && values.useClientAsDocumentDeliverer === "true") {
            updateDocumentReceiptClientParty("deliveredBy", "useClientAsDocumentDeliverer", client.name, true);
        }
    }
    async function saveAssignment() {
        if (!normalizeText(selectedClientId)) {
            setFlash({ tone: "error", text: "Selecciona un cliente para asignar el documento." });
            return;
        }
        setSavingAssignment(true);
        setFlash(null);
        try {
            const payload = payloadFromCurrentDraft();
            const saved = editingDocumentId
                ? await apiPatch(`/daily-documents/${editingDocumentId}`, payload)
                : await apiPost("/daily-documents", payload);
            setAssignments((currentAssignments) => sortAssignedDocuments(currentAssignments.some((assignment) => assignment.id === saved.id)
                ? currentAssignments.map((assignment) => (assignment.id === saved.id ? saved : assignment))
                : [saved, ...currentAssignments]));
            setFlash({
                tone: "success",
                text: editingDocumentId ? "Documento actualizado correctamente." : "Documento asignado correctamente."
            });
            resetDraft();
            setActiveTab("assigned");
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setSavingAssignment(false);
        }
    }
    function editAssignment(assignment) {
        const template = findTemplate(assignment.templateId);
        setSelectedTemplateId(template.id);
        setTemplateValues((currentValues) => ({
            ...currentValues,
            [template.id]: mergeTemplateValues(template, assignment.values)
        }));
        setSelectedClientId(assignment.clientId);
        setClientSearch(`${assignment.clientNumber} - ${assignment.clientName}`);
        setIsClientSearchOpen(false);
        setAssignmentTitle(assignment.title);
        setEditingDocumentId(assignment.id);
        setCopyStatus("");
        setFlash({ tone: "success", text: "Documento cargado para modificacion." });
        setActiveTab("generate");
    }
    async function deleteAssignment(assignment) {
        if (!window.confirm(`Seguro que deseas borrar ${assignment.title} de ${assignment.clientName}?`)) {
            return;
        }
        setDeletingDocumentId(assignment.id);
        setFlash(null);
        try {
            await apiDelete(`/daily-documents/${assignment.id}`);
            setAssignments((currentAssignments) => currentAssignments.filter((entry) => entry.id !== assignment.id));
            if (editingDocumentId === assignment.id) {
                resetDraft();
            }
            setFlash({ tone: "success", text: "Documento asignado borrado correctamente." });
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
        finally {
            setDeletingDocumentId(null);
        }
    }
    function buildAssignmentDocument(assignment) {
        const template = findTemplate(assignment.templateId);
        return template.build(mergeTemplateValues(template, assignment.values));
    }
    async function downloadAssignmentWord(assignment) {
        setFlash(null);
        try {
            await downloadWordDocument(buildAssignmentDocument(assignment));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
    }
    async function downloadAssignmentPdf(assignment) {
        setFlash(null);
        try {
            await downloadPdfDocument(buildAssignmentDocument(assignment));
        }
        catch (error) {
            setFlash({ tone: "error", text: toErrorMessage(error) });
        }
    }
    async function handleWordDownload() {
        setCopyStatus("Generando Word...");
        try {
            await downloadWordDocument(generatedDocument);
            setCopyStatus("Word descargado.");
        }
        catch {
            setCopyStatus("No se pudo generar Word.");
        }
    }
    async function handlePdfDownload() {
        setCopyStatus("Generando PDF...");
        try {
            await downloadPdfDocument(generatedDocument);
            setCopyStatus("PDF descargado.");
        }
        catch {
            setCopyStatus("No se pudo generar PDF.");
        }
    }
    function printDocument() {
        const popup = window.open("", "_blank");
        if (!popup) {
            setCopyStatus("No se pudo abrir la vista de impresion.");
            return;
        }
        popup.document.write(generatedHtml);
        popup.document.close();
        popup.focus();
        popup.print();
    }
    return (_jsxs("section", { className: "page-stack daily-documents-page", children: [_jsxs("header", { className: "hero module-hero", children: [_jsxs("div", { className: "module-hero-head", children: [_jsx("span", { className: "module-hero-icon", "aria-hidden": "true", children: "Docs" }), _jsx("div", { children: _jsx("h2", { children: "Documentos de uso diario" }) })] }), _jsx("p", { className: "muted", children: "Generacion rapida de cartas poder, recibos y actas de entrega recepcion." })] }), flash ? (_jsx("div", { className: `message-banner ${flash.tone === "success" ? "message-success" : "message-error"}`, children: flash.text })) : null, _jsx("section", { className: "panel daily-doc-tabs-panel", children: _jsxs("div", { className: "leads-tabs daily-doc-tabs", role: "tablist", "aria-label": "Documentos de uso diario", children: [_jsxs("button", { "aria-selected": activeTab === "generate", className: `lead-tab ${activeTab === "generate" ? "is-active" : ""}`, onClick: () => setActiveTab("generate"), type: "button", children: ["Generar y asignar (", dailyDocumentTemplates.length, ")"] }), _jsxs("button", { "aria-selected": activeTab === "assigned", className: `lead-tab ${activeTab === "assigned" ? "is-active" : ""}`, onClick: () => setActiveTab("assigned"), type: "button", children: ["Documentos asignados (", assignments.length, ")"] })] }) }), activeTab === "generate" ? (_jsxs("section", { className: "daily-documents-layout", children: [_jsxs("div", { className: "daily-documents-controls", children: [_jsxs("section", { className: "panel daily-doc-template-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Plantillas" }), _jsxs("span", { children: [dailyDocumentTemplates.length, " disponibles"] })] }), _jsx("div", { className: "daily-doc-template-list", role: "listbox", "aria-label": "Plantillas de documentos", children: dailyDocumentTemplates.map((template) => (_jsxs("button", { "aria-selected": template.id === selectedTemplate.id, className: `daily-doc-template-option${template.id === selectedTemplate.id ? " is-active" : ""}`, onClick: () => selectTemplate(template.id), type: "button", children: [_jsx("strong", { children: template.shortTitle }), _jsx("span", { children: template.summary })] }, template.id))) })] }), _jsxs("section", { className: "panel daily-doc-form-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: selectedTemplate.title }), _jsx("span", { className: "status-pill status-live", children: editingDocumentId ? "Editando" : "Operativo" })] }), _jsxs("div", { className: "daily-doc-field-grid", children: [_jsxs("div", { className: "form-field daily-doc-field-wide daily-doc-client-search", children: [_jsx("span", { children: "Cliente asignado" }), _jsx("input", { "aria-autocomplete": "list", "aria-expanded": isClientSearchOpen, "aria-label": "Buscar cliente asignado", disabled: loadingModuleData || savingAssignment, onBlur: () => setIsClientSearchOpen(false), onChange: (event) => {
                                                            setClientSearch(event.target.value);
                                                            setSelectedClientId("");
                                                            setIsClientSearchOpen(true);
                                                        }, onFocus: () => setIsClientSearchOpen(true), onKeyDown: (event) => {
                                                            if (event.key === "Enter" && filteredClientOptions[0]) {
                                                                event.preventDefault();
                                                                selectAssignmentClient(filteredClientOptions[0]);
                                                            }
                                                        }, placeholder: "Buscar por nombre o numero de cliente...", role: "combobox", type: "text", value: clientSearch }), isClientSearchOpen && !loadingModuleData && !savingAssignment ? (_jsx("div", { className: "daily-doc-client-search-results", role: "listbox", "aria-label": "Resultados de clientes", children: filteredClientOptions.length ? (filteredClientOptions.map((client) => (_jsxs("button", { "aria-selected": selectedClientId === client.id, onClick: () => selectAssignmentClient(client), onMouseDown: (event) => event.preventDefault(), type: "button", children: [_jsx("strong", { children: client.clientNumber }), _jsx("span", { children: client.name })] }, client.id)))) : (_jsx("div", { className: "daily-doc-client-search-empty", children: "Sin clientes que coincidan con la busqueda." })) })) : null, _jsx("input", { "aria-hidden": "true", disabled: loadingModuleData || savingAssignment, readOnly: true, tabIndex: -1, type: "hidden", value: selectedClientId })] }), _jsxs("label", { className: "form-field daily-doc-field-wide", children: [_jsx("span", { children: "Nombre del documento asignado" }), _jsx("input", { disabled: savingAssignment, onChange: (event) => setAssignmentTitle(event.target.value), placeholder: "Nombre para ubicarlo en la pesta\u00F1a de asignados", type: "text", value: assignmentTitle })] }), selectedTemplate.id === "rc-delivered-document-receipt" ? (_jsxs("label", { className: "daily-doc-client-paid-toggle daily-doc-field-wide checkbox-row", children: [_jsx("input", { checked: values.useClientAsDocumentReceiver === "true", disabled: savingAssignment || !selectedClient, onChange: (event) => toggleDocumentReceiptClientParty("receivedBy", "useClientAsDocumentReceiver", event.target.checked), type: "checkbox" }), _jsxs("span", { children: ["Usar el nombre del cliente asignado como persona que recibe los documentos", selectedClient ? ` (${selectedClient.name})` : ""] })] })) : null, selectedTemplate.id === "rc-received-document-receipt" ? (_jsxs("label", { className: "daily-doc-client-paid-toggle daily-doc-field-wide checkbox-row", children: [_jsx("input", { checked: values.useClientAsDocumentDeliverer === "true", disabled: savingAssignment || !selectedClient, onChange: (event) => toggleDocumentReceiptClientParty("deliveredBy", "useClientAsDocumentDeliverer", event.target.checked), type: "checkbox" }), _jsxs("span", { children: ["Usar el nombre del cliente asignado como persona que entrega los documentos", selectedClient ? ` (${selectedClient.name})` : ""] })] })) : null, selectedTemplate.fields.map((field) => {
                                                if (field.visibleWhen && values[field.visibleWhen.name] !== field.visibleWhen.value) {
                                                    return null;
                                                }
                                                if (field.type === "grantor-type") {
                                                    return (_jsxs("div", { className: "form-field daily-doc-field-wide daily-doc-grantor-type-field", children: [_jsx("span", { children: field.label }), _jsx("div", { className: "daily-doc-grantor-type-toggle", role: "radiogroup", "aria-label": field.label, children: ["physical", "moral"].map((grantorType) => (_jsx("button", { "aria-checked": (values[field.name] || "physical") === grantorType, className: (values[field.name] || "physical") === grantorType ? "is-active" : "", disabled: savingAssignment, onClick: () => updateValue(field.name, grantorType), role: "radio", type: "button", children: grantorTypeLabels[grantorType] }, grantorType))) })] }, field.name));
                                                }
                                                if (field.type === "document-list") {
                                                    const documentRows = receiptDocumentItems(values[field.name] ?? "");
                                                    return (_jsxs("div", { className: "form-field daily-doc-field-wide daily-doc-receipt-doc-list", children: [_jsxs("div", { className: "daily-doc-receipt-doc-list-head", children: [_jsx("span", { children: field.label }), _jsx("button", { className: "secondary-button", disabled: savingAssignment, onClick: () => addReceiptDocument(field.name), type: "button", children: "+ Agregar otro documento" })] }), _jsx("div", { className: "daily-doc-receipt-doc-rows", children: documentRows.map((row, index) => (_jsxs("div", { className: "daily-doc-receipt-doc-row", children: [_jsxs("label", { className: "form-field daily-doc-receipt-doc-description", children: [_jsxs("span", { children: ["Documento ", index + 1] }), _jsx("input", { disabled: savingAssignment, onChange: (event) => updateReceiptDocument(field.name, index, { description: event.target.value }), placeholder: field.placeholder, type: "text", value: row.description })] }), _jsx("div", { className: "daily-doc-receipt-doc-kind", role: "group", "aria-label": `Tipo del documento ${index + 1}`, children: ["original", "simple"].map((kind) => (_jsxs("label", { className: "checkbox-row", children: [_jsx("input", { checked: row.kind === kind, disabled: savingAssignment, onChange: (event) => {
                                                                                            if (event.target.checked) {
                                                                                                updateReceiptDocument(field.name, index, { kind });
                                                                                            }
                                                                                        }, type: "checkbox" }), _jsx("span", { children: receiptDocumentKindLabels[kind] })] }, kind))) }), documentRows.length > 1 ? (_jsx("button", { className: "danger-button", disabled: savingAssignment, onClick: () => removeReceiptDocument(field.name, index), type: "button", children: "Quitar" })) : null] }, `${field.name}-${index}`))) })] }, field.name));
                                                }
                                                if (field.type === "payment-type") {
                                                    return (_jsxs("label", { className: "form-field", children: [_jsx("span", { children: field.label }), _jsxs("select", { disabled: savingAssignment, onChange: (event) => updateValue(field.name, event.target.value), value: values[field.name] ?? "Pago total", children: [_jsx("option", { value: "Pago total", children: "Pago total" }), _jsx("option", { value: "Pago parcial", children: "Pago parcial" })] })] }, field.name));
                                                }
                                                if (field.type === "attorneys") {
                                                    const attorneyRows = attorneyFormRows(values[field.name] ?? "");
                                                    return (_jsxs("div", { className: "form-field daily-doc-field-wide daily-doc-attorney-list", children: [_jsxs("div", { className: "daily-doc-attorney-list-head", children: [_jsx("span", { children: field.label }), _jsx("button", { className: "secondary-button daily-doc-add-attorney", disabled: savingAssignment, onClick: () => addAttorneyField(field.name), type: "button", children: "+ Agregar apoderado" })] }), _jsx("div", { className: "daily-doc-attorney-rows", children: attorneyRows.map((attorney, index) => (_jsxs("div", { className: "daily-doc-attorney-row", children: [_jsxs("label", { className: "form-field", children: [_jsxs("span", { children: ["Apoderado ", index + 1] }), _jsx("input", { disabled: savingAssignment, onChange: (event) => updateAttorneyValue(field.name, index, event.target.value), placeholder: field.placeholder, type: "text", value: attorney })] }), attorneyRows.length > 1 ? (_jsx("button", { className: "danger-button", disabled: savingAssignment, onClick: () => removeAttorneyField(field.name, index), type: "button", children: "Quitar" })) : null] }, `${field.name}-${index}`))) })] }, field.name));
                                                }
                                                return (_jsxs("label", { className: `form-field${field.type === "textarea" ? " daily-doc-field-wide" : ""}`, children: [_jsx("span", { children: field.label }), field.type === "textarea" ? (_jsx("textarea", { disabled: savingAssignment, onChange: (event) => updateValue(field.name, event.target.value), placeholder: field.placeholder, value: values[field.name] ?? "" })) : (_jsx("input", { disabled: savingAssignment, onChange: (event) => {
                                                                if (selectedTemplate.id === "rc-delivered-document-receipt" && field.name === "receivedBy") {
                                                                    updateDocumentReceiptClientParty("receivedBy", "useClientAsDocumentReceiver", event.target.value);
                                                                    return;
                                                                }
                                                                if (selectedTemplate.id === "rc-received-document-receipt" && field.name === "deliveredBy") {
                                                                    updateDocumentReceiptClientParty("deliveredBy", "useClientAsDocumentDeliverer", event.target.value);
                                                                    return;
                                                                }
                                                                updateValue(field.name, event.target.value);
                                                            }, placeholder: field.placeholder, type: field.type ?? "text", value: values[field.name] ?? "" }))] }, field.name));
                                            })] }), _jsxs("div", { className: "daily-doc-save-actions", children: [_jsx("button", { className: "primary-button", disabled: savingAssignment, onClick: () => void saveAssignment(), type: "button", children: savingAssignment ? "Guardando..." : editingDocumentId ? "Guardar cambios" : "Asignar a cliente" }), editingDocumentId ? (_jsx("button", { className: "secondary-button", disabled: savingAssignment, onClick: resetDraft, type: "button", children: "Cancelar edicion" })) : null] })] })] }), _jsxs("section", { className: "panel daily-doc-preview-panel", children: [_jsxs("div", { className: "panel-header daily-doc-preview-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Vista previa" }), copyStatus ? _jsx("span", { children: copyStatus }) : null] }), _jsxs("div", { className: "daily-doc-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => void copyDocument(), type: "button", children: "Copiar" }), _jsx("button", { className: "secondary-button", onClick: printDocument, type: "button", children: "Imprimir" }), _jsx("button", { className: "secondary-button", onClick: () => void handleWordDownload(), type: "button", children: "Word" }), _jsx("button", { className: "primary-button", onClick: () => void handlePdfDownload(), type: "button", children: "PDF" })] })] }), _jsx(DocumentPreview, { document: generatedDocument })] })] })) : (_jsxs("section", { className: "panel daily-doc-assigned-panel", children: [_jsxs("div", { className: "panel-header daily-doc-assigned-head", children: [_jsxs("div", { children: [_jsx("h3", { children: "Documentos asignados" }), _jsxs("span", { children: [filteredAssignments.length, " de ", assignments.length] })] }), _jsxs("div", { className: "daily-doc-assigned-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => void loadModuleData(), type: "button", children: "Refrescar" }), _jsx("button", { className: "primary-button", onClick: () => {
                                            resetDraft();
                                            setActiveTab("generate");
                                        }, type: "button", children: "Nuevo documento" })] })] }), _jsxs("label", { className: "form-field daily-doc-assigned-search", children: [_jsx("span", { children: "Buscar" }), _jsx("input", { onChange: (event) => setAssignedSearch(event.target.value), placeholder: "Buscar por cliente, numero o documento...", type: "search", value: assignedSearch })] }), loadingModuleData ? (_jsx("div", { className: "centered-inline-message", children: "Cargando documentos..." })) : filteredAssignments.length === 0 ? (_jsx("div", { className: "centered-inline-message", children: "No hay documentos asignados." })) : (_jsx("div", { className: "daily-doc-assigned-groups", children: groupedAssignments.map((group) => (_jsxs("section", { className: "daily-doc-client-group", children: [_jsxs("div", { className: "daily-doc-client-group-head", children: [_jsxs("div", { className: "daily-doc-client-group-title", children: [_jsx("strong", { children: group.clientNumber }), _jsx("span", { children: group.clientName })] }), _jsxs("span", { children: [group.assignments.length, " documento", group.assignments.length === 1 ? "" : "s"] })] }), _jsx("div", { className: "daily-doc-assigned-table-shell", children: _jsxs("table", { className: "data-table daily-doc-assigned-table daily-doc-assigned-group-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Documento" }), _jsx("th", { children: "Plantilla" }), _jsx("th", { children: "Actualizado" }), _jsx("th", { children: "Acciones" })] }) }), _jsx("tbody", { children: group.assignments.map((assignment) => (_jsxs("tr", { children: [_jsx("td", { children: assignment.title }), _jsx("td", { children: assignment.templateTitle }), _jsx("td", { children: new Date(assignment.updatedAt).toLocaleDateString("es-MX") }), _jsx("td", { children: _jsxs("div", { className: "table-actions", children: [_jsx("button", { className: "secondary-button", onClick: () => editAssignment(assignment), type: "button", children: "Modificar" }), _jsx("button", { className: "secondary-button", onClick: () => void downloadAssignmentWord(assignment), type: "button", children: "Word" }), _jsx("button", { className: "secondary-button", onClick: () => void downloadAssignmentPdf(assignment), type: "button", children: "PDF" }), _jsx("button", { className: "danger-button", disabled: deletingDocumentId === assignment.id, onClick: () => void deleteAssignment(assignment), type: "button", children: deletingDocumentId === assignment.id ? "Borrando..." : "Borrar" })] }) })] }, assignment.id))) })] }) })] }, group.clientId))) }))] }))] }));
}
