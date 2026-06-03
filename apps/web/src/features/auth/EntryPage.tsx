import { Link } from "react-router-dom";
import {
  APP_PRODUCT_NAME,
  APP_PRODUCT_SUBTITLE,
  APP_VERSION_TEXT,
  ORGANIZATION_PROFILES_BY_SLUG,
  ORGANIZATION_SLUGS,
  getOrganizationAccessLabel
} from "@sige/contracts";

import { useAuth } from "./AuthContext";
import intellilawLogo from "../../assets/intellilaw-logo.svg";
import legalFlowLogo from "../../assets/legalflow-logo.svg";
import rusconiLogo from "../../assets/rusconi-logo-2025.jpg";

export function EntryPage() {
  const { user } = useAuth();
  const intellilawOrganization = ORGANIZATION_PROFILES_BY_SLUG[ORGANIZATION_SLUGS.INTELLILAW];
  const legalFlowOrganization = ORGANIZATION_PROFILES_BY_SLUG[ORGANIZATION_SLUGS.LEGALFLOW];
  const rusconiOrganization = ORGANIZATION_PROFILES_BY_SLUG[ORGANIZATION_SLUGS.RUSCONI_CONSULTING];
  const getAccessPath = (organizationSlug: string) =>
    user?.organizationSlug === organizationSlug ? "/app" : `/intranet-login?organization=${organizationSlug}`;

  return (
    <main className="entry-page">
      <div className="entry-shell">
        <section className="entry-card">
          <div className="entry-accent" aria-hidden="true" />

          <div className="entry-brand">
            <div className="entry-brand-logo-shell">
              <img className="entry-brand-logo" src={intellilawLogo} alt={`Logo ${intellilawOrganization.name}`} />
            </div>
            <p className="entry-brand-name">{intellilawOrganization.name.toUpperCase()}</p>
          </div>

          <h1 className="entry-title">{APP_PRODUCT_NAME}</h1>
          <p className="entry-version">{APP_VERSION_TEXT}</p>
          <p className="entry-subtitle">{APP_PRODUCT_SUBTITLE}</p>

          <div className="entry-actions">
            <div className="entry-option">
              <div className="entry-option-logo-shell">
                <img className="entry-option-logo" src={intellilawLogo} alt={intellilawOrganization.name} />
              </div>
              <Link to={getAccessPath(intellilawOrganization.slug)} className="entry-button entry-button-primary">
                {getOrganizationAccessLabel(intellilawOrganization)}
              </Link>
            </div>

            <div className="entry-option">
              <div className="entry-option-logo-shell">
                <img className="entry-option-logo" src={legalFlowLogo} alt={legalFlowOrganization.name} />
              </div>
              <Link to={getAccessPath(legalFlowOrganization.slug)} className="entry-button entry-button-primary">
                {getOrganizationAccessLabel(legalFlowOrganization)}
              </Link>
            </div>

            <div className="entry-option">
              <div className="entry-option-logo-shell">
                <img className="rusconi-logo entry-option-logo" src={rusconiLogo} alt={rusconiOrganization.name} />
              </div>
              <Link to={getAccessPath(rusconiOrganization.slug)} className="entry-button entry-button-primary">
                {getOrganizationAccessLabel(rusconiOrganization)}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
