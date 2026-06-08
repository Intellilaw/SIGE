import { jsx as _jsx } from "react/jsx-runtime";
import { ORGANIZATION_SLUGS } from "@sige/contracts";
import { useAuth } from "../auth/AuthContext";
import { DocumentLibraryPage } from "./DocumentLibraryPage";
const DOCS_BASE_PATH = "/docs/terceros";
const LEGALFLOW_DOCS_BASE_PATH = `${DOCS_BASE_PATH}/legalflow`;
function resolveDocsBasePath(organizationSlug) {
    if (organizationSlug === ORGANIZATION_SLUGS.LEGALFLOW) {
        return LEGALFLOW_DOCS_BASE_PATH;
    }
    return DOCS_BASE_PATH;
}
export function ThirdPartyDocumentsPage() {
    const { user } = useAuth();
    const docsBasePath = resolveDocsBasePath(user?.organizationSlug);
    return (_jsx(DocumentLibraryPage, { basePath: docsBasePath, description: "Biblioteca de descarga para documentos externos en PDF, Word, PowerPoint y Excel.", iconLabel: "Documentos", pageClassName: "third-party-documents-page", title: "Documentos para terceros" }));
}
