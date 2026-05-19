import { apiGet } from "../../api/http-client";
const FALLBACK_ERROR_MESSAGE = "No se pudo abrir Manager de escritos.";
function getErrorMessage(reason) {
    return reason instanceof Error ? reason.message : FALLBACK_ERROR_MESSAGE;
}
function writeWindowMessage(targetWindow, title, message) {
    try {
        const { document } = targetWindow;
        const main = document.createElement("main");
        const heading = document.createElement("h1");
        const paragraph = document.createElement("p");
        document.title = title;
        main.style.cssText =
            "font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #102a43;";
        heading.style.cssText = "font-size: 24px; margin: 0 0 12px;";
        paragraph.style.cssText = "font-size: 16px; line-height: 1.5; margin: 0;";
        heading.textContent = title;
        paragraph.textContent = message;
        main.append(heading, paragraph);
        document.body.replaceChildren(main);
    }
    catch {
        // The new window may already be navigating away.
    }
}
export async function openBriefManagerWindow() {
    const managerWindow = window.open("about:blank", "_blank");
    if (!managerWindow) {
        throw new Error("Permite ventanas emergentes para abrir Manager de escritos.");
    }
    writeWindowMessage(managerWindow, "Manager de escritos", "Abriendo Manager de escritos...");
    try {
        const response = await apiGet("/auth/sso/manager-de-escritos");
        managerWindow.opener = null;
        managerWindow.location.replace(response.redirectUrl);
    }
    catch (reason) {
        const message = getErrorMessage(reason);
        writeWindowMessage(managerWindow, "Manager de escritos", message);
        throw new Error(message);
    }
}
export function reportBriefManagerOpenError(reason) {
    window.alert(getErrorMessage(reason));
}
