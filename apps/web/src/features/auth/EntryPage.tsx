import { Link } from "react-router-dom";
import { APP_VERSION_TEXT } from "@sige/contracts";

import { useAuth } from "./AuthContext";
import intellilawLogo from "../../assets/intellilaw-logo.svg";
import legalFlowLogo from "../../assets/legalflow-logo.svg";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";

export function EntryPage() {
  const { user } = useAuth();
  const activePath = user ? "/app" : "/intranet-login";

  return (
    <main className="entry-page">
      <div className="entry-shell">
        <section className="entry-card">
          <div className="entry-accent" aria-hidden="true" />

          <div className="entry-brand">
            <div className="entry-brand-logo-shell">
              <img className="entry-brand-logo" src={intellilawLogo} alt="Logo Intellilaw" />
            </div>
            <p className="entry-brand-name">INTELLILAW</p>
          </div>

          <h1 className="entry-title">SIGE</h1>
          <p className="entry-version">{APP_VERSION_TEXT}</p>
          <p className="entry-subtitle">Sistema Integral de Administracion Empresarial</p>

          <div className="entry-actions">
            <div className="entry-option">
              <div className="entry-option-logo-shell">
                <img className="entry-option-logo" src={intellilawLogo} alt="Intellilaw" />
              </div>
              <button
                type="button"
                className="entry-button entry-button-disabled"
                disabled
                aria-disabled="true"
                title="El acceso de Intellilaw estara disponible proximamente."
              >
                Acceso Intellilaw
              </button>
            </div>

            <div className="entry-option">
              <div className="entry-option-logo-shell">
                <img className="entry-option-logo" src={legalFlowLogo} alt="LegalFlow" />
              </div>
              <button
                type="button"
                className="entry-button entry-button-disabled"
                disabled
                aria-disabled="true"
                title="El acceso de LegalFlow estara disponible proximamente."
              >
                Acceso LegalFlow
              </button>
            </div>

            <div className="entry-option">
              <div className="entry-option-logo-shell">
                <img className="rusconi-logo entry-option-logo" src={rusconiLogo} alt="Rusconi Consulting" />
              </div>
              <Link to={activePath} className="entry-button entry-button-primary">
                Acceso Rusconi Consulting
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
