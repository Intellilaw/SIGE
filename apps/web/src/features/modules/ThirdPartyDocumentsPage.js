import { jsx as _jsx } from "react/jsx-runtime";
import { DocumentLibraryPage } from "./DocumentLibraryPage";
const DOCS_BASE_PATH = "/docs/terceros";
export function ThirdPartyDocumentsPage() {
    return (_jsx(DocumentLibraryPage, { basePath: DOCS_BASE_PATH, description: "Biblioteca de descarga para documentos externos en PDF, Word, PowerPoint y Excel.", iconLabel: "Documentos", pageClassName: "third-party-documents-page", title: "Documentos para terceros" }));
}
