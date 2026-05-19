import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { APP_VERSION_LABEL } from "@sige/contracts";

import { getNavigationForUser } from "../../config/modules";
import { useAuth } from "../auth/AuthContext";
import { openBriefManagerWindow, reportBriefManagerOpenError } from "../modules/openBriefManagerWindow";

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const userContext = user?.legacyTeam ?? user?.specificRole ?? user?.team ?? user?.email;
  const navigation = getNavigationForUser(user);

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
          <strong>{user?.displayName}</strong>
          <span>{userContext}</span>
          <small>@{user?.username}</small>
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
