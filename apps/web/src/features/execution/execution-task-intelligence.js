export const CREATE_TASKS_RI_CONNECTION_ID = "RI-002";
const DUPLICATE_TASK_THRESHOLD = 0.62;
const duplicateTaskStopWords = new Set([
    "a",
    "al",
    "ante",
    "con",
    "contra",
    "de",
    "del",
    "el",
    "en",
    "la",
    "las",
    "lo",
    "los",
    "para",
    "por",
    "que",
    "se",
    "sin",
    "sobre",
    "su",
    "sus",
    "un",
    "una",
    "unos",
    "unas",
    "vs",
    "versus",
    "tarea",
    "realizar",
    "hacer",
    "preparar",
    "presentar",
    "promover",
    "interponer",
    "solicitar",
    "generar",
    "registrar"
]);
const duplicateTaskPhraseExpansions = [
    ["orden de aprehension", "detencion captura arresto"],
    ["orden aprehension", "detencion captura arresto"],
    ["orden de captura", "aprehension detencion arresto"],
    ["privacion de libertad", "detencion arresto aprehension"],
    ["amparo indirecto", "amparo constitucional"],
    ["medio de defensa", "recurso impugnacion"],
    ["contestacion de demanda", "respuesta demanda"],
    ["termino judicial", "plazo vencimiento"]
];
const duplicateTaskSynonymGroups = [
    ["amparo", "constitucional"],
    ["aprehension", "detencion", "captura", "arresto"],
    ["demanda", "accion", "juicio", "reclamacion"],
    ["contestacion", "respuesta"],
    ["escrito", "promocion", "peticion"],
    ["recurso", "apelacion", "impugnacion", "revision"],
    ["audiencia", "comparecencia", "diligencia"],
    ["notificacion", "emplazamiento", "citacion", "aviso"],
    ["vencimiento", "termino", "plazo"],
    ["pago", "cobro", "liquidacion"],
    ["convenio", "acuerdo", "transaccion"],
    ["prueba", "evidencia", "documental"],
    ["sentencia", "resolucion", "fallo"],
    ["medida", "cautelar", "suspension"]
];
function normalizeEventSearch(value) {
    return (value ?? "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}
function normalizeSemanticTaskText(value) {
    return normalizeEventSearch(value)
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function getCanonicalTaskToken(token) {
    if (token.startsWith("apreh"))
        return "aprehension";
    if (token.startsWith("deten"))
        return "detencion";
    if (token.startsWith("captur"))
        return "captura";
    if (token.startsWith("arrest"))
        return "arresto";
    if (token.startsWith("ampar"))
        return "amparo";
    if (token.startsWith("constit"))
        return "constitucional";
    if (token.startsWith("demand"))
        return "demanda";
    if (token.startsWith("contest"))
        return "contestacion";
    if (token.startsWith("respond"))
        return "respuesta";
    if (token.startsWith("promoc"))
        return "promocion";
    if (token.startsWith("apel"))
        return "apelacion";
    if (token.startsWith("impugn"))
        return "impugnacion";
    if (token.startsWith("notific"))
        return "notificacion";
    if (token.startsWith("emplaz"))
        return "emplazamiento";
    if (token.startsWith("venc"))
        return "vencimiento";
    if (token.startsWith("termin"))
        return "termino";
    if (token.startsWith("cautel"))
        return "cautelar";
    if (token.startsWith("suspend"))
        return "suspension";
    return token;
}
function getSemanticTaskTokens(value) {
    let text = normalizeSemanticTaskText(value);
    for (const [phrase, expansion] of duplicateTaskPhraseExpansions) {
        if (text.includes(phrase)) {
            text = `${text} ${expansion}`;
        }
    }
    const tokens = text
        .split(" ")
        .map(getCanonicalTaskToken)
        .filter((token) => token.length > 2 && !duplicateTaskStopWords.has(token));
    const expanded = new Set(tokens);
    for (const token of tokens) {
        const group = duplicateTaskSynonymGroups.find((synonyms) => synonyms.includes(token));
        group?.forEach((synonym) => expanded.add(synonym));
    }
    return expanded;
}
function calculateSemanticTaskSimilarity(left, right) {
    const leftText = normalizeSemanticTaskText(left);
    const rightText = normalizeSemanticTaskText(right);
    if (!leftText || !rightText) {
        return 0;
    }
    if (leftText === rightText) {
        return 1;
    }
    if ((leftText.length > 8 || rightText.length > 8) && (leftText.includes(rightText) || rightText.includes(leftText))) {
        return 0.9;
    }
    const leftTokens = getSemanticTaskTokens(left);
    const rightTokens = getSemanticTaskTokens(right);
    if (leftTokens.size === 0 || rightTokens.size === 0) {
        return 0;
    }
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    if (overlap === 0) {
        return 0;
    }
    const shorterOverlap = overlap / Math.min(leftTokens.size, rightTokens.size);
    const dice = (2 * overlap) / (leftTokens.size + rightTokens.size);
    const contextualScore = shorterOverlap * 0.72 + dice * 0.28;
    const overlapBoost = overlap >= 3 ? 0.08 : overlap >= 2 ? 0.04 : 0;
    return Math.min(1, contextualScore + overlapBoost);
}
function getCandidateTaskNames(selectedEvent, targets) {
    const names = new Set();
    for (const target of targets) {
        const targetName = target.taskName.trim() || selectedEvent?.name.trim() || "";
        if (targetName) {
            names.add(targetName);
        }
    }
    if (names.size === 0 && selectedEvent?.name.trim()) {
        names.add(selectedEvent.name.trim());
    }
    return [...names];
}
function isActiveDuplicateCandidate(task) {
    const normalizedState = normalizeEventSearch(task.state);
    return normalizedState !== "completed" && normalizedState !== "concluida" && normalizedState !== "presentado";
}
export function findDuplicateTaskMatch(selectedEvent, targets, tasks) {
    const candidateNames = getCandidateTaskNames(selectedEvent, targets);
    const activeTasks = tasks.filter((task) => isActiveDuplicateCandidate(task) && !task.isMatterFallback);
    let bestMatch = null;
    for (const candidateName of candidateNames) {
        for (const task of activeTasks) {
            const existingTaskName = (task.subject || task.trackLabel || "").trim();
            const existingTaskTrack = (task.trackLabel || task.subject || "Tarea vigente").trim();
            const score = calculateSemanticTaskSimilarity(candidateName, existingTaskName);
            if (score < DUPLICATE_TASK_THRESHOLD) {
                continue;
            }
            if (!bestMatch || score > bestMatch.score) {
                bestMatch = {
                    candidateName,
                    existingTaskName,
                    existingTaskTrack,
                    score
                };
            }
        }
    }
    return bestMatch;
}
