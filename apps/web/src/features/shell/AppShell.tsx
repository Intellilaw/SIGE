import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { APP_VERSION_LABEL, buildDisplayName } from "@sige/contracts";

import { getNavigationForUser } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { useModuleAvailability } from "../modules/ModuleAvailabilityContext";
import { openBriefManagerWindow, reportBriefManagerOpenError } from "../modules/openBriefManagerWindow";

function looksLikeHandle(value: string) {
  return /[@._-]/.test(value);
}

function getSidebarUserName(user: ReturnType<typeof useAuth>["user"]) {
  const displayName = user?.displayName?.trim();
  const username = user?.username?.trim();
  const email = user?.email?.trim();

  if (displayName && !looksLikeHandle(displayName)) {
    return displayName;
  }

  return buildDisplayName(username || displayName || email || "Usuario");
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { disabledModuleIds } = useModuleAvailability();
  const navigate = useNavigate();
  const sidebarUserName = getSidebarUserName(user);
  const navigation = getNavigationForUser(user, disabledModuleIds);

  const handleOpenBriefManager = () => {
    const openingBriefManager = openBriefManagerWindow().catch(reportBriefManagerOpenError);
    navigate("/app", { replace: true });
    void openingBriefManager;
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="nav-section">
          <nav className="nav-list">
            {navigation.map((item) => {
              if (item.path === "/app/brief-manager") {
                return (
                  <button key={item.path} type="button" className="nav-link nav-link-button" onClick={handleOpenBriefManager}>
                    <span className="nav-link-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="nav-link-label">{item.label}</span>
                  </button>
                );
              }

              return (
                <NavLink key={item.path} to={item.path} end={item.path === "/app"} className="nav-link">
                  <span className="nav-link-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.path === "/app" ? (
                    <span className="nav-link-content nav-link-content-version">
                      <span className="nav-link-label">{item.label}</span>
                      <span className="app-version-badge app-version-badge-sidebar">{APP_VERSION_LABEL}</span>
                    </span>
                  ) : (
                    <span className="nav-link-label">{item.label}</span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <div className="user-card">
          <strong>{sidebarUserName}</strong>
          <button type="button" onClick={logout}>
            Cerrar sesion
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
